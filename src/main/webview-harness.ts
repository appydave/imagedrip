import { join } from 'node:path';
import { WebContentsView, clipboard, session, type BrowserWindow } from 'electron';
import type { Logger } from '@appydave/core';
import type { ChatGPTSelectors } from './chatgpt-selectors.js';
import type { FileAuthor } from './file-author.js';
import { harvestImage } from './image-harvest.js';
import {
  WEBVIEW,
  type EngineProbeReport,
  type Point,
  type Rect,
  type WebviewInbound,
} from '../shared/ipc.js';

/**
 * WebviewHarness (spec §API) — embed a real, logged-in ChatGPT in a
 * `WebContentsView`, WRITE to it with synthesized OS-level input, and READ its DOM
 * via a trusted preload. No paid API; no macOS Accessibility/Screen-Recording grants
 * (input + read are in-process).
 *
 * Design invariants (spec §0):
 *   1. WRITE = `sendInputEvent` (real Chromium input pipeline → `event.isTrusted`),
 *      never JS `.value=`/dispatched events.
 *   2. READ = DOM only (MutationObserver in the preload) — invisible to the server.
 *   3. Mechanism, not policy — it exposes events + `feed()`; WHEN to feed next is the
 *      CadenceEngine's job (a separate module). Kept decoupled.
 */
export interface WebviewHarnessOptions {
  /** Host window — the view is added to its content view. */
  window: BrowserWindow;
  /** Persistent partition (login persists across restarts). */
  partition?: string;
  /** Start URL. */
  url?: string;
  /** The one swappable selector module (§4). */
  selectors: ChatGPTSelectors;
  /** Scoped, git-committed writer — the harvest target root (§5/§8). */
  fileAuthor: FileAuthor;
  /** Fire `onStall` if no `image-done` arrives within this cap after a feed. */
  stallMs?: number;
  logger?: Logger;
}

type ImageDoneCb = (e: { imageUrl: string; at: number }) => void;
type RateLimitCb = (e: { text: string; at: number }) => void;
type RefusedCb = (e: { at: number }) => void;
type StallCb = (e: { waitedMs: number }) => void;

const DEFAULT_PARTITION = 'persist:imagedrip-chatgpt';
const DEFAULT_URL = 'https://chatgpt.com/';
/**
 * How long to wait for an image before calling it a stall.
 *
 * Raised from 3 to 6 minutes on 2026-08-03: a real run of detailed character
 * sheets averaged ~80–120s per image, and the heaviest ones exceeded the old
 * 3-minute cap — so the runner declared a stall on images that were still
 * generating perfectly well, and the run halted every couple of prompts. A
 * stall is meant to catch a DEAD generation, not a slow one; erring long costs
 * a wait, erring short costs the whole run.
 */
const DEFAULT_STALL_MS = 6 * 60 * 1000;
const LOCATE_TIMEOUT_MS = 2000;
/**
 * Readiness must answer fast enough to sit in front of every `context.get`, and
 * a silent page is itself an answer (`indeterminate`) rather than something to
 * keep waiting on — so this is deliberately shorter than the locate timeout.
 */
const PROBE_TIMEOUT_MS = 1500;

export class WebviewHarness {
  private readonly opts: WebviewHarnessOptions;
  private readonly logger?: Logger;
  private view: WebContentsView | null = null;
  /** Runtime stall cap, derived from observed generations — see setStallMs. */
  private stallOverrideMs: number | null = null;
  /** True while the view is parked off-screen so a popover can be seen. */
  private parked = false;
  /** The rect the renderer last asked for — restored when un-parking. */
  private wantedBounds: Rect | null = null;

  private imageDoneCb?: ImageDoneCb;
  private rateLimitCb?: RateLimitCb;
  private refusedCb?: RefusedCb;
  private stallCb?: StallCb;

  // De-dupe image-done at main too (belt-and-suspenders over the preload, §2).
  private lastImageUrl: string | null = null;
  private feedAt = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRect: ((rect: Point | null) => void) | null = null;
  /**
   * Readiness gets its OWN slot, separate from `pendingRect`. Sharing one would
   * mean a probe arriving mid-`feed` steals the rect resolution and drops `feed`
   * into its paste-into-current-focus branch — the guard causing the bug.
   */
  private pendingProbe: ((probe: EngineProbeReport | null) => void) | null = null;

  constructor(options: WebviewHarnessOptions) {
    this.opts = options;
    this.logger = options.logger;
  }

  /** Absolute path to the bundled webview preload (electron-vite emits .mjs). */
  private preloadPath(): string {
    return join(__dirname, '../preload/webview-preload.mjs');
  }

