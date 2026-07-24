import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppInfo,
  type AppytronApi,
  type HarnessEvent,
  type ImagedripApi,
  type Rect,
  type RunConfig,
  type RunStatus,
} from '../shared/ipc';
import type { DomainState } from '../shared/domain';

const api: AppytronApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  ping: (message: string): Promise<string> => ipcRenderer.invoke(IPC.ping, message),
  counter: {
    get: (): Promise<number> => ipcRenderer.invoke(IPC.counterGet),
    increment: (): Promise<number> => ipcRenderer.invoke(IPC.counterIncrement),
  },
};

// ImageDrip control surface — a thin, typed door over the WebviewHarness. The
// renderer drives the batch; main owns the ChatGPT view (never exposed here).
const imagedrip: ImagedripApi = {
  domain: {
    get: (): Promise<DomainState> => ipcRenderer.invoke(IPC.domainGet),
    importPrompts: (text: string): Promise<DomainState> =>
      ipcRenderer.invoke(IPC.domainImportPrompts, text),
    saveProject: (body: string): Promise<DomainState> =>
      ipcRenderer.invoke(IPC.domainSaveProject, body),
    composePrimer: (): Promise<string> => ipcRenderer.invoke(IPC.domainComposePrimer),
    resetRun: (): Promise<DomainState> => ipcRenderer.invoke(IPC.domainResetRun),
  },
  run: {
    start: (config?: RunConfig): Promise<void> => ipcRenderer.invoke(IPC.runStart, config),
    pause: (): Promise<void> => ipcRenderer.invoke(IPC.runPause),
    resume: (): Promise<void> => ipcRenderer.invoke(IPC.runResume),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.runStop),
    onStatus: (cb: (s: RunStatus) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: RunStatus): void => cb(payload);
      ipcRenderer.on(IPC.runStatus, listener);
      return () => ipcRenderer.removeListener(IPC.runStatus, listener);
    },
  },
  harvestThumb: (relPath: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.harvestThumb, relPath),
  attach: (bounds: Rect): Promise<void> => ipcRenderer.invoke(IPC.harnessAttach, bounds),
  setBounds: (bounds: Rect): Promise<void> => ipcRenderer.invoke(IPC.harnessSetBounds, bounds),
  newConversation: (): Promise<void> => ipcRenderer.invoke(IPC.harnessNewConversation),
  feed: (prompt: string): Promise<void> => ipcRenderer.invoke(IPC.harnessFeed, prompt),
  stop: (): Promise<void> => ipcRenderer.invoke(IPC.harnessStop),
  onEvent: (cb: (e: HarnessEvent) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: HarnessEvent): void => cb(payload);
    ipcRenderer.on(IPC.harnessEvent, listener);
    return () => ipcRenderer.removeListener(IPC.harnessEvent, listener);
  },
};

// The ONLY door: expose minimal, typed APIs on window.*.
// contextIsolation is on, so the renderer never sees Node or ipcRenderer directly.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('appytron', api);
    contextBridge.exposeInMainWorld('imagedrip', imagedrip);
  } catch (error) {
    console.error(error);
  }
} else {
  // Fallback for the (non-default) case where contextIsolation is off.
  const g = globalThis as unknown as { window: { appytron: AppytronApi; imagedrip: ImagedripApi } };
  g.window.appytron = api;
  g.window.imagedrip = imagedrip;
}
