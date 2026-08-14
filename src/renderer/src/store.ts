import { create } from 'zustand';
import type { DomainState, ImportFormat, ImportMode } from '@shared/domain';
import type { RunManifest, RunStatus, RunSummary } from '@shared/ipc';
import type { ChatEvent } from '@shared/chat';
import { uatEnabled, type UatCounts, type Verdict, type VerdictInput } from '@shared/live-uat';

export type Mode = 'dial-in' | 'auto';

/** Which half of the CONTEXT column is showing (v4 WP4 §5). */
export type CtxTab = 'context' | 'chat';

/**
 * One exchange in the chat transcript.
 *
 * Assembled in the STORE rather than in the pane, for one reason: the frames
 * arrive on a push channel whether or not the Chat tab is mounted. Holding the
 * transcript in a component would lose whatever streamed while the user was
 * looking at Context, or had the whole column collapsed — and a reply that
 * silently went missing is exactly the failure this repo refuses to ship.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Extended thinking, rendered collapsed (v4 §3). */
  thinking: string;
  /** Verb calls, in order. The transcript is also the audit trail. */
  tools: { name: string; failed: boolean }[];
}

/** A previous run opened from history (WP1) — manifest arrives async. */
export interface RunView {
  runId: string;
  manifest: RunManifest | null;
}

interface AppState {
  domain: DomainState | null;
  status: RunStatus | null;
  ctxOpen: boolean;
  mode: Mode;
  /** Transient copy-confirmation label ("primer copied" etc.). */
  flash: string | null;
  /** Run history of the ACTIVE project; null until first load. */
  runs: RunSummary[] | null;
  /** Main-process truth (advisory-1 #8): is the live chat primed/touched?
   *  Queried at decision time — never guessed from renderer memory. */
  fetchChatPrimed: () => Promise<boolean>;
  /** When set, the lanes area shows this previous run instead of the live queue. */
  runView: RunView | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  importPrompts: (text: string, mode: ImportMode, format?: ImportFormat) => Promise<void>;
  /** Autosave path (WP2) — resolves true on success, false when refused. */
  saveProject: (patch: { name?: string; body?: string; outputDir?: string }) => Promise<boolean>;
  /** Autosave path (WP2) — false when the run-lock refused the edit. */
  saveBrand: (patch: { name?: string; body?: string }) => Promise<boolean>;
  createBrand: (name: string) => Promise<void>;
  /** `null` selects "(none)" — a primer with no house style. */
  switchBrand: (id: string | null) => Promise<void>;
  /** Autosave path for the TEMPLATE card — false when the run-lock refused it. */
  saveTemplate: (patch: {
    name?: string;
    body?: string;
    importFormat?: ImportFormat;
    listPrompt?: string;
    promptShape?: string;
    negatives?: string;
  }) => Promise<boolean>;
  createTemplate: (name: string) => Promise<void>;
  /** Point the active project at a template — null means "no template". */
  switchTemplate: (id: string | null) => Promise<void>;

  /** WP2 — pick a brand repo folder; null if cancelled. */
  chooseRepoRoot: () => Promise<string | null>;
  /** WP2 — attach the active brand to a repo (import what's there, publish what isn't). */
  attachRepo: (root: string) => Promise<void>;
  copyPrimer: () => Promise<void>;
  copyNextPrompt: () => Promise<void>;
  copyText: (text: string, label: string) => Promise<void>;
  resetRun: () => Promise<void>;

  createProject: (name: string, outputDir?: string) => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  chooseOutputDir: () => Promise<string | null>;

  loadRuns: () => Promise<void>;
  openRun: (runId: string) => Promise<void>;
  closeRun: () => void;
  revealRun: (runId: string) => void;

  /** entry (WP5): 'continue' keeps the dialled-in chat; 'fresh' opens a new one. */
  startRun: (entry: 'continue' | 'fresh') => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  stopRun: () => Promise<void>;
  /** Dial-in (WP4): primer into the live chat + submit — "Initialise project". */
  injectPrimer: () => Promise<void>;
  /** Dial-in (WP4): inject one queued prompt; harvests into the dial-in run. */
  injectPrompt: (promptId: string) => Promise<void>;

  setCtx: (open: boolean) => void;
  setMode: (mode: Mode) => void;

