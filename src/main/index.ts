import { promises as fs } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { app, globalShortcut, type BrowserWindow } from 'electron';
import { z, createStore, type Logger, type Store } from '@appydave/core';
import { IPC, type AppInfo, type Rect, type RunConfig, type RunStatus } from '@shared/ipc';
import type { DomainState } from '@shared/domain';
import { createConsole } from './create-console.js';
import {
  composePrimer,
  getDomain,
  getQueue,
  importPrompts,
  markHarvested,
  resetRun,
  saveProject,
} from './domain-store.js';
import { BatchRunner } from './batch-runner.js';
import { FileAuthor } from './file-author.js';
import { WebviewHarness } from './webview-harness.js';
import { CHATGPT_SELECTORS } from './chatgpt-selectors.js';

// Local-first persistence via @appydave/core Store. Lazily created (needs app-ready
// for userData path); the JSON survives restarts — proving the Store round-trip.
let counterStore: Store<{ count: number }> | null = null;
function counter(): Store<{ count: number }> {
  counterStore ??= createStore<{ count: number }>({
    path: join(app.getPath('userData'), 'counter.json'),
    defaults: { count: 0 },
  });
  return counterStore;
}

// ── ImageDrip harness (Approach C) — created lazily on the renderer's attach. ──
// The host window + harvest root are captured in onReady; the harness embeds the
// ChatGPT WebContentsView only when the renderer asks for it, so boot never touches
// the network.
let hostWindow: BrowserWindow | null = null;
let harness: WebviewHarness | null = null;
let runner: BatchRunner | null = null;
let logger: Logger | null = null;

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const runConfigSchema = z
  .object({
    chunkSize: z.number().int().positive().optional(),
    cadenceBaseMs: z.number().int().nonnegative().optional(),
    cadenceJitterMs: z.number().int().nonnegative().optional(),
    primerSettleMs: z.number().int().nonnegative().optional(),
    loadSettleMs: z.number().int().nonnegative().optional(),
  })
  .optional();

// Harvest root — default under userData; a real batch reconfigures this to the
// consuming project's output dir. FileAuthor refuses any path escaping it (§8), and
// the thumbnail reader is scoped to the same root.
function harvestRoot(): string {
  return join(app.getPath('userData'), 'harvest');
}

function pushRunStatus(s: RunStatus): void {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send(IPC.runStatus, s);
}

function getHarness(): WebviewHarness {
  if (harness) return harness;
  if (!hostWindow) throw new Error('imagedrip: window not ready');
  harness = new WebviewHarness({
    window: hostWindow,
    selectors: CHATGPT_SELECTORS,
    fileAuthor: new FileAuthor({ root: harvestRoot() }),
    logger: logger ?? undefined,
  });
  return harness;
}

// The Batch Runner owns the harness callbacks for the whole run — it decides WHEN to
// feed and turns each done-image into a harvest (mechanism split, spec §API).
function getRunner(): BatchRunner {
  if (runner) return runner;
  runner = new BatchRunner({
    harness: getHarness(),
    getPrimer: composePrimer,
    getQueue,
    markHarvested: async (id, relPath) => {
      await markHarvested(id, relPath);
    },
    emit: pushRunStatus,
    logger: logger ?? undefined,
  });
  return runner;
}

/** Read a harvested image (rel to the scoped harvest root) as a data URL for the grid. */
async function readThumb(rel: string): Promise<string | null> {
  try {
    const root = harvestRoot();
    const abs = resolve(root, rel);
    const relCheck = relative(root, abs);
    if (relCheck.startsWith('..') || isAbsolute(relCheck)) return null; // scope guard
    const buf = await fs.readFile(abs);
    const ext = extname(abs).toLowerCase();
    const mime =
      ext === '.webp'
        ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const desktop = createConsole({
  name: 'imagedrip',

  registerIpc({ ipc }) {
    ipc.register<void, AppInfo>({
      channel: IPC.appInfo,
      handle: () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
      }),
    });

    ipc.register<string, string>({
      channel: IPC.ping,
      input: z.string(),
      handle: (message) => `pong: ${message}`,
    });

    ipc.register<void, number>({
      channel: IPC.counterGet,
      handle: async () => (await counter().read()).count,
    });

    ipc.register<void, number>({
      channel: IPC.counterIncrement,
      handle: async () => (await counter().update((s) => ({ count: s.count + 1 }))).count,
    });

    // ── ImageDrip domain (window.imagedrip.domain.*) — human path, no network ──
    ipc.register<void, DomainState>({
      channel: IPC.domainGet,
      handle: () => getDomain(),
    });
    ipc.register<string, DomainState>({
      channel: IPC.domainImportPrompts,
      input: z.string(),
      handle: (text) => importPrompts(text),
    });
    ipc.register<string, DomainState>({
      channel: IPC.domainSaveProject,
      input: z.string(),
      handle: (body) => saveProject(body),
    });
    ipc.register<void, string>({
      channel: IPC.domainComposePrimer,
      handle: () => composePrimer(),
    });
    ipc.register<void, DomainState>({
      channel: IPC.domainResetRun,
      handle: () => resetRun(),
    });

    // ── ImageDrip Auto run (Batch Runner) ──
    ipc.register<RunConfig | undefined, void>({
      channel: IPC.runStart,
      input: runConfigSchema,
      handle: (cfg) => getRunner().start(cfg),
    });
    ipc.register<void, void>({
      channel: IPC.runPause,
      handle: () => runner?.pause(),
    });
    ipc.register<void, void>({
      channel: IPC.runResume,
      handle: () => runner?.resume(),
    });
    ipc.register<void, void>({
      channel: IPC.runStop,
      handle: () => runner?.stop(),
    });
    ipc.register<string, string | null>({
      channel: IPC.harvestThumb,
      input: z.string(),
      handle: (rel) => readThumb(rel),
    });

    // ── ImageDrip harness control (window.imagedrip.*) ──
    ipc.register<Rect, void>({
      channel: IPC.harnessAttach,
      input: rectSchema,
      handle: (bounds) => getHarness().attach(bounds),
    });
    ipc.register<Rect, void>({
      channel: IPC.harnessSetBounds,
      input: rectSchema,
      handle: (bounds) => getHarness().setBounds(bounds),
    });
    ipc.register<void, void>({
      channel: IPC.harnessNewConversation,
      handle: () => getHarness().newConversation(),
    });
    ipc.register<string, void>({
      channel: IPC.harnessFeed,
      input: z.string().min(1),
      handle: (prompt) => getHarness().feed(prompt),
    });
    // Full teardown: halt the run AND detach the ChatGPT view (app-level stop).
    ipc.register<void, void>({
      channel: IPC.harnessStop,
      handle: () => {
        runner?.stop();
        harness?.stop();
        harness = null;
        runner = null;
      },
    });
  },

  onReady({ windows, logger: log }) {
    logger = log;
    hostWindow = windows.create({ width: 1200, height: 820 });
    log.info('window opened');

    // Global STOP — halts a running batch immediately; the ChatGPT view (login) and
    // its embedded panel stay intact so you can inspect / resume (§6).
    const STOP = 'CommandOrControl+Shift+.';
    if (globalShortcut.register(STOP, () => runner?.stop())) {
      log.info({ shortcut: STOP }, 'STOP shortcut registered');
    } else {
      log.warn({ shortcut: STOP }, 'STOP shortcut registration failed');
    }
    app.on('will-quit', () => globalShortcut.unregisterAll());
  },
});

void desktop.start();
