import { app } from 'electron';
import { createLifecycle, createLogger, type Lifecycle, type Logger } from '@appydave/core';
import { IpcRouter } from './ipc-router.js';
import { WindowManager } from './window-manager.js';
import { ProcessSupervisor } from './process-supervisor.js';

export interface ConsoleContext {
  logger: Logger;
  windows: WindowManager;
  ipc: IpcRouter;
  processes: ProcessSupervisor;
}

export interface Console extends ConsoleContext {
  lifecycle: Lifecycle;
  start(): Promise<void>;
}

export interface CreateConsoleOptions {
  /** App name — used as the logger binding. */
  name: string;
  /** Register IPC handlers before the first window opens. */
  registerIpc?: (ctx: ConsoleContext) => void;
  /** Called once the app is ready — open your window(s) here. */
  onReady: (ctx: ConsoleContext) => void;
}

/**
 * createConsole — the AppyTron facade.
 *
 * Wires `@appydave/core` (Lifecycle + Logger) with AppyTron's Tier-2 primitives
 * (WindowManager + IpcRouter) into a single object that every `main/index.ts`
 * drives. Mirrors AppySentinel's `createSentinel()` shape: nothing happens until
 * `start()` is called.
 */
export function createConsole(options: CreateConsoleOptions): Console {
  const logger = createLogger({ name: options.name });
  const lifecycle = createLifecycle();
  const windows = new WindowManager();
  const ipc = new IpcRouter();
  const processes = new ProcessSupervisor();
  const ctx: ConsoleContext = { logger, windows, ipc, processes };

  lifecycle.onStop(() => {
    ipc.dispose();
    processes.stopAll();
  });

  return {
    ...ctx,
    lifecycle,
    async start() {
      options.registerIpc?.(ctx);
      await app.whenReady();
      await lifecycle.start();
      logger.info('appytron console started');
      options.onReady(ctx);

      app.on('activate', () => {
        if (windows.all().length === 0) options.onReady(ctx);
      });
      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
          void lifecycle.stop().then(() => app.quit());
        }
      });
    },
  };
}
