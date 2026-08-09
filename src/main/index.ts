import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { app, dialog, globalShortcut, shell, type BrowserWindow } from 'electron';
import { z, createStore, type Logger, type Store } from '@appydave/core';
import {
  IPC,
  type AppInfo,
  type ChatState,
  type Rect,
  type RunConfig,
  type RunManifest,
  type RunStatus,
  type RunSummary,
} from '@shared/ipc';
import type { ChatEvent, ChatGateRequest } from '@shared/chat';
import type { DomainState } from '@shared/domain';
import type { SnagInput, UatCounts, VerdictInput } from '@shared/live-uat';
import { createConsole } from './create-console.js';
import { createControlSurface, listVerbs, type ControlSurface } from './control-surface.js';
import { createChatSession, type ChatSessionHandle } from './chat-session.js';
import { createChatGate, type ChatGate } from './chat-gate.js';
import { buildContext, type ContextMode, type ContextResult } from './context-snapshot.js';
import { buildEngineReadiness, type EngineReadiness } from './engine-readiness.js';
import { isInside, isInsideWorkTree } from './git-scope.js';
import { flushRunOnQuit } from './quit-flush.js';
import { readCounts, revealStore, writeSnag, writeVerdict } from './live-uat-store.js';
import {
  attachRepo,
  composePrimer,
  createBrand,
  createProject,
  createTemplate,
  deleteBrand,
  deleteProject,
  deleteTemplate,
  getActiveOutputDir,
  getDomain,
  getQueue,
  importPrompts,
  markHarvested,
  renameTheme,
  resetRun,
  saveBrand,
  saveProject,
  saveTemplate,
  switchBrand,
  switchProject,
  switchTemplate,
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

// ── v4 WP1: what `context.get` needs that no existing channel can answer ──
//
// `lastInteractionAt` is stamped from REAL input events on the window, not from
// IPC traffic. The distinction is the whole point: the renderer autosaves and
// re-reads the domain on its own, so IPC would stay warm forever with nobody in
// the room — and "nobody in the room" is exactly the state the expiry exists to
// detect (v4 §9.3).
let lastInteractionAt = 0;
// Which mode the most recent run record was opened in. Taken from the runner's
// own `recorder.start({ mode })` call, so it is observed rather than guessed.
let lastRunMode: ContextMode = 'dial-in';
// Phase of the last status snapshot this launch; null until a run has happened.
let lastRunPhase: string | null = null;
let control: ControlSurface | null = null;

/**
 * ── v4 WP4: the resident chat operator ──
 *
 * Created once the IPC registry exists (it needs `ipc.list()` to bound the
 * pane's tool surface) but it SPAWNS NOTHING until the first message: a user
 * who never opens the Chat tab should not have a CLI running, and app startup
 * must not depend on `claude` being installed.
 */
let chat: ChatSessionHandle | null = null;

/**
 * D1 — the human gate. Created eagerly (it holds no resources until asked) so
 * the control surface can be handed a live reference at startup.
 */
let gate: ChatGate | null = null;

function pushChatEvents(events: ChatEvent[]): void {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send(IPC.chatEvent, events);
}

/**
 * Put a confirm in front of the human, and say whether that was possible.
 *
 * Returning false is a DENY, not an error: no window means no person, and the
 * gate treats absent consent as refusal.
 *
 * ⚠️ The ChatGPT `WebContentsView` composites ABOVE all HTML, so a dialog
 * overlapping its rect is simply invisible — the failure that ate the WP5
 * run-entry chooser on 2026-08-03. The renderer's `Modal` already hides the
 * view for its lifetime (refcounted, in `Popover.tsx`), which is why the
 * confirm is rendered through that component and not hand-rolled. Hiding is
 * not detaching: a running generation carries on underneath.
 */
function presentGate(request: ChatGateRequest): boolean {
  if (!hostWindow || hostWindow.isDestroyed()) return false;
  hostWindow.webContents.send(IPC.chatGate, request);
  // Bring the window forward: a confirm the user never saw because ImageDrip
  // was behind their editor would expire and deny, and they would only find
  // out from the chat claiming it was refused.
  if (hostWindow.isMinimized()) hostWindow.restore();
  hostWindow.show();
  return true;
}

function dismissGate(): void {
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send(IPC.chatGate, null);
}

/**
 * The chat's sandbox (mechanic 5) and its read scope (D2 keeps `--add-dir`).
 *
 * The brand repo is the useful root — it holds DESIGN.md and the templates, and
 * reading it is most of the post-v3 value. With no repo attached there is
 * nothing to point at, so the chat gets `userData` and works from the verbs
 * alone, which is what it did before v3 anyway.
 */
async function chatScope(): Promise<{ cwd: string; addDirs: string[] }> {
  const repoRoot = (await getDomain()).brand?.repoRoot;
  if (repoRoot) return { cwd: repoRoot, addDirs: [repoRoot] };
  return { cwd: app.getPath('userData'), addDirs: [] };
}

function getChat(): ChatSessionHandle {
  if (!chat) throw new Error('imagedrip: chat is not ready yet');
  return chat;
}

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

/**
 * ── A2: every manifest write the runner has asked for, chained ──
 *
 * `BatchRunner` fires its recorder hooks and forgets them (`recordSafe`, and
 * `finishRun`'s `void`) — deliberately, so a slow disk can never wedge a live
 * run. That is right for the run and wrong for a QUIT: the last thing a live run
 * does on the way out is write `outcome`, and an un-awaited write dies with the
 * process. Both existing runs on disk have no `outcome` for exactly this reason.
 *
 * Main owns the adapter that hands those hooks to the runner, so this is where
 * the promises can be kept without touching the runner's fire-and-forget
 * discipline: the hooks still return immediately, and `before-quit` has
 * something to await.
 */
let recorderWork: Promise<void> = Promise.resolve();

/** Chain a recorder write onto `recorderWork`, returning it unchanged. */
function tracked<T>(p: Promise<T>): Promise<T> {
  recorderWork = recorderWork
    .catch(() => undefined)
    .then(() => p.then(() => undefined, () => undefined));
  return p;
}

/**
 * How long a quit will wait for the manifest to land.
 *
 * Bounded on purpose: a wedged write must not trap the user in an app that will
 * not close. Two seconds is far more than a small JSON write needs and far less
 * than a person will tolerate.
 */
const QUIT_FLUSH_MS = 2000;

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

/**
 * Point the author at the active project's output dir (creating it), return it.
 *
 * The dir is git-initialised (advisory-1 #4) — FileAuthor's per-write commit
 * silently no-ops outside a repo, which made the committed-harvest guarantee a
 * fiction until then. But WHEN to init is the part v3 WP3 fixes; there are three
 * cases and the old code only saw one:
 *
 *  1. Already inside a work tree → do NOTHING. The old check looked for
 *     `<dir>/.git` and never at ancestors, so pointing the output dir anywhere
 *     inside an existing repo silently created a NESTED one — after which the
 *     outer repo tracks nothing below it and the "committed" harvests live in a
 *     repository nobody pushes. `git rev-parse --is-inside-work-tree` asks the
 *     question that was meant.
 *
 *  2. Inside a brand repo root that is not yet a git repo → do NOTHING, and say
 *     so. The git boundary for the v3 layout is the BRAND REPO
 *     (`~/dev/image-projects/i-<brand>`), not `projects/<x>/runs/`. Initialising
 *     the leaf would plant exactly the nested repo case 1 exists to prevent, one
 *     level down. Whether a brand repo is git-initialised is WP5's job.
 *
 *  3. A standalone folder (the v2 default, `~/Pictures/ImageDrip/<slug>`) → init
 *     it, exactly as before.
 */
async function ensureOutputRoot(): Promise<string> {
  const dir = await getActiveOutputDir();
  await fs.mkdir(dir, { recursive: true });

  if (await isInsideWorkTree(dir)) {
    // Almost always ImageDrip's OWN repo, from the `git init` below on a
    // previous launch — so say that. "inside an existing git work tree" read
    // like the folder had been swallowed by somebody else's repository, which
    // is alarming and wrong. Debug, not info: this is the no-op branch of a
    // check that runs on many operations, and it was spamming the console.
    logger?.debug({ dir }, 'output dir is already a git work tree (ImageDrip’s own, unless nested) — nothing to do');
  } else {
    const repoRoot = (await getDomain()).brand?.repoRoot;
    if (repoRoot && isInside(repoRoot, dir)) {
      logger?.info(
        { dir, repoRoot },
        'output dir is inside a brand repo that is not git-initialised — leaving it to the repo, harvests stay uncommitted for now',
      );
    } else {
      try {
        await exec('git', ['init', '--quiet'], { cwd: dir });
        logger?.info({ dir }, 'output dir git-initialised');
      } catch (err) {
        logger?.warn({ dir, err: String(err) }, 'git init failed — harvests will be uncommitted');
      }
    }
  }

  getOutputAuthor().setRoot(dir);
  return dir;
}

function pushRunStatus(s: RunStatus): void {
  lastRunPhase = s.phase;
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send(IPC.runStatus, s);
}

/**
 * Is the image engine able to accept a prompt? Never throws — an unreachable or
 * signed-out engine is an ANSWER carrying the manual fix, by the same argument
 * that makes a stale context an answer.
 *
 * Note it probes `harness` directly rather than `getHarness()`: the getter
 * CREATES a harness, and a readiness check must observe the world, not change
 * it. With no harness the honest verdict is `detached`.
 */
async function getEngineReadiness(): Promise<EngineReadiness> {
  const probe = harness ? await harness.probeEngine() : null;
  return buildEngineReadiness({
    now: Date.now(),
    attached: harness?.isAttached ?? false,
    probe,
  });
}

/** `context.get` (v4 §9.3) — never throws; a stale answer is `{active:false, hint}`. */
async function getContext(): Promise<ContextResult> {
  return buildContext({
    now: Date.now(),
    lastInteractionAt,
    domain: await getDomain(),
    mode: lastRunMode,
    runPhase: lastRunPhase,
    engine: await getEngineReadiness(),
  });
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
        // The runner tells us which mode it opened this record in — the only
        // place main can observe it, so `context.get` reports rather than guesses.
        lastRunMode = mode === 'auto' ? 'automation' : 'dial-in';
        await ensureOutputRoot();
        const s = await getDomain();
        return tracked(
          rec.start({
            projectName: s.project.name,
            themeName: s.theme.name,
            primer,
            prompts,
            mode,
          }),
        );
      },
      addPrompt: (p) => tracked(rec.addPrompt(p)),
      harvest: (id, file, ms, url) => tracked(rec.harvest(id, file, ms, url)),
      refusal: (id) => tracked(rec.refusal(id)),
      reprime: (after) => tracked(rec.reprime(after)),
      pause: (reason) => tracked(rec.pause(reason)),
      finish: (outcome) => tracked(rec.finish(outcome)),
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

    // ── v4 §9.3: what is the app pointed at right now? ──
    // No renderer client — this exists so an agent on the control surface can
    // resolve "the last lot" before writing. It must NEVER throw: staleness is
    // an answer (`{active:false, hint}`), because an error invites a retry
    // while a hint tells the agent what the human has to do.
    ipc.register<void, ContextResult>({
      channel: IPC.contextGet,
      handle: () => getContext(),
    });

    // ── ImageDrip domain (window.imagedrip.domain.*) — human path, no network ──
    ipc.register<void, DomainState>({
      channel: IPC.domainGet,
      handle: () => getDomain(),
    });
    ipc.register<
      { text: string; mode: 'replace' | 'add' | 'clear'; format?: 'lines' | 'blocks' },
      DomainState
    >({
      channel: IPC.domainImportPrompts,
      input: z.object({
        text: z.string(),
        mode: z.enum(['replace', 'add', 'clear']),
        format: z.enum(['lines', 'blocks']).optional(),
      }),
      handle: ({ text, mode, format }) => importPrompts(text, mode, format ?? 'lines'),
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
    // `null` is a real argument, not a missing one — it selects "(none)".
    ipc.register<string | null, DomainState>({
      channel: IPC.brandSwitch,
      input: z.string().min(1).nullable(),
      handle: (id) => {
        if (runner?.running) throw new Error('brand is locked while a run is live');
        return switchBrand(id);
      },
    });

    // ── A5 / A7: verb-only surface (no renderer client — see @shared/ipc) ──
    //
    // Run-locked exactly as brand/template/project switching is. Renaming the
    // theme mid-run would repoint the run-id source while a manifest already
    // carries the old name; deleting anything mid-run is worse.
    ipc.register<string, DomainState>({
      channel: IPC.themeRename,
      input: z.string().min(1),
      handle: (name) => {
        if (runner?.running) throw new Error('stop the run before renaming the theme');
        return renameTheme(name);
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.brandDelete,
      input: z.string().min(1),
      handle: (id) => {
        if (runner?.running) throw new Error('brand is locked while a run is live');
        return deleteBrand(id);
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.templateDelete,
      input: z.string().min(1),
      handle: (id) => {
        if (runner?.running) throw new Error('template is locked while a run is live');
        return deleteTemplate(id);
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.projectDelete,
      input: z.string().min(1),
      handle: async (id) => {
        if (runner?.running) throw new Error('stop the run before deleting a project');
        // Deleting the ACTIVE project repoints the harvest root, same as a
        // switch — close any open dial-in record before it moves.
        runner?.closeManualRun();
        const state = await deleteProject(id);
        await ensureOutputRoot();
        return state;
      },
    });

    // ── ImageDrip brand repo (v3 WP2) — the source of truth moves to disk ──
    ipc.register<void, string | null>({
      channel: IPC.repoChooseRoot,
      handle: async () => {
        if (!hostWindow) return null;
        const res = await dialog.showOpenDialog(hostWindow, {
          title: 'Choose the brand repo (e.g. ~/dev/image-projects/i-appydave)',
          properties: ['openDirectory', 'createDirectory'],
        });
        return res.canceled ? null : (res.filePaths[0] ?? null);
      },
    });
    ipc.register<string, DomainState>({
      channel: IPC.repoAttach,
      input: z.string().min(1),
      handle: async (root) => {
        // Attaching repoints where projects are read from and written to —
        // never yank that out from under a live run.
        if (runner?.running) throw new Error('stop the run before attaching a repo');
        const state = await attachRepo(root);
        await ensureOutputRoot();
        return state;
      },
    });

    // ── ImageDrip template identity (v3 WP1) ──
    // Run-locked exactly as Brand is: the recipe and the style are the two
    // things a run must hold still, or the manifest stops describing the run.
    ipc.register<{ name: string; importFormat?: 'lines' | 'blocks' }, DomainState>({
      channel: IPC.templateCreate,
      input: z.object({
        name: z.string().min(1),
        importFormat: z.enum(['lines', 'blocks']).optional(),
      }),
      handle: (input) => {
        if (runner?.running) throw new Error('template is locked while a run is live');
        return createTemplate(input);
      },
    });
    ipc.register<string | null, DomainState>({
      channel: IPC.templateSwitch,
      input: z.string().min(1).nullable(),
      handle: (id) => {
        if (runner?.running) throw new Error('template is locked while a run is live');
        return switchTemplate(id);
      },
    });
    ipc.register<
      {
        name?: string;
        body?: string;
        importFormat?: 'lines' | 'blocks';
        listPrompt?: string;
        negatives?: string;
      },
      DomainState
    >({
      channel: IPC.templateSave,
      input: z.object({
        name: z.string().min(1).optional(),
        body: z.string().optional(),
        importFormat: z.enum(['lines', 'blocks']).optional(),
        listPrompt: z.string().optional(),
        negatives: z.string().optional(),
      }),
      handle: (patch) => {
        if (runner?.running) throw new Error('template is locked while a run is live');
        return saveTemplate(patch);
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
        // `createProject` sets `activeProjectId` — it IS a switch, so it
        // repoints the harvest root exactly as `project.switch` does, and the
        // `ensureOutputRoot()` below moves it. Ungated until 2026-08-09, which
        // meant creating a project mid-run split that run across two folders
        // with nothing said. Found auditing the 14 `running` gates (v5 §0.1).
        if (runner?.running) throw new Error('stop the run before creating a project');
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

    // ── v4 WP4: the resident chat operator ──
    //
    // Renderer-only. These channels are in NEVER_EXPOSED, so the control
    // surface does not publish them: `chat.send` as a verb would hand the
    // contained agent a tool that prompts itself.
    //
    // `chat.send` resolves when the TURN ends. The frames do not travel back
    // through this call — they stream on `IPC.chatEvent`, because
    // `ipc.register` is `ipcMain.handle` and strictly request/response.
    ipc.register<string, void>({
      channel: IPC.chatSend,
      input: z.string().min(1),
      handle: (prompt) => getChat().send(prompt),
    });
    ipc.register<void, ChatState>({
      channel: IPC.chatState,
      handle: () => chat?.state() ?? { running: false, busy: false, sessionId: null },
    });
    ipc.register<void, void>({
      channel: IPC.chatStop,
      handle: async () => {
        // A pending confirm belongs to the session being torn down. Deny it
        // rather than leave it hanging against a CLI that is going away.
        gate?.cancelAll('the chat was stopped');
        await chat?.stop();
      },
    });
    // D1 — the human's answer. `allow` is only ever honoured as an explicit
    // true; every other form of dismissal reaches here as false, or does not
    // reach here at all and expires into a deny.
    ipc.register<{ id: string; allow: boolean }, void>({
      channel: IPC.chatGateDecide,
      input: z.object({ id: z.string().min(1), allow: z.boolean() }),
      handle: ({ id, allow }) => {
        gate?.decide(id, allow);
      },
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

  onReady({ windows, logger: log, ipc }) {
    logger = log;
    hostWindow = windows.create({ width: 1200, height: 820 });
    log.info('window opened');

    // Real human input on the window — the clock `context.get` expires against.
    lastInteractionAt = Date.now();
    hostWindow.webContents.on('input-event', () => {
      lastInteractionAt = Date.now();
    });

    // ── v4 WP1: the control surface (docs/requirements-v4-resident-chat.md §9.2) ──
    // Started here, after `registerIpc` has run, so the registry it mirrors is
    // fully populated. Loopback only, bearer-authed, and it publishes its port
    // and token together in one 0600 file so a client discovers both in one read.
    // D1 — created before the control surface, which holds a reference to it.
    gate = createChatGate({
      present: presentGate,
      dismiss: () => dismissGate(),
      logger: log,
    });

    control = createControlSurface({
      defs: () => ipc.list(),
      userDataDir: app.getPath('userData'),
      version: app.getVersion(),
      isRunning: () => runner?.running ?? false,
      // ── D1 · who is calling, and asking a human when it matters ──
      //
      // Read live rather than captured: the credential is minted per CLI spawn
      // and revoked on teardown, so a stale copy would either stop recognising
      // the pane or keep recognising a session that has gone.
      paneToken: () => chat?.paneToken() ?? null,
      confirmGated: (call) => gate?.ask(call) ?? Promise.resolve(false),
      // The seam the human path gets for free: a person sees the login wall in
      // the pane, an HTTP caller sees nothing. This is what gives them parity.
      engineReadiness: () => getEngineReadiness(),
      logger: log,
    });
    void control
      .start()
      .then(({ port }) => log.info({ port }, 'control surface ready'))
      .catch((err) => {
        // A busy port must not take the app down — the window is the product;
        // the control surface is an accessory to it.
        log.warn({ err: String(err) }, 'control surface failed to start');
        control = null;
      });

    // ── v4 WP4: the chat operator, wired but not yet spawned ──
    //
    // It reads `ipc.list()` through the SAME `listVerbs` projection the control
    // surface publishes, so the pane's allow-list and the MCP proxy's tool list
    // are derived from one registry — a verb added to `registerIpc` lands on
    // the correct side of the gated/non-gated line with no change here.
    //
    // Read directly rather than over HTTP: main IS the control surface, so a
    // loopback round trip would only add a token to manage and a failure mode
    // to handle.
    chat = createChatSession({
      verbs: () => listVerbs(ipc.list()),
      controlFile: join(app.getPath('userData'), 'control.json'),
      // `app.getAppPath()` is the repo root in dev and the asar root packaged.
      mcpServerPath: join(app.getAppPath(), 'scripts', 'imagedrip-mcp.mjs'),
      userDataDir: app.getPath('userData'),
      cwd: async () => (await chatScope()).cwd,
      addDirs: async () => (await chatScope()).addDirs,
      emit: pushChatEvents,
      logger: log,
    });

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
    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
      // `will-quit` does not await async work, and a stale control.json is worse
      // than none — it advertises a port and token that no longer exist. The
      // lifecycle hook below is the orderly path; this is the one that actually
      // fires on a macOS Cmd-Q.
      control?.stopSync();
      control = null;
      // A confirm still on screen at quit is denied, not abandoned: the agent
      // gets a definite answer instead of a promise that dies with the process.
      gate?.cancelAll('ImageDrip is quitting');
      gate = null;
      // WP4 §2: the CLI child holds an OPEN stdin, so it will not exit on its
      // own, and on macOS it would outlive an Electron that simply exited.
      // A SEPARATE step from the run-manifest flush on purpose — `flushRunOnQuit`
      // is about a manifest write landing, this is about a process dying, and
      // overloading one with the other makes both harder to reason about.
      chat?.stopSync();
      chat = null;
    });
  },
});

// Orderly teardown: `create-console.ts` already stops the IPC router and the
// process supervisor here; the control surface joins them.
desktop.lifecycle.onStop(async () => {
  await control?.stop();
  control = null;
  // The orderly path: close stdin and let the CLI exit on its own terms.
  // `will-quit`'s `stopSync` is the one that fires on a macOS Cmd-Q.
  await chat?.stop().catch(() => undefined);
  chat = null;
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

  /**
   * A2 — quitting with a run open still writes its `outcome`.
   *
   * `before-quit` rather than `will-quit` because it is the only quit hook that
   * fires early enough to be deferred: `preventDefault()` here buys the time for
   * the manifest write, then the second `app.quit()` runs the whole sequence
   * again — including `will-quit`, which stays exactly as it was.
   *
   * Registered at module scope, not in `onReady`: `create-console` re-runs
   * `onReady` on macOS `activate`, and a second handler would double-close.
   */
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return; // the re-entrant quit below — let it through
    quitting = true;
    event.preventDefault();
    void flushRunOnQuit({
      stopRun: () => runner?.stop(),
      closeManualRun: () => runner?.closeManualRun(),
      pending: () => recorderWork,
      timeoutMs: QUIT_FLUSH_MS,
    }).then((outcome) => {
      if (outcome === 'timed-out') {
        logger?.warn({ ms: QUIT_FLUSH_MS }, 'run manifest did not flush before quit');
      }
      app.quit();
    });
  });

  void desktop.start();
}
