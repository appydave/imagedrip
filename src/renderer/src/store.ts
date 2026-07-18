import { create } from 'zustand';
import type { AppInfo } from '@shared/ipc';

interface AppState {
  info: AppInfo | null;
  pong: string | null;
  count: number | null;
  loadInfo: () => Promise<void>;
  sendPing: (message: string) => Promise<void>;
  loadCount: () => Promise<void>;
  increment: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  info: null,
  pong: null,
  count: null,
  loadInfo: async () => {
    const info = await window.appytron.getAppInfo();
    set({ info });
  },
  sendPing: async (message: string) => {
    const pong = await window.appytron.ping(message);
    set({ pong });
  },
  loadCount: async () => {
    const count = await window.appytron.counter.get();
    set({ count });
  },
  increment: async () => {
    const count = await window.appytron.counter.increment();
    set({ count });
  },
}));
