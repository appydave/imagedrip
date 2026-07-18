import { autoUpdater } from 'electron-updater';
import type { Logger } from '@appydave/core';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  error?: string;
}

export interface UpdaterOptions {
  logger?: Logger;
  /** Auto-download once an update is found. Default false (user-initiated). */
  autoDownload?: boolean;
}

/**
 * Updater — wraps `electron-updater` against the GitHub Releases feed configured
 * in `electron-builder.yml` (docs §10). Exposes a small state machine + change
 * subscription; only meaningful in a packaged, signed build.
 */
export class Updater {
  private state: UpdateState = { status: 'idle' };
  private cbs = new Set<(state: UpdateState) => void>();

  constructor(private readonly options: UpdaterOptions = {}) {
    autoUpdater.autoDownload = options.autoDownload ?? false;
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      this.set({ status: 'available', version: info.version }),
    );
    autoUpdater.on('update-not-available', () => this.set({ status: 'not-available' }));
    autoUpdater.on('download-progress', (p) =>
      this.set({ status: 'downloading', percent: Math.round(p.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version }),
    );
    autoUpdater.on('error', (err) => this.set({ status: 'error', error: String(err) }));
  }

  get current(): UpdateState {
    return this.state;
  }

  onChange(cb: (state: UpdateState) => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  async check(): Promise<void> {
    await autoUpdater.checkForUpdates();
  }

  async download(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  install(): void {
    autoUpdater.quitAndInstall();
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.options.logger?.info({ update: this.state }, 'updater state');
    for (const cb of this.cbs) cb(this.state);
  }
}
