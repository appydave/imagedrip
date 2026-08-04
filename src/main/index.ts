import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { app, dialog, globalShortcut, shell, type BrowserWindow } from 'electron';
import { z, createStore, type Logger, type Store } from '@appydave/core';
import {
  IPC,
  type AppInfo,
  type Rect,
  type RunConfig,
  type RunManifest,
  type RunStatus,
  type RunSummary,
} from '@shared/ipc';
import type { DomainState } from '@shared/domain';
import type { SnagInput, UatCounts, VerdictInput } from '@shared/live-uat';
import { createConsole } from './create-console.js';
import { readCounts, revealStore, writeSnag, writeVerdict } from './live-uat-store.js';
import {
  composePrimer,
  createBrand,
  createProject,
  getActiveOutputDir,
  getDomain,
  getQueue,
  importPrompts,
  markHarvested,
  resetRun,
  saveBrand,
  saveProject,
  switchBrand,
  switchProject,
} from './domain-store.js';
import { BatchRunner } from './batch-runner.js';
import { SwappableFileAuthor } from './output-router.js';
import { RunRecorder, listRunDirNames, listRuns, readRunManifest } from './run-manifest.js';
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
    entry: z.enum(['continue', 'fresh']).optional(),
    chunkSize: z.number().int().positive().optional(),
    cadenceBaseMs: z.number().int().nonnegative().optional(),
    cadenceJitterMs: z.number().int().nonnegative().optional(),
    primerSettleMs: z.number().int().nonnegative().optional(),
    loadSettleMs: z.number().int().nonnegative().optional(),
  })
  .optional();

// v1 harvest root under userData — kept ONLY as a thumbnail fallback so images
// harvested before WP1 (flat, invisible) still render in the grid.
function legacyHarvestRoot(): string {
  return join(app.getPath('userData'), 'harvest');
}

// The active project's output dir (WP1) — a real, visible, user-chosen folder.
// One SwappableFileAuthor follows it; the harness captures the author once, so
// repointing the root here re-routes every subsequent harvest.
let outputAuthor: SwappableFileAuthor | null = null;
let recorder: RunRecorder | null = null;

function getOutputAuthor(): SwappableFileAuthor {
  outputAuthor ??= new SwappableFileAuthor(legacyHarvestRoot());
  return outputAuthor;
}

const exec = promisify(execFile);

const verdictEnum = z.enum(['down', 'question', 'up', 'idea']);

const snagSchema = z.object({
  region: z.string().min(1),
  verdict: verdictEnum,
  note: z.string(),
  snapshot: z.string(),
  mode: z.enum(['dial-in', 'auto']),
  phase: z.string(),
});

const verdictSchema = z.object({
  items: z
    .array(
      z.object({
        promptId: z.string().min(1),
        savedPath: z.string().min(1),
        subject: z.string(),
      }),
    )
    .min(1),
  verdict: verdictEnum,
  note: z.string(),
});

/**
 * Record image judgments with a REAL producer snapshot (docs/live-uat.md).
 *
 * The primer is read back out of the run manifest that produced the image — not
 * recomposed from the current Brand/Project, which would silently attribute an
 * image to a primer it was never generated from. Without a truthful producer
 * this corpus is a bug list, not a tuning signal.
 */
async function recordVerdicts(input: VerdictInput): Promise<void> {
  const s = await getDomain();
  const root = await ensureOutputRoot();
  const manifests = new Map<string, RunManifest | null>();

  for (const item of input.items) {
    const slash = item.savedPath.indexOf('/');
    // Pre-WP1 harvests were written flat, with no run folder and no manifest.
    const runId = slash > 0 ? item.savedPath.slice(0, slash) : '';
    const file = slash > 0 ? item.savedPath.slice(slash + 1) : item.savedPath;

    if (runId && !manifests.has(runId)) {
      manifests.set(runId, await readRunManifest(root, runId).catch(() => null));
    }
    const manifest = runId ? (manifests.get(runId) ?? null) : null;
    const record = manifest?.prompts.find((p) => p.id === item.promptId);

    await writeVerdict({
      runId: runId || '(no run folder)',
      promptId: item.promptId,
      file,
      verdict: input.verdict,
      note: input.note,
      producer: {
        primer:
          manifest?.primer ??
          '(unavailable — no run manifest for this image; pre-WP1 flat harvest)',
        promptText:
          record?.text ??
          s.theme.prompts.find((p) => p.id === item.promptId)?.text ??
          item.subject,
        mode: manifest?.mode,
        brandId: s.activeBrandId,
        projectId: s.project.id,
        generationMs: record?.generationMs,
      },
    });
  }
  logger?.info({ n: input.items.length, verdict: input.verdict }, 'live-uat verdicts');
}

/** Point the author at the active project's output dir (creating it), return it.
 *  The dir is git-initialised (advisory-1 #4) — FileAuthor's per-write commit
 *  silently no-ops outside a repo, which made WP1's committed-harvest guarantee
 *  a fiction until now. */
