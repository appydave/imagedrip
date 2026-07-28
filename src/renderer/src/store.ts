import { create } from 'zustand';
import type { DomainState, ImportMode } from '@shared/domain';
import type { RunManifest, RunStatus, RunSummary } from '@shared/ipc';

export type Mode = 'dial-in' | 'auto';

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
  /** When set, the lanes area shows this previous run instead of the live queue. */
  runView: RunView | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  importPrompts: (text: string, mode: ImportMode) => Promise<void>;
  /** Autosave path (WP2) — resolves true on success, false when refused. */
  saveProject: (patch: { name?: string; body?: string }) => Promise<boolean>;
  /** Autosave path (WP2) — false when the run-lock refused the edit. */
  saveBrand: (patch: { name?: string; body?: string }) => Promise<boolean>;
  createBrand: (name: string) => Promise<void>;
  switchBrand: (id: string) => Promise<void>;
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

  startRun: () => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  stopRun: () => Promise<void>;

  setCtx: (open: boolean) => void;
  setMode: (mode: Mode) => void;
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

  init: async () => {
    set({ domain: await window.imagedrip.domain.get() });
    void get().loadRuns();
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
  },
  refresh: async () => {
    set({ domain: await window.imagedrip.domain.get() });
  },
  importPrompts: async (text, mode) => {
    const before = get().domain?.theme.prompts.filter((p) => p.status === 'queued').length ?? 0;
    const domain = await window.imagedrip.domain.importPrompts({ text, mode });
    const after = domain.theme.prompts.filter((p) => p.status === 'queued').length;
    set({
      domain,
      flash:
        mode === 'add'
          ? `added ${after - before} — ${after} queued`
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

  startRun: async () => {
    await window.imagedrip.run.start();
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

  setCtx: (open) => set({ ctxOpen: open }),
  setMode: (mode) => set({ mode }),
}));
