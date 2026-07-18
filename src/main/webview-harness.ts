import { join } from 'node:path';
import { WebContentsView, clipboard, type BrowserWindow } from 'electron';
import type { Logger } from '@appydave/core';
import type { ChatGPTSelectors } from './chatgpt-selectors.js';
import type { FileAuthor } from './file-author.js';
import { harvestImage } from './image-harvest.js';
import { WEBVIEW, type Point, type Rect, type WebviewInbound } from '../shared/ipc.js';

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
const DEFAULT_STALL_MS = 3 * 60 * 1000;
const LOCATE_TIMEOUT_MS = 2000;

export class WebviewHarness {
  private readonly opts: WebviewHarnessOptions;
  private readonly logger?: Logger;
  private view: WebContentsView | null = null;

  private imageDoneCb?: ImageDoneCb;
  private rateLimitCb?: RateLimitCb;
  private refusedCb?: RefusedCb;
  private stallCb?: StallCb;

  // De-dupe image-done at main too (belt-and-suspenders over the preload, §2).
  private lastImageUrl: string | null = null;
  private feedAt = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRect: ((rect: Point | null) => void) | null = null;

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
    const view = new WebContentsView({
      webPreferences: {
        partition: this.opts.partition ?? DEFAULT_PARTITION,
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        // sandbox:false for the ESM preload (AppyTron gotcha §8); security holds via
        // contextIsolation + no page leakage + the single namespaced channel.
        sandbox: false,
      },
    });
    this.view = view;
    this.wireInbound(view);
    this.opts.window.contentView.addChildView(view);
    view.setBounds(bounds);
    void view.webContents.loadURL(this.opts.url ?? DEFAULT_URL);
    this.logger?.info('webview harness attached');
  }

  setBounds(bounds: Rect): void {
    this.view?.setBounds(bounds);
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

  private armStall(): void {
    this.clearStall();
    const waited = this.opts.stallMs ?? DEFAULT_STALL_MS;
    this.stallTimer = setTimeout(() => {
      this.stallCb?.({ waitedMs: waited });
    }, waited);
  }

  private clearStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }
}
