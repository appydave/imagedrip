/**
 * The typed IPC contract — the single source of truth for every channel that
 * crosses the renderer↔main boundary. Both preload (implements) and renderer
 * (consumes) import from here, so the surface stays in one place.
 */

import type { DomainState } from './domain';

export const IPC = {
  appInfo: 'app:info',
  ping: 'app:ping',
  counterGet: 'counter:get',
  counterIncrement: 'counter:increment',

  // ── ImageDrip: renderer → main domain (Brand/Project/Theme) — human path ──
  domainGet: 'imagedrip:domain:get',
  domainImportPrompts: 'imagedrip:domain:import-prompts',
  domainSaveProject: 'imagedrip:domain:save-project',
  domainComposePrimer: 'imagedrip:domain:compose-primer',
  domainResetRun: 'imagedrip:domain:reset-run',

  // ── ImageDrip: the Auto run (Batch Runner) ──
  runStart: 'imagedrip:run:start',
  runPause: 'imagedrip:run:pause',
  runResume: 'imagedrip:run:resume',
  runStop: 'imagedrip:run:stop',
  /** main → renderer push of run status snapshots. */
  runStatus: 'imagedrip:run:status',
  /** Read a harvested image (rel to the harvest root) → data URL for the grid. */
  harvestThumb: 'imagedrip:harvest:thumb',

  // ── ImageDrip: renderer → main harness control (window.imagedrip.*) ──
  harnessAttach: 'imagedrip:harness:attach',
  harnessSetBounds: 'imagedrip:harness:set-bounds',
  harnessNewConversation: 'imagedrip:harness:new-conversation',
  harnessFeed: 'imagedrip:harness:feed',
  harnessStop: 'imagedrip:harness:stop',
  /** main → renderer push of harness events (image-done / rate-limit / refused / stall). */
  harnessEvent: 'imagedrip:harness:event',
} as const;

/**
 * ── Webview view ↔ main channels (NOT renderer-facing) ──
 * These carry traffic between the ChatGPT `WebContentsView`'s trusted preload
 * (`webview-preload.ts`) and the main process. They never reach the renderer and
 * are never exposed on `window`. Kept here so preload + main share one contract.
 */
export const WEBVIEW = {
  /** preload → main: a single namespaced inbound channel (see WebviewInbound). */
  inbound: 'imagedrip:webview',
  /** main → preload: "report the composer input rect for a synthesized click". */
  locateInput: 'imagedrip:locate-input',
} as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The discriminated union the webview preload sends on `WEBVIEW.inbound`.
 * Main de-bounces `image-done` (keyed by imageUrl) — the DOM settles in bursts.
 */
export type WebviewInbound =
  | { type: 'image-done'; imageUrl: string; at: number }
  | { type: 'rate-limit'; text: string; at: number }
  | { type: 'refused'; at: number }
  | { type: 'input-rect'; rect: Point | null };

/** Harness events pushed to the renderer on `IPC.harnessEvent`. */
export type HarnessEvent =
  | { type: 'image-done'; imageUrl: string; savedPath?: string; at: number }
  | { type: 'rate-limit'; text: string; at: number }
  | { type: 'refused'; at: number }
  | { type: 'stall'; waitedMs: number }
  | { type: 'stopped'; at: number };

/** Tuning for one Auto run (all optional — the runner has conservative defaults). */
export interface RunConfig {
  /** Images per conversation before a re-prime (~15–20). */
  chunkSize?: number;
  /** Base delay between images (ms). */
  cadenceBaseMs?: number;
  /** Random jitter added to the base delay (ms). */
  cadenceJitterMs?: number;
  /** Pause after posting the primer, so ChatGPT ingests it (ms). */
  primerSettleMs?: number;
  /** Pause after opening a fresh chat, so it hydrates (ms). */
  loadSettleMs?: number;
}

export type RunPhase =
  | 'idle'
  | 'priming'
  | 'feeding'
  | 'awaiting'
  | 'harvested'
  | 'waiting'
  | 'paused'
  | 'stopped'
  | 'done';

/** A snapshot of the Auto run, pushed to the renderer on every transition. */
export interface RunStatus {
  phase: RunPhase;
  total: number;
  harvested: number;
  currentIndex: number;
  currentSubject: string | null;
  /** Images until the next re-prime. */
  reprimeInImages: number;
  /** Rolling average generation time (ms), or null before the first image. */
  avgMs: number | null;
  /** When `waiting`, ms until the next feed (for a live countdown). */
  nextFeedInMs: number | null;
  /** Human-readable note (pause reason, refusal skip, harvest error). */
  note?: string;
  at: number;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: NodeJS.Platform;
}

/** The API exposed to the renderer on `window.appytron`. */
export interface AppytronApi {
  getAppInfo(): Promise<AppInfo>;
  ping(message: string): Promise<string>;
  /** Persistent counter — proves @appydave/core Store survives restarts. */
  counter: {
    get(): Promise<number>;
    increment(): Promise<number>;
  };
}

/**
 * The ImageDrip API exposed to the renderer on `window.imagedrip`.
 * Thin control surface over the WebviewHarness — the renderer drives the batch,
 * main owns the ChatGPT view. `relPath` targets are validated in main (FileAuthor).
 */
export interface ImagedripApi {
  /**
   * The layered domain (Brand 🔒 / Project ✎ / Theme queue) — the human path.
   * Provider-agnostic; touches no network. Run wiring (feed/harvest) is separate.
   */
  domain: {
    /** Read the whole persisted domain document. */
    get(): Promise<DomainState>;
    /** Replace the theme queue from a pasted prompt list; returns the new state. */
    importPrompts(text: string): Promise<DomainState>;
    /** Persist an edit to Project.md; returns the new state. */
    saveProject(body: string): Promise<DomainState>;
    /** primer = compose(Brand, Project) — the text posted once per conversation. */
    composePrimer(): Promise<string>;
    /** Re-queue every prompt so the theme can be run again; returns the new state. */
    resetRun(): Promise<DomainState>;
  };
  /**
   * The Auto run (Batch Runner): prime → drip → detect → harvest → route → re-prime.
   * The risky chain — feeds ChatGPT. Gated on rate-limit; STOP halts cleanly.
   */
  run: {
    start(config?: RunConfig): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    /** Subscribe to run status snapshots; returns an unsubscribe fn. */
    onStatus(cb: (s: RunStatus) => void): () => void;
  };
  /** Read a harvested image (path relative to the harvest root) as a data URL. */
  harvestThumb(relPath: string): Promise<string | null>;
  /** Create + position the ChatGPT view (bounds = the renderer's reserved panel rect). */
  attach(bounds: Rect): Promise<void>;
  /** Re-position on window resize / panel layout change. */
  setBounds(bounds: Rect): Promise<void>;
  /** Open a fresh chat before a batch. */
  newConversation(): Promise<void>;
  /** Submit one prompt via synthesized clipboard-paste + Enter. */
  feed(prompt: string): Promise<void>;
  /** Halt: detach the view, dispose observers/timers. Session (login) stays intact. */
  stop(): Promise<void>;
  /** Subscribe to harness events; returns an unsubscribe fn. */
  onEvent(cb: (e: HarnessEvent) => void): () => void;
}
