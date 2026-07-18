/**
 * The typed IPC contract — the single source of truth for every channel that
 * crosses the renderer↔main boundary. Both preload (implements) and renderer
 * (consumes) import from here, so the surface stays in one place.
 */

export const IPC = {
  appInfo: 'app:info',
  ping: 'app:ping',
  counterGet: 'counter:get',
  counterIncrement: 'counter:increment',

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
