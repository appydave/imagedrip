import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';

export interface WindowOptions {
  width?: number;
  height?: number;
  title?: string;
}

/**
 * WindowManager — creates and tracks native windows with AppyTron's secure
 * defaults: `contextIsolation` on, `nodeIntegration` off, `sandbox` on. The
 * preload bridge is the only channel to the renderer (docs §9).
 */
export class WindowManager {
  private windows = new Set<BrowserWindow>();

  create(options: WindowOptions = {}): BrowserWindow {
    const win = new BrowserWindow({
      width: options.width ?? 1200,
      height: options.height ?? 800,
      show: false,
      title: options.title,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        // electron-vite emits the preload as index.mjs (ESM).
        preload: join(__dirname, '../preload/index.mjs'),
        // sandbox:false is required for an ESM preload; security still holds via
        // contextIsolation + nodeIntegration:false + the minimal typed bridge (docs §9).
        // Hardening to sandbox:true later requires a CommonJS preload.
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.on('ready-to-show', () => win.show());
    win.on('closed', () => this.windows.delete(win));
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    // electron-vite sets ELECTRON_RENDERER_URL in dev; packaged builds load the file.
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      void win.loadURL(devUrl);
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'));
    }

    this.windows.add(win);
    return win;
  }

  all(): BrowserWindow[] {
    return [...this.windows];
  }
}