  attach(bounds: Rect): void {
    if (this.view) {
      this.setBounds(bounds);
      return;
    }
    const partition = this.opts.partition ?? DEFAULT_PARTITION;

    // Present as plain Chrome BEFORE the first load.
    //
    // Electron's default UA carries `imagedrip/0.1.0` and `Electron/34.x`, and
    // that is enough for OpenAI's bot protection to serve the static shell and
    // your session cookie while quietly refusing the `/backend-api/*` XHRs.
    // The symptom is maddening precisely because it looks like a login that
    // worked: you are signed in as yourself, the chrome renders, and every list
    // that hydrates from an API — conversation history, the workspace switcher
    // — sits in skeleton placeholders forever. David hit this repeatedly:
    // "I've seen this particular problem happen before, and it's happening
    // again today… it looks like it's logged in as me, but it's not showing
    // correctly."
    //
    // Set on the SESSION, not just the view, so XHR/fetch, the service worker
    // and the in-session image harvest all agree on one identity. The Chrome
    // major is read from the running Chromium so it stays truthful as Electron
    // is upgraded, rather than drifting into a version that never existed.
    const chromeMajor = process.versions.chrome.split('.')[0];
    const userAgent =
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
      `(KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
    session.fromPartition(partition).setUserAgent(userAgent);
    this.logger?.info({ userAgent }, 'webview user agent pinned to plain Chrome');

    const view = new WebContentsView({
      webPreferences: {
        partition,
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        // sandbox:false for the ESM preload (AppyTron gotcha §8); security holds via
        // contextIsolation + no page leakage + the single namespaced channel.
        sandbox: false,
      },
    });
    this.view = view;
    this.wantedBounds = bounds;
    this.wireInbound(view);
    this.opts.window.contentView.addChildView(view);
    view.setBounds(bounds);
    void view.webContents.loadURL(this.opts.url ?? DEFAULT_URL);
    this.logger?.info('webview harness attached');
  }

  setBounds(bounds: Rect): void {
    // While parked, remember where the panel WANTS to be but don't apply it —
    // the renderer's ResizeObserver fires during layout changes and would
    // otherwise drag the view back on screen mid-popover.
    this.wantedBounds = bounds;
    if (this.parked) return;
    this.view?.setBounds(bounds);
  }

  /**
   * Show/hide the ChatGPT view without detaching it.
   *
   * A `WebContentsView` is a NATIVE view composited over the window — it paints
   * above every HTML element regardless of z-index, so any renderer popover
   * overlapping its rect is simply invisible. That silently swallowed the WP5
   * run-entry chooser (live UAT 2026-08-03: "something dropping down and
   * showing underneath ChatGPT").
   *
   * `setVisible(false)` alone did NOT reliably clear the native surface here, so
   * hiding also PARKS the view off-screen via setBounds — a path this app
   * already depends on and knows works. Belt and braces, because a popover you
   * cannot see is indistinguishable from a broken button.
   *
   * Hiding is not detaching: the page keeps running, the session and any
   * in-flight generation are untouched, and a run continues behind it.
   */
  setVisible(visible: boolean): void {
    const view = this.view;
    if (!view) return;
    if (visible) {
      this.parked = false;
      view.setVisible(true);
      if (this.wantedBounds) view.setBounds(this.wantedBounds);
      return;
    }
    this.parked = true;
    view.setVisible(false);
    // Park far off-screen at zero size — nothing left to composite over the UI.
    view.setBounds({ x: -20000, y: 0, width: 1, height: 1 });
  }

  async newConversation(): Promise<void> {
    if (!this.view) throw new Error('WebviewHarness: attach() before newConversation()');
    this.lastImageUrl = null;
    await this.view.webContents.loadURL(this.opts.selectors.newChatUrl);
  }

  /**
   * feed — submit one prompt via synthesized, human-signature input (spec §3):
   * clipboard → real mouse click on the composer → Cmd/Ctrl+V → Enter.
   */
  async feed(prompt: string): Promise<void> {
    const view = this.view;
    if (!view) throw new Error('WebviewHarness: attach() before feed()');

    clipboard.writeText(prompt);

    const rect = await this.locateInput();
    if (rect) this.click(rect);
    else this.logger?.warn('feed: composer rect not found — pasting into current focus');

    this.paste();
    this.submit();

    this.feedAt = Date.now();
    this.armStall();
    this.logger?.info({ chars: prompt.length }, 'fed prompt');
  }

  onImageDone(cb: ImageDoneCb): void {
    this.imageDoneCb = cb;
  }
  onRateLimit(cb: RateLimitCb): void {
    this.rateLimitCb = cb;
  }
  onRefused(cb: RefusedCb): void {
    this.refusedCb = cb;
  }
  onStall(cb: StallCb): void {
    this.stallCb = cb;
  }

  /** Fetch the finished image in-session and route it via FileAuthor (§5). */
  async harvest(imageUrl: string, relPath: string): Promise<string> {
    const view = this.view;
    if (!view) throw new Error('WebviewHarness: attach() before harvest()');
    const res = await harvestImage({
      session: view.webContents.session,
      fileAuthor: this.opts.fileAuthor,
      imageUrl,
      relPath,
      logger: this.logger,
    });
    return res.path;
  }

  stop(): void {
    this.clearStall();
    this.pendingRect = null;
    const view = this.view;
    if (view) {
      try {
        this.opts.window.contentView.removeChildView(view);
      } catch {
        // window may already be gone
      }
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    this.view = null;
    this.logger?.info('webview harness stopped (session intact)');
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private wireInbound(view: WebContentsView): void {
    // `webContents.ipc` scopes messages to THIS view (not global ipcMain).
    view.webContents.ipc.on(WEBVIEW.inbound, (_e, raw: WebviewInbound) => {
      switch (raw.type) {
        case 'input-rect':
          this.pendingRect?.(raw.rect);
          this.pendingRect = null;
          break;
        case 'engine-probe': {
          const { type: _type, ...probe } = raw;
          this.pendingProbe?.(probe);
          this.pendingProbe = null;
          break;
        }
        case 'image-done':
          if (raw.imageUrl && raw.imageUrl !== this.lastImageUrl) {
            this.lastImageUrl = raw.imageUrl;
            this.clearStall();
            // Measured generation time — the signal a CadenceEngine learns from (§5).
            const measuredMs = this.feedAt ? raw.at - this.feedAt : undefined;
            this.logger?.info({ measuredMs }, 'image done');
            this.imageDoneCb?.({ imageUrl: raw.imageUrl, at: raw.at });
          }
          break;
        case 'rate-limit':
          this.rateLimitCb?.({ text: raw.text, at: raw.at });
          break;
        case 'refused':
          this.refusedCb?.({ at: raw.at });
          break;
      }
    });
  }

  /** Is a ChatGPT view attached at all? Distinguishes "no engine" from "signed out". */
  get isAttached(): boolean {
    return this.view !== null;
  }

  /**
   * Ask the page whether it could accept a prompt — read-only, sends nothing.
   *
   * Resolves null when no view is attached or the preload does not answer in
   * time. Null means UNKNOWN, never "fine": `buildEngineReadiness` turns it into
   * an `indeterminate` verdict that blocks a run, because the alternative is
   * feeding a page nobody has confirmed.
   */
  probeEngine(): Promise<EngineProbeReport | null> {
    const view = this.view;
    if (!view) return Promise.resolve(null);
    return new Promise<EngineProbeReport | null>((resolve) => {
      let done = false;
      const finish = (probe: EngineProbeReport | null) => {
        if (done) return;
        done = true;
        this.pendingProbe = null;
        resolve(probe);
      };
      this.pendingProbe = finish;
      view.webContents.send(WEBVIEW.probeEngine);
      setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    });
  }

  private locateInput(): Promise<Point | null> {
    const view = this.view;
    if (!view) return Promise.resolve(null);
    return new Promise<Point | null>((resolve) => {
      let done = false;
      const finish = (rect: Point | null) => {
        if (done) return;
        done = true;
        resolve(rect);
      };
      this.pendingRect = finish;
      view.webContents.send(WEBVIEW.locateInput);
      setTimeout(() => finish(null), LOCATE_TIMEOUT_MS);
    });
  }

  private click(p: Point): void {
    const wc = this.view?.webContents;
    if (!wc) return;
    const base = { x: Math.round(p.x), y: Math.round(p.y), button: 'left' as const, clickCount: 1 };
    wc.sendInputEvent({ type: 'mouseDown', ...base });
    wc.sendInputEvent({ type: 'mouseUp', ...base });
  }

  private paste(): void {
    const wc = this.view?.webContents;
    if (!wc) return;
    // VERIFIED (probe/probe-feed.cjs, 2026-07-19): a synthesized Cmd/Ctrl+V via
    // `sendInputEvent` is a NO-OP into a contenteditable composer — the spec's
    // stated keystroke does not paste. `webContents.paste()` runs the real
    // Edit>Paste editing command and was observed to fire `paste` + `input` events
    // with `isTrusted === true`, so it upholds invariant #1 (trusted input, not JS
    // `.value=`) AND actually lands the text. This is the correct mechanism.
    // Select first so the paste REPLACES rather than appends. The composer is
    // not guaranteed empty: a submit that didn't take (the known
    // paste-without-enter symptom) leaves the previous text sitting there, and
    // the next paste concatenates onto it. Paste-over-selection is the same
    // trusted editing command, so invariant #1 still holds.
    wc.selectAll();
    wc.paste();
  }

  private submit(): void {
    const wc = this.view?.webContents;
    if (!wc) return;
    const modifiers = this.opts.selectors.submitKey === 'Cmd+Return'
      ? [process.platform === 'darwin' ? ('cmd' as const) : ('control' as const)]
      : [];
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers });
  }

  /**
   * Set the stall cap at runtime. The BatchRunner re-derives it from the
   * generations it has actually measured (`stall-budget.ts`), so this replaces
   * a constant that was previously guessed — and guessed wrong twice.
   */
  setStallMs(ms: number): void {
    this.stallOverrideMs = ms;
  }

  private armStall(): void {
    this.clearStall();
    const waited = this.stallOverrideMs ?? this.opts.stallMs ?? DEFAULT_STALL_MS;
    this.stallTimer = setTimeout(() => {
      this.stallCb?.({ waitedMs: waited });
    }, waited);
  }

  private clearStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }
}
