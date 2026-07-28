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
  domainSaveBrand: 'imagedrip:domain:save-brand',
  domainComposePrimer: 'imagedrip:domain:compose-primer',
  domainResetRun: 'imagedrip:domain:reset-run',

  // ── ImageDrip: brand identity (WP2) — Brand is run-locked, not read-only ──
  brandCreate: 'imagedrip:brand:create',
  brandSwitch: 'imagedrip:brand:switch',

  // ── ImageDrip: project identity (WP1) — create/switch, output dir picker ──
  projectCreate: 'imagedrip:project:create',
  projectSwitch: 'imagedrip:project:switch',
  projectChooseOutputDir: 'imagedrip:project:choose-output-dir',

  // ── ImageDrip: run history (WP1) — browse previous runs of the active project ──
  runsList: 'imagedrip:runs:list',
  runsManifest: 'imagedrip:runs:manifest',
  runsReveal: 'imagedrip:runs:reveal',

  // ── ImageDrip: the Auto run (Batch Runner) ──
  runStart: 'imagedrip:run:start',
  runPause: 'imagedrip:run:pause',
  runResume: 'imagedrip:run:resume',
  runStop: 'imagedrip:run:stop',
  /** Main-process truth: is the LIVE conversation primed/touched? (WP5 #8) */
  runChatState: 'imagedrip:run:chat-state',
  /** Dial-in (WP4): post the primer into the LIVE chat and submit. */
  runInjectPrimer: 'imagedrip:run:inject-primer',
  /** Dial-in (WP4): feed ONE queued prompt and harvest its image. */
  runInjectPrompt: 'imagedrip:run:inject-prompt',
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
  /**
   * How the run enters the chat (WP5):
   *   'continue' — reuse the CURRENT conversation as-is. No new chat, no primer:
   *                the dialled-in refinements stay in effect. Default coming out
   *                of Dial-in.
   *   'fresh'    — new conversation → post primer → feed (v1 behaviour).
   * Defaults to 'fresh' when omitted.
   */
  entry?: 'continue' | 'fresh';
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

/** One prompt as it ran — recorded in the run manifest (WP1). */
export interface RunPromptRecord {
  id: string;
  subject: string;
  text: string;
  status: 'queued' | 'harvested' | 'refused';
  /** Harvested filename, relative to the run folder (e.g. `kangaroo.png`). */
  file?: string;
  /** Feed → image-done, ms. */
  generationMs?: number;
}

/**
 * `<outputDir>/<run-id>/manifest.json` — everything needed to reproduce or
 * explain a run: the exact primer as posted, every prompt with its outcome,
 * re-prime boundaries, and any pauses (rate-limit / stall).
 */
export interface RunManifest {
  runId: string;
  projectName: string;
  themeName: string;
  /** How the run was driven: the Auto loop, or manual Dial-in injects (WP4). */
  mode?: 'auto' | 'dial-in';
  startedAt: number;
  finishedAt?: number;
  outcome?: 'complete' | 'stopped';
  /** The exact composed primer text (brand body + project body as posted). */
  primer: string;
  prompts: RunPromptRecord[];
  counts: { total: number; harvested: number; refused: number };
  /** Harvested-counts at which a mid-run re-prime happened. */
  reprimes: number[];
  /** Rate-limit / stall pauses surfaced during the run. */
  pauses: { at: number; reason: string }[];
}

/** One row in the run-history list (derived from each run's manifest). */
export interface RunSummary {
  runId: string;
  themeName: string;
  mode?: 'auto' | 'dial-in';
  startedAt: number;
  finishedAt?: number;
  outcome?: 'complete' | 'stopped';
  harvested: number;
  total: number;
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
    /** Import a prompt list (WP3): `add` appends after the existing queue;
     *  `replace` drops queued items — harvested prompts always survive. */
    importPrompts(input: { text: string; mode: 'replace' | 'add' }): Promise<DomainState>;
    /** Persist an edit to the active project (body and/or name — WP2 autosave). */
    saveProject(patch: { name?: string; body?: string }): Promise<DomainState>;
    /** Persist an edit to the active brand. Refused while a run is live (WP2). */
    saveBrand(patch: { name?: string; body?: string }): Promise<DomainState>;
    /** primer = compose(Brand, Project) — the text posted once per conversation. */
    composePrimer(): Promise<string>;
    /** Re-queue every prompt so the theme can be run again; returns the new state. */
    resetRun(): Promise<DomainState>;
  };
  /**
   * Project identity (WP1). A project is not real until created here — the
   * renderer keeps "new project" as a draft; nothing persists until Create.
   */
  projects: {
    /** Create + activate a project. `outputDir` defaults to ~/Pictures/ImageDrip/<slug>. */
    create(input: { name: string; outputDir?: string }): Promise<DomainState>;
    /** Activate a saved project. Refused while a run is live. */
    switch(id: string): Promise<DomainState>;
    /** Native folder picker for a project output dir; null if cancelled. */
    chooseOutputDir(): Promise<string | null>;
  };
  /** Brand identity (WP2). Brand is LOCKED while a run is live — a run-state lock. */
  brands: {
    create(input: { name: string }): Promise<DomainState>;
    switch(id: string): Promise<DomainState>;
  };
  /** Run history (WP1) — previous runs of the ACTIVE project, from their manifests. */
  runs: {
    list(): Promise<RunSummary[]>;
    manifest(runId: string): Promise<RunManifest | null>;
    /** Reveal the run's folder in Finder. */
    reveal(runId: string): Promise<void>;
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
    /** Main-process truth for the run-entry default: chat primed/touched? */
    chatState(): Promise<{ primed: boolean }>;
    /** Dial-in (WP4): "Initialise project" — primer into the live chat + submit. */
    injectPrimer(): Promise<void>;
    /** Dial-in (WP4): inject one queued prompt; it harvests into the dial-in run. */
    injectPrompt(promptId: string): Promise<void>;
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
