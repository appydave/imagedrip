/**
 * The typed IPC contract — the single source of truth for every channel that
 * crosses the renderer↔main boundary. Both preload (implements) and renderer
 * (consumes) import from here, so the surface stays in one place.
 */

import type { DomainState } from './domain';
import type { SnagInput, UatCounts, VerdictInput } from './live-uat';

export const IPC = {
  appInfo: 'app:info',
  ping: 'app:ping',
  counterGet: 'counter:get',
  counterIncrement: 'counter:increment',

  /**
   * ── ImageDrip: what the app is currently pointed at (v4 §9.3) ──
   * The one channel with no renderer client: it exists for the control surface,
   * so an agent can resolve "the last lot" before it writes anything. Registered
   * here rather than only as an HTTP route so `/v1/verbs` and `/v1/context`
   * cannot describe two different things.
   */
  contextGet: 'imagedrip:context:get',

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

  // ── ImageDrip: the brand repo (v3 WP2) — files on disk are the source of truth ──
  /** Native folder picker for a brand repo root (`~/dev/image-projects/i-<brand>`). */
  repoChooseRoot: 'imagedrip:repo:choose-root',
  /** Point the ACTIVE brand at a repo: import what's there, publish what isn't. */
  repoAttach: 'imagedrip:repo:attach',

  // ── ImageDrip: template identity (v3 WP1) — run-locked exactly like Brand ──
  templateCreate: 'imagedrip:template:create',
  /** Point the ACTIVE project at a template, or at none (null). */
  templateSwitch: 'imagedrip:template:switch',
  templateSave: 'imagedrip:template:save',

  // ── ImageDrip: project identity (WP1) — create/switch, output dir picker ──
  projectCreate: 'imagedrip:project:create',
  projectSwitch: 'imagedrip:project:switch',
  projectChooseOutputDir: 'imagedrip:project:choose-output-dir',
  /** Reveal the ACTIVE project's output folder in Finder. */
  projectRevealOutputDir: 'imagedrip:project:reveal-output-dir',

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
  /** Hide the native ChatGPT view so a renderer popover can be seen over it. */
  harnessSetVisible: 'imagedrip:harness:set-visible',
  harnessNewConversation: 'imagedrip:harness:new-conversation',
  harnessFeed: 'imagedrip:harness:feed',
  harnessStop: 'imagedrip:harness:stop',
  /** main → renderer push of harness events (image-done / rate-limit / refused / stall). */
  harnessEvent: 'imagedrip:harness:event',

  // ── Live UAT: the judgment sidecar (docs/live-uat.md) — never touches domain.json ──
  uatSnag: 'imagedrip:uat:snag',
  uatVerdict: 'imagedrip:uat:verdict',
  uatCounts: 'imagedrip:uat:counts',
  uatReveal: 'imagedrip:uat:reveal',
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
  /**
   * Every generation this run has measured, in order — the evidence behind the
   * stall budget. Kept so the operator can SEE the timings rather than trust a
   * single average: "we really should have that as a list somewhere visible…
   * we can't do it if we don't track it" (live UAT, 2026-08-03).
   */
  timings: { subject: string; ms: number }[];
  /**
   * The current stall cap (ms) — "when is a generation DEAD?". Driven by the
   * SLOWEST observation, because the cap has to clear the worst real case.
   */
  stallMs: number;
  /**
   * The current inter-image delay (ms) — "how long does a human pause between
   * asks?". Driven by the MEDIAN, because it tracks the typical case. A
   * different question from `stallMs`, and a different statistic.
   */
  cadence: { baseMs: number; jitterMs: number };
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
    importPrompts(input: {
      text: string;
      mode: 'replace' | 'add' | 'clear';
      /** How to cut the draft into prompts. Explicit, never inferred. */
      format?: 'lines' | 'blocks';
    }): Promise<DomainState>;
    /** Persist an edit to the active project (body and/or name — WP2 autosave). */
    saveProject(patch: { name?: string; body?: string; outputDir?: string }): Promise<DomainState>;
    /** Persist an edit to the active brand. Refused while a run is live (WP2). */
    saveBrand(patch: { name?: string; body?: string }): Promise<DomainState>;
    /** primer = compose(Brand, Template, Project) — posted once per conversation. */
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
    /** Reveal the active project's output folder in Finder. */
    revealOutputDir(): Promise<void>;
  };
  /** Brand identity (WP2). Brand is LOCKED while a run is live — a run-state lock. */
  brands: {
    create(input: { name: string }): Promise<DomainState>;
    switch(id: string): Promise<DomainState>;
  };
  /**
   * The brand repo (v3 WP2) — `~/dev/image-projects/i-<brand>`. Attaching moves
   * the source of truth onto disk: brands, templates, projects and queues become
   * files in git, and `domain.json` demotes to an index of pointers.
   */
  repo: {
    /** Native folder picker for a repo root; null if cancelled. */
    chooseRoot(): Promise<string | null>;
    /**
     * Point the active brand at a repo. Imports everything already there (disk
     * wins) and publishes anything that only existed in `domain.json`.
     * Refused while a run is live.
     */
    attach(root: string): Promise<DomainState>;
  };
  /**
   * The Template library (v3 WP1) — the artifact KIND, reused across brands and
   * projects. Locked while a run is live for the same reason Brand is: changing
   * the recipe mid-run splits one run across two different artifacts.
   */
  templates: {
    create(input: { name: string; importFormat?: 'lines' | 'blocks' }): Promise<DomainState>;
    /** Point the active project at a template — `null` means "no template". */
    switch(id: string | null): Promise<DomainState>;
    save(patch: {
      name?: string;
      body?: string;
      importFormat?: 'lines' | 'blocks';
      listPrompt?: string;
      negatives?: string;
    }): Promise<DomainState>;
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
  /**
   * Live UAT (`docs/live-uat.md`) — capture only. Two anchors, two stores, one
   * control. Writes go to a sidecar under userData; nothing here can change what
   * the app does, and acting on the pile is a separate session, not a feature.
   */
  uat: {
    /** Flag cockpit friction against a screen region. */
    snag(input: SnagInput): Promise<void>;
    /** Judge one or many harvested images; main resolves the producer snapshot. */
    verdict(input: VerdictInput): Promise<void>;
    counts(): Promise<UatCounts>;
    /** Reveal the corpus folder in Finder. */
    reveal(): Promise<void>;
  };
  /** Read a harvested image (path relative to the harvest root) as a data URL. */
  harvestThumb(relPath: string): Promise<string | null>;
  /** Create + position the ChatGPT view (bounds = the renderer's reserved panel rect). */
  attach(bounds: Rect): Promise<void>;
  /** Re-position on window resize / panel layout change. */
  setBounds(bounds: Rect): Promise<void>;
  /**
   * Show/hide the native ChatGPT view. It composites ABOVE all HTML, so any
   * popover overlapping it is invisible until the view is hidden. Hiding does
   * not detach — the session and any running generation continue.
   */
  setPanelVisible(visible: boolean): Promise<void>;
  /** Open a fresh chat before a batch. */
  newConversation(): Promise<void>;
  /** Submit one prompt via synthesized clipboard-paste + Enter. */
  feed(prompt: string): Promise<void>;
  /** Halt: detach the view, dispose observers/timers. Session (login) stays intact. */
  stop(): Promise<void>;
  /** Subscribe to harness events; returns an unsubscribe fn. */
  onEvent(cb: (e: HarnessEvent) => void): () => void;
}