async function ensureOutputRoot(): Promise<string> {
  const dir = await getActiveOutputDir();
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(join(dir, '.git'));
  } catch {
    try {
      await exec('git', ['init', '--quiet'], { cwd: dir });
      logger?.info({ dir }, 'output dir git-initialised');
    } catch (err) {
      logger?.warn({ dir, err: String(err) }, 'git init failed — harvests will be uncommitted');
    }
  }
  getOutputAuthor().setRoot(dir);
  return dir;
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
    fileAuthor: getOutputAuthor(),
    logger: logger ?? undefined,
  });
  return harness;
}

// The Batch Runner owns the harness callbacks for the whole run — it decides WHEN to
// feed and turns each done-image into a harvest (mechanism split, spec §API).
function getRunner(): BatchRunner {
  if (runner) return runner;
  recorder ??= new RunRecorder({
    fileAuthor: getOutputAuthor(),
    // Advisory-1 #5: run-id collisions across app restarts are prevented by
    // seeding from the folders actually on disk (with or without a manifest).
    listExistingRunIds: () => listRunDirNames(getOutputAuthor().activeRoot),
    logger: logger ?? undefined,
  });
  const rec = recorder;
  runner = new BatchRunner({
    harness: getHarness(),
    getPrimer: composePrimer,
    getQueue,
    markHarvested: async (id, relPath) => {
      await markHarvested(id, relPath);
    },
    emit: pushRunStatus,
    recorder: {
      // Route the run into the ACTIVE project before anything is written.
      start: async ({ primer, prompts, mode }) => {
        await ensureOutputRoot();
        const s = await getDomain();
        return rec.start({
          projectName: s.project.name,
          themeName: s.theme.name,
          primer,
          prompts,
          mode,
        });
      },
      addPrompt: (p) => rec.addPrompt(p),
      harvest: (id, file, ms, url) => rec.harvest(id, file, ms, url),
      refusal: (id) => rec.refusal(id),
      reprime: (after) => rec.reprime(after),
      pause: (reason) => rec.pause(reason),
      finish: (outcome) => rec.finish(outcome),
    },
    logger: logger ?? undefined,
  });
  return runner;
}

/** Read a harvested image as a data URL for the grid. Tries the active project's
 *  output dir first, then the v1 legacy root (pre-WP1 harvests). */
