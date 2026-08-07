import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
/**
 * Redirect ALL persistence to a throwaway directory when `APPYTRON_HOME` is set.
 *
 * Why this exists: an agent-driven acceptance run drives the REAL UI, and the
 * real UI writes to the real data directory. Without this, a run creates
 * projects in the live `domain.json` and drops generated images into
 * `~/Pictures/ImageDrip` — the user's actual output folder. Driving the real UI
 * is not negotiable; pointing it at real user data is.
 *
 * Both paths are redirected because both are user data:
 *   userData → domain.json, counter.json, harvest/, live-uat/
 *   pictures → `outputRoot()` = <pictures>/ImageDrip, the visible output root
 *
 * MUST run before `app.whenReady()` — `setPath('userData')` is only honoured
 * while the app is still un-ready, and anything that has already resolved a
 * path keeps the old one.
 *
 * Unset in a normal launch, so production behaviour is byte-identical.
 *
 * → the seam rationale: ~/dev/ad/brains/testing-patterns/drivable-seams.md
 */
function redirectHomeIfRequested(logger: Logger): void {
  const home = process.env['APPYTRON_HOME'];
  if (!home) return;
  const userData = join(home, 'userData');
  const pictures = join(home, 'pictures');
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  mkdirSync(pictures, { recursive: true, mode: 0o700 });
  app.setPath('userData', userData);
  app.setPath('pictures', pictures);
  logger.warn(
    `APPYTRON_HOME=${home}: userData and pictures redirected — this is an isolated run, ` +
      'no live user data is reachable. Never set this in a real launch.',
  );
}

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
      redirectHomeIfRequested(logger);
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