  // ── v4 WP4: the resident chat operator ──
  /** Which half of the CONTEXT column is showing; persisted across restarts. */
  ctxTab: CtxTab;
  setCtxTab: (tab: CtxTab) => void;
  /** The conversation so far. Survives tab switches and a collapsed column. */
  chatTurns: ChatTurn[];
  /** The CLI's own account of what it is doing (`thinking`, `done`, …). */
  chatPhase: string;
  /** A turn is in flight — the input is disabled and the send button spins. */
  chatBusy: boolean;
  /** A refusal worth reading, e.g. the CLI cannot be contained (D2). */
  chatError: string | null;
  /** Running cost of this conversation, on the user's OWN subscription. */
  chatCostUsd: number | null;
  /** Fold one batch of coalesced stream frames into the transcript. */
  applyChatEvents: (events: ChatEvent[]) => void;
  sendChat: (prompt: string) => Promise<void>;
  /** Drop the CLI child and the transcript with it. */
  resetChat: () => Promise<void>;

  /** Live UAT gate (docs/live-uat.md). ON by default (A4); persisted across restarts. */
  uat: boolean;
  uatCounts: UatCounts | null;
  setUat: (on: boolean) => void;
  refreshUatCounts: () => Promise<void>;
  /** Raise a screen-anchored snag. `mode`/`phase` are filled from live state. */
  snag: (input: { region: string; verdict: Verdict; note: string; snapshot: string }) => Promise<void>;
  /** Judge harvested images; main resolves the producer snapshot from the manifest. */
  verdict: (input: VerdictInput) => Promise<void>;
}

const UAT_KEY = 'imagedrip.uat';
const CTX_TAB_KEY = 'imagedrip.ctxTab';

/** Chat is the default; anything unrecognised falls back to it, not to a crash. */
function ctxTabOf(stored: string | null): CtxTab {
  return stored === 'context' ? 'context' : 'chat';
}