async function readThumb(rel: string): Promise<string | null> {
  for (const root of [getOutputAuthor().activeRoot, legacyHarvestRoot()]) {
    try {
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
      // fall through to the legacy root
    }
  }
  return null;
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
    ipc.register<{ text: string; mode: 'replace' | 'add' | 'clear' }, DomainState>({
      channel: IPC.domainImportPrompts,
      input: z.object({ text: z.string(), mode: z.enum(['replace', 'add', 'clear']) }),
      handle: ({ text, mode }) => importPrompts(text, mode),
    });
    ipc.register<{ name?: string; body?: string; outputDir?: string }, DomainState>({
      channel: IPC.domainSaveProject,
      input: z.object({
        name: z.string().min(1).optional(),
        body: z.string().optional(),
        outputDir: z.string().min(1).optional(),
      }),
      handle: async (patch) => {
        // Repointing the harvest root mid-run would split a run across two
        // folders — the same reason project switching is refused while live.
        if (patch.outputDir && runner?.running) {
          throw new Error('stop the run before changing the output folder');
        }
        const state = await saveProject(patch);
        if (patch.outputDir) await ensureOutputRoot();
        return state;
      },
    });
    // Brand never changes mid-run (working-rules) — a RUN-STATE lock, not read-only.
    ipc.register<{ name?: string; body?: string }, DomainState>({
      channel: IPC.domainSaveBrand,
      input: z.object({ name: z.string().min(1).optional(), body: z.string().optional() }),
      handle: (patch) => {
        if (runner?.running) throw new Error('brand is locked while a run is live');
        return saveBrand(patch);
      },
    });
    ipc.register<{ name: string }, DomainState>({
      channel: IPC.brandCreate,
      input: z.object({ name: z.string().min(1) }),
      handle: (input) => {
        if (runner?.running) throw new Error('brand is locked while a run is live');
        return createBrand(input);
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.brandSwitch,
      input: z.string().min(1),
      handle: (id) => {
        if (runner?.running) throw new Error('brand is locked while a run is live');
        return switchBrand(id);
      },
    });
    ipc.register<void, string>({
      channel: IPC.domainComposePrimer,
      handle: () => composePrimer(),
    });
    ipc.register<void, DomainState>({
      channel: IPC.domainResetRun,
      handle: () => resetRun(),
    });

    // ── ImageDrip project identity (WP1) ──
    ipc.register<{ name: string; outputDir?: string }, DomainState>({
      channel: IPC.projectCreate,
      input: z.object({ name: z.string().min(1), outputDir: z.string().min(1).optional() }),
      handle: async (input) => {
        const state = await createProject(input);
        await ensureOutputRoot();
        return state;
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.projectSwitch,
      input: z.string().min(1),
      handle: async (id) => {
        // Switching repoints the harvest root — never yank it out from under a run.
        if (runner?.running) throw new Error('stop the run before switching projects');
        runner?.closeManualRun(); // a dial-in run record belongs to ONE project
        const state = await switchProject(id);
        await ensureOutputRoot();
        return state;
      },
    });
    ipc.register<void, string | null>({
      channel: IPC.projectChooseOutputDir,
      handle: async () => {
        if (!hostWindow) return null;
        const res = await dialog.showOpenDialog(hostWindow, {
          title: 'Choose the project output folder',
          properties: ['openDirectory', 'createDirectory'],
        });
        return res.canceled ? null : (res.filePaths[0] ?? null);
      },
    });

    ipc.register<void, void>({
      channel: IPC.projectRevealOutputDir,
      handle: async () => {
        shell.openPath(await ensureOutputRoot());
      },
    });

    // ── ImageDrip run history (WP1) ──
    ipc.register<void, RunSummary[]>({
      channel: IPC.runsList,
      handle: async () => listRuns(await ensureOutputRoot()),
    });
    ipc.register<string, RunManifest | null>({
      channel: IPC.runsManifest,
      input: z.string().min(1),
      handle: async (runId) => readRunManifest(await ensureOutputRoot(), runId),
    });
    ipc.register<string, void>({
      channel: IPC.runsReveal,
      input: z.string().min(1),
      handle: async (runId) => {
        const root = await ensureOutputRoot();
        const abs = resolve(root, runId);
        const rel = relative(root, abs);
        if (rel.startsWith('..') || isAbsolute(rel)) return; // scope guard
        shell.showItemInFolder(abs);
      },
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
    // Main-process truth for the run-entry default (advisory-1 #8): the
    // renderer must not guess from its own memory whether the chat is primed.
    ipc.register<void, { primed: boolean }>({
      channel: IPC.runChatState,
      handle: () => ({ primed: runner?.chatIsPrimed ?? false }),
    });
    // ── Dial-in manual injection (WP4) ──
    ipc.register<void, void>({
      channel: IPC.runInjectPrimer,
      handle: () => getRunner().injectPrimer(),
    });
    ipc.register<string, void>({
      channel: IPC.runInjectPrompt,
      input: z.string().min(1),
      handle: (promptId) => getRunner().injectOne(promptId),
    });
    ipc.register<string, string | null>({
      channel: IPC.harvestThumb,
      input: z.string(),
      handle: (rel) => readThumb(rel),
    });

    // ── Live UAT: the judgment sidecar (docs/live-uat.md) ──
    // Capture only. These handlers must never write domain.json or a run
    // manifest — the feedback channel stays separate from the decision channel.
    ipc.register<SnagInput, void>({
      channel: IPC.uatSnag,
      input: snagSchema,
      handle: async (input) => {
        const s = await getDomain();
        await writeSnag(input, s.project.id);
        logger?.info({ region: input.region, verdict: input.verdict }, 'live-uat snag');
      },
    });
    ipc.register<VerdictInput, void>({
      channel: IPC.uatVerdict,
      input: verdictSchema,
      handle: (input) => recordVerdicts(input),
    });
    ipc.register<void, UatCounts>({
      channel: IPC.uatCounts,
      handle: () => readCounts(),
    });
    ipc.register<void, void>({
      channel: IPC.uatReveal,
      handle: () => revealStore(),
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
    // Popovers can't be seen over the native ChatGPT view (it composites above
    // all HTML) — the renderer hides it for the life of a popover.
    ipc.register<boolean, void>({
      channel: IPC.harnessSetVisible,
      input: z.boolean(),
      handle: (visible) => harness?.setVisible(visible),
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

    // Migrate the domain document (v1 → multi-project) and point the harvest
    // author at the active project's output dir before anything runs.
    void ensureOutputRoot()
      .then((dir) => log.info({ dir }, 'output root ready'))
      .catch((err) => log.warn({ err: String(err) }, 'output root init failed'));

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

/**
 * ONE ImageDrip at a time — enforced, not asked for politely.
 *
 * The ChatGPT view lives in a `persist:` partition, which is a Chromium profile
 * directory holding LevelDB stores that take an exclusive LOCK. A second
 * instance cannot take those locks, so its storage subsystems fail and reset —
 * which is exactly what the recurring
 *
 *   ERROR:quota_database.cc — Could not open the quota database, resetting.
 *   ERROR:service_worker_storage.cc — Failed to delete the database: IO error
 *
 * were telling us during the 2026-08-03 session, while two dev instances sat
 * running at once. David spotted the cause: "you do start up image drips for
 * me, but you don't close down previous ones."
 *
 * A second launch now surrenders immediately and focuses the window that
 * already owns the profile, rather than quietly corrupting it.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!hostWindow || hostWindow.isDestroyed()) return;
    if (hostWindow.isMinimized()) hostWindow.restore();
    hostWindow.focus();
  });
  void desktop.start();
}
