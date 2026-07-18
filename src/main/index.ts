import { join } from 'node:path';
import { app, globalShortcut, type BrowserWindow } from 'electron';
import { z, createStore, type Store } from '@appydave/core';
import { IPC, type AppInfo, type HarnessEvent, type Rect } from '@shared/ipc';
import { createConsole } from './create-console.js';
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

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

function pushEvent(e: HarnessEvent): void {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send(IPC.harnessEvent, e);
}

function getHarness(): WebviewHarness {
  if (harness) return harness;
  if (!hostWindow) throw new Error('imagedrip: window not ready');
  // Harvest root — default under userData; a real batch reconfigures this to the
  // consuming project's output dir. FileAuthor refuses any path escaping it (§8).
  const fileAuthor = new FileAuthor({ root: join(app.getPath('userData'), 'harvest') });
  const h = new WebviewHarness({
    window: hostWindow,
    selectors: CHATGPT_SELECTORS,
    fileAuthor,
  });
  // Mechanism, not policy: harvesting/naming is the (future) Batch Runner's job, so
  // here we only surface events to the renderer. Naming = prompt→filename lives there.
  h.onImageDone((e) => pushEvent({ type: 'image-done', imageUrl: e.imageUrl, at: e.at }));
  h.onRateLimit((e) => pushEvent({ type: 'rate-limit', text: e.text, at: e.at }));
  h.onRefused((e) => pushEvent({ type: 'refused', at: e.at }));
  h.onStall((e) => pushEvent({ type: 'stall', waitedMs: e.waitedMs }));
  harness = h;
  return h;
}

function stopHarness(): void {
  harness?.stop();
  harness = null;
  pushEvent({ type: 'stopped', at: Date.now() });
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
    ipc.register<void, void>({
      channel: IPC.harnessStop,
      handle: () => stopHarness(),
    });
  },

  onReady({ windows, logger }) {
    hostWindow = windows.create({ width: 1200, height: 820 });
    logger.info('window opened');

    // Global STOP — halts a running batch immediately, session (login) intact (§6).
    const STOP = 'CommandOrControl+Shift+.';
    if (globalShortcut.register(STOP, () => stopHarness())) {
      logger.info({ shortcut: STOP }, 'STOP shortcut registered');
    } else {
      logger.warn({ shortcut: STOP }, 'STOP shortcut registration failed');
    }
    app.on('will-quit', () => globalShortcut.unregisterAll());
  },
});

void desktop.start();
