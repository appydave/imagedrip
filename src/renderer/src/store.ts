import { create } from 'zustand';
import type { DomainState } from '@shared/domain';
import type { RunStatus } from '@shared/ipc';

export type Mode = 'dial-in' | 'auto';

interface AppState {
  domain: DomainState | null;
  status: RunStatus | null;
  ctxOpen: boolean;
  mode: Mode;
  /** Transient copy-confirmation label ("primer copied" etc.). */
  flash: string | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  importPrompts: (text: string) => Promise<void>;
  saveProject: (body: string) => Promise<void>;
  copyPrimer: () => Promise<void>;
  copyNextPrompt: () => Promise<void>;
  resetRun: () => Promise<void>;

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

  init: async () => {
    set({ domain: await window.imagedrip.domain.get() });
    if (subscribed) return;
    subscribed = true;
    // Live run status. On each harvest / terminal transition, re-read the domain so
    // the QUEUED → HARVESTED lanes reflect what actually landed on disk.
    window.imagedrip.run.onStatus((status) => {
      set({ status });
      if (['harvested', 'done', 'stopped'].includes(status.phase)) void get().refresh();
    });
  },
  refresh: async () => {
    set({ domain: await window.imagedrip.domain.get() });
  },
  importPrompts: async (text) => {
    set({ domain: await window.imagedrip.domain.importPrompts(text) });
  },
  saveProject: async (body) => {
    set({ domain: await window.imagedrip.domain.saveProject(body), flash: 'project saved' });
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
  resetRun: async () => {
    set({ domain: await window.imagedrip.domain.resetRun(), status: null, flash: 're-queued' });
  },

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