async function copy(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

let subscribed = false;

export const useAppStore = create<AppState>((set, get) => ({
  domain: null,
  status: null,
  ctxOpen: false,
  mode: 'auto',
  flash: null,
  runs: null,
  runView: null,

  fetchChatPrimed: async () => {
    try {
      return (await window.imagedrip.run.chatState()).primed;
    } catch {
      return false;
    }
  },

  init: async () => {
    set({ domain: await window.imagedrip.domain.get() });
    void get().loadRuns();
    if (get().uat) void get().refreshUatCounts();
    if (subscribed) return;
    subscribed = true;
    // Live run status. On each harvest / terminal transition, re-read the domain so
    // the QUEUED → HARVESTED lanes reflect what actually landed on disk.
    window.imagedrip.run.onStatus((status) => {
      set({ status });
      if (['harvested', 'done', 'stopped'].includes(status.phase)) void get().refresh();
      // A finished/stopped run just wrote its manifest — refresh history.
      if (['done', 'stopped'].includes(status.phase)) void get().loadRuns();
    });
    // v4 WP4 — chat stream frames, subscribed HERE and not in the pane: they
    // arrive whether or not the Chat tab is mounted, and a reply that streamed
    // while the user was looking at Context must still be in the transcript
    // when they come back.
    window.imagedrip.chat.onEvent((events) => get().applyChatEvents(events));
  },
  refresh: async () => {
    set({ domain: await window.imagedrip.domain.get() });
  },
  importPrompts: async (text, mode, format) => {
    const before = get().domain?.theme.prompts.filter((p) => p.status === 'queued').length ?? 0;
    const domain = await window.imagedrip.domain.importPrompts({ text, mode, format });
    const after = domain.theme.prompts.filter((p) => p.status === 'queued').length;
    set({
      domain,
      flash:
        mode === 'add'
          ? `added ${after - before} — ${after} queued`
          : mode === 'clear'
            ? `cleared ${before} queued — harvested kept`
            : `replaced ${before} queued with ${after}`,
    });
  },
  // Autosave feedback lives in the per-card saved/unsaved indicator, not the
  // footer flash — a flash every debounce would be noise (WP2).
  saveProject: async (patch) => {
    try {
      set({ domain: await window.imagedrip.domain.saveProject(patch) });
      return true;
    } catch {
      set({ flash: 'project save failed' });
      return false;
    }
  },
  saveBrand: async (patch) => {
    try {
      set({ domain: await window.imagedrip.domain.saveBrand(patch) });
      return true;
    } catch {
      set({ flash: 'brand is locked while a run is live' });
      return false;
    }
  },
  createBrand: async (name) => {
    try {
      set({ domain: await window.imagedrip.brands.create({ name }), flash: `brand "${name}" created` });
    } catch {
      set({ flash: 'brand is locked while a run is live' });
    }
  },
  switchBrand: async (id) => {
    try {
      set({ domain: await window.imagedrip.brands.switch(id) });
    } catch {
      set({ flash: 'brand is locked while a run is live' });
    }
  },
  saveTemplate: async (patch) => {
    try {
      set({ domain: await window.imagedrip.templates.save(patch) });
      return true;
    } catch {
      set({ flash: 'template is locked while a run is live' });
      return false;
    }
  },
  createTemplate: async (name) => {
    try {
      set({
        domain: await window.imagedrip.templates.create({ name }),
        flash: `template "${name}" created`,
      });
    } catch {
      set({ flash: 'template is locked while a run is live' });
    }
  },
  switchTemplate: async (id) => {
    try {
      set({ domain: await window.imagedrip.templates.switch(id) });
    } catch {
      set({ flash: 'template is locked while a run is live' });
    }
  },

  chooseRepoRoot: () => window.imagedrip.repo.chooseRoot(),
  attachRepo: async (root) => {
    try {
      // The repo can bring in projects and templates that were not here before,
      // so the run history has to be re-read alongside the domain.
      set({ domain: await window.imagedrip.repo.attach(root), runs: null, runView: null });
      void get().loadRuns();
      set({ flash: 'repo attached — files on disk are now the source of truth' });
    } catch (err) {
      set({ flash: err instanceof Error ? err.message : 'repo attach failed' });
    }
  },
  copyPrimer: async () => {
    await copy(await window.imagedrip.domain.composePrimer());
    set({ flash: 'primer copied' });
  },
  copyNextPrompt: async () => {
    const next = get().domain?.theme.prompts.find((p) => p.status === 'queued');
    if (!next) return set({ flash: 'queue empty' });
    await copy(next.text);
    set({ flash: `copied "${next.subject}"` });
  },
  copyText: async (text, label) => {
    await copy(text);
    set({ flash: label });
  },
  resetRun: async () => {
    set({ domain: await window.imagedrip.domain.resetRun(), status: null, flash: 're-queued' });
  },

  // ── project identity (WP1). "New project" is a renderer draft until create. ──
  createProject: async (name, outputDir) => {
    set({
      domain: await window.imagedrip.projects.create({ name, outputDir }),
      runs: null,
      runView: null,
      status: null,
      flash: `project "${name}" created`,
    });
    void get().loadRuns();
  },
  switchProject: async (id) => {
    try {
      set({
        domain: await window.imagedrip.projects.switch(id),
        runs: null,
        runView: null,
        status: null,
      });
      void get().loadRuns();
    } catch {
      set({ flash: 'stop the run before switching projects' });
    }
  },
  chooseOutputDir: () => window.imagedrip.projects.chooseOutputDir(),

  // ── run history (WP1) ──
  loadRuns: async () => {
    set({ runs: await window.imagedrip.runs.list() });
  },
  openRun: async (runId) => {
    set({ runView: { runId, manifest: null } });
    const manifest = await window.imagedrip.runs.manifest(runId);
    // Only apply if the user hasn't navigated away meanwhile.
    if (get().runView?.runId === runId) set({ runView: { runId, manifest } });
  },
  closeRun: () => set({ runView: null }),
  revealRun: (runId) => void window.imagedrip.runs.reveal(runId),

  startRun: async (entry) => {
    try {
      await window.imagedrip.run.start({ entry });
    } catch (err) {
      set({ flash: err instanceof Error ? err.message : 'run failed to start' });
    }
  },
  pauseRun: async () => {
    await window.imagedrip.run.pause();
  },
  resumeRun: async () => {
    await window.imagedrip.run.resume();
  },
  // STOP halts the loop; the ChatGPT view (login) stays attached so you can inspect.
  stopRun: async () => {
    await window.imagedrip.run.stop();
    set({ flash: 'stopped' });
  },
  injectPrimer: async () => {
    try {
      await window.imagedrip.run.injectPrimer();
      set({ flash: 'primer sent to ChatGPT — project initialised' });
    } catch (err) {
      set({ flash: err instanceof Error ? err.message : 'inject failed' });
    }
  },
  injectPrompt: async (promptId) => {
    try {
      await window.imagedrip.run.injectPrompt(promptId);
    } catch (err) {
      set({ flash: err instanceof Error ? err.message : 'inject failed' });
    }
  },

  setCtx: (open) => set({ ctxOpen: open }),
  setMode: (mode) => set({ mode }),

  // ── v4 WP4: the resident chat operator ──
  //
  // The North Star (ratified 2026-08-08) puts the chat first: *"Fill in a few
  // fields — or just say it in chat"*, and *"typing into controls by hand is
  // the fallback, not the design."* So Chat is the DEFAULT tab. The choice is
  // remembered, so anyone who disagrees pays for it exactly once.
  ctxTab: ctxTabOf(localStorage.getItem(CTX_TAB_KEY)),
  setCtxTab: (tab) => {
    localStorage.setItem(CTX_TAB_KEY, tab);
    set({ ctxTab: tab });
  },
  chatTurns: [],
  chatPhase: 'idle',
  chatBusy: false,
  chatError: null,
  chatCostUsd: null,

  applyChatEvents: (events) => {
    const turns = [...get().chatTurns];
    let phase = get().chatPhase;
    let cost = get().chatCostUsd;

    /** The assistant turn currently being written into, created on demand. */
    const current = (): ChatTurn => {
      const last = turns[turns.length - 1];
      if (last?.role === 'assistant') return last;
      const fresh: ChatTurn = { role: 'assistant', text: '', thinking: '', tools: [] };
      turns.push(fresh);
      return fresh;
    };

    for (const e of events) {
      switch (e.type) {
        case 'text_delta':
          current().text += e.text;
          break;
        case 'thinking_delta':
          current().thinking += e.text;
          break;
        case 'tool_use':
          current().tools.push({ name: e.name, failed: false });
          break;
        case 'tool_result': {
          // Mark the most recent unresolved call. Names are not unique across a
          // turn, and the parser guarantees one tool_use per call in order.
          const tools = current().tools;
          if (e.is_error && tools.length) tools[tools.length - 1].failed = true;
          break;
        }
        case 'status':
          phase = e.status;
          break;
        case 'usage':
          if (e.costUsd !== null) cost = e.costUsd;
          break;
      }
    }
    // Replace the last turn object so React sees a new reference.
    set({ chatTurns: turns.map((t, i) => (i === turns.length - 1 ? { ...t } : t)), chatPhase: phase, chatCostUsd: cost });
  },

  sendChat: async (prompt) => {
    const text = prompt.trim();
    if (!text || get().chatBusy) return;
    set({
      chatTurns: [...get().chatTurns, { role: 'user', text, thinking: '', tools: [] }],
      chatBusy: true,
      chatError: null,
      chatPhase: 'starting',
    });
    try {
      await window.imagedrip.chat.send(text);
    } catch (err) {
      // Shown verbatim: a containment refusal is meant to be READ, not retried.
      set({ chatError: err instanceof Error ? err.message : String(err), chatPhase: 'refused' });
    } finally {
      set({ chatBusy: false });
      // The domain almost certainly moved — the whole point of the chat is that
      // it edits the fields the other panes are showing.
      void get().refresh();
    }
  },

  resetChat: async () => {
    await window.imagedrip.chat.stop().catch(() => undefined);
    set({ chatTurns: [], chatPhase: 'idle', chatError: null, chatCostUsd: null });
  },

  // ── Live UAT (docs/live-uat.md) — capture only. These calls must never be
  // able to change what the app does; the feedback channel is separate from the
  // decision channel by construction (they don't touch domain.json).
  uat: uatEnabled(localStorage.getItem(UAT_KEY)),
  uatCounts: null,
  setUat: (on) => {
    localStorage.setItem(UAT_KEY, on ? 'on' : 'off');
    set({ uat: on });
    if (on) void get().refreshUatCounts();
  },
  refreshUatCounts: async () => {
    set({ uatCounts: await window.imagedrip.uat.counts() });
  },
  snag: async (input) => {
    await window.imagedrip.uat.snag({
      ...input,
      mode: get().mode,
      phase: get().status?.phase ?? 'idle',
    });
    set({ flash: `⚑ snagged: ${input.region}` });
    void get().refreshUatCounts();
  },
  verdict: async (input) => {
    await window.imagedrip.uat.verdict(input);
    set({ flash: `⚑ judged ${input.items.length} image${input.items.length === 1 ? '' : 's'}` });
    void get().refreshUatCounts();
  },
}));
