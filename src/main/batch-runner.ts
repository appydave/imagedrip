import type { Logger } from '@appydave/core';
import type { Prompt } from '../shared/domain.js';
import { slugify } from '../shared/domain.js';
import type { RunConfig, RunStatus } from '../shared/ipc.js';
import { RateLimitGuard } from './rate-limit-guard.js';
import type { WebviewHarness } from './webview-harness.js';

/**
 * BatchRunner (plan §5 runtime engine) — the Auto loop that drives a theme end to
 * end: prime a fresh chat → drip each queued prompt on human cadence → detect the
 * finished image → harvest/name/route → advance → re-prime every ~chunk.
 *
 * Mechanism split (spec §API): the harness owns WRITE/READ + emits `image-done`;
 * this runner owns WHEN (cadence, chunking, pause) and turns each done-image into a
 * harvest. STOP halts the loop cleanly; the ChatGPT view (login) stays attached.
 *
 * Completion de-dupe (handover gotcha): the observer re-fires `image-done` with
 * flip-flopping srcs. We gate on `awaiting` (only the image after a feed counts) AND
 * a `seen` set (never harvest the same src twice) → first UNSEEN src wins. NOT
 * "last container".
 */
/**
 * Run-history hooks (WP1). `start` returns the run id, which becomes the
 * harvest subfolder (`<outputDir>/<run-id>/…`). Every hook is best-effort:
 * a manifest failure must never wedge or slow the run itself.
 */
export interface RunRecorderHooks {
  start(info: { primer: string; prompts: Prompt[]; mode: 'auto' | 'dial-in' }): Promise<string>;
  /** Register a prompt injected into an already-open (dial-in) run (WP4). */
  addPrompt(prompt: Prompt): Promise<void>;
  harvest(promptId: string, file: string, generationMs?: number, imageUrl?: string): Promise<void>;
  refusal(promptId: string): Promise<void>;
  reprime(afterHarvested: number): Promise<void>;
  pause(reason: string): Promise<void>;
  finish(outcome: 'complete' | 'stopped'): Promise<void>;
}

export interface BatchRunnerDeps {
  harness: WebviewHarness;
  /** primer = compose(Brand, Project) — posted once per conversation. */
  getPrimer: () => Promise<string>;
  /** The queued prompts, in run order (snapshot taken at start). */
  getQueue: () => Promise<Prompt[]>;
  /** Persist a harvested prompt (status + saved rel path). */
  markHarvested: (promptId: string, relPath: string) => Promise<void>;
  /** Push a status snapshot to the renderer. */
  emit: (status: RunStatus) => void;
  /** Optional run-history recorder (WP1) — manifest + per-run subfolder. */
  recorder?: RunRecorderHooks;
  logger?: Logger;
}

const DEFAULTS: Required<RunConfig> = {
  entry: 'fresh',
  chunkSize: 18, // re-prime a fresh chat every ~15–20 (plan §3)
  cadenceBaseMs: 3500,
  cadenceJitterMs: 3000,
  // WP5 (B329 #12 symptom): after a forced new chat the prompt pasted but never
  // sent — Enter lands before the composer is live / while the primer reply is
  // still streaming. Longer settles are the no-driver-change mitigation; the
  // live verification is David's WP5 acceptance run.
  primerSettleMs: 9000, // let ChatGPT ingest the primer before the first prompt
  loadSettleMs: 4000, // let a fresh chat hydrate before feeding
};

export class BatchRunner {
  private readonly d: BatchRunnerDeps;
  private readonly logger?: Logger;
  private cfg: Required<RunConfig> = DEFAULTS;

  private queue: Prompt[] = [];
  private primer = '';
  private idx = 0;
  private harvestedCount = 0;
  private readonly seen = new Set<string>();
  /** Harvest subfolder for this run (the run id) — '' when no recorder. */
  private runPrefix = '';
  private recorderActive = false;
  /** A single manual (Dial-in) inject is in flight (WP4). */
  private manual = false;
  /** The open dial-in run record, if any — stays open across injects (WP4). */
  private manualRunId = '';
  /**
   * Synchronous entry latch (advisory-1 #1). `stopped` only flips AFTER the
   * async setup awaits in start()/injectOne(), so two rapid entries could both
   * pass the `!stopped` guard and BOTH reach harness.feed() — two prompts into
   * one chat with no image between, the exact North-Star violation. This latch
   * is set before ANY await and closes that window.
   */
  private busy = false;
  /** A harness.feed() await is in flight (advisory-1 #6) — see onImageDone. */
  private feedInFlight = false;
  /** The current conversation carries a primer / dial-in touch (advisory-1 #8). */
  private chatPrimed = false;

  private phase: RunStatus['phase'] = 'idle';
  private awaiting = false;
  private stopped = true;
  private manualPaused = false;
  private feedAt = 0;
  private avgMs: number | null = null;
  private note: string | undefined;

  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly guard: RateLimitGuard;

  constructor(deps: BatchRunnerDeps) {
    this.d = deps;
    this.logger = deps.logger;

    // Rate-limit → pause + notify, never spin (plan §5, account-safety §7).
    this.guard = new RateLimitGuard({
      logger: this.logger,
      onPause: ({ text, resumeAt }) => {
        this.phase = 'paused';
        this.note = text;
        this.recordSafe((r) => r.pause(text));
        this.emit(Math.max(0, resumeAt - Date.now()));
      },
      onResume: () => {
        this.note = undefined;
        if (!this.stopped && !this.manualPaused) void this.feedNext();
      },
    });

    // The runner owns the harness callbacks for the whole run.
    this.d.harness.onImageDone((e) => void this.onImageDone(e.imageUrl));
    this.d.harness.onRateLimit((e) => this.guard.hit(e.text));
    this.d.harness.onRefused(() => this.onRefused());
    this.d.harness.onStall((e) => this.onStall(e.waitedMs));
  }

  get running(): boolean {
    return !this.stopped;
  }

  /** Whether the LIVE conversation is primed/touched — main-process truth for
   *  the renderer's run-entry default (advisory-1 #8). */
  get chatIsPrimed(): boolean {
    return this.chatPrimed;
  }

  async start(config?: RunConfig): Promise<void> {
    if (!this.stopped || this.busy) return; // already running / entry in flight
    this.busy = true; // sync latch BEFORE any await (advisory-1 #1)
    try {
      await this.startInner(config);
    } finally {
      this.busy = false;
    }
  }

  private async startInner(config?: RunConfig): Promise<void> {
    this.closeManualRun(); // a live Auto run supersedes any open dial-in record
    this.cfg = { ...DEFAULTS, ...config };
    this.queue = (await this.d.getQueue()).filter((p) => p.status === 'queued');
    if (this.queue.length === 0) {
      this.phase = 'done';
      this.emit();
      return;
    }
    this.primer = await this.d.getPrimer();
    this.idx = 0;
    this.harvestedCount = 0;
    // WP5: only a FRESH chat may forget seen srcs. On 'continue' the chat still
    // holds earlier images (hand-made or prior runs) whose srcs can re-fire —
    // the seen set (incl. WP4 passive learning) is what stops mis-attribution.
    if (this.cfg.entry === 'fresh') this.seen.clear();
    this.awaiting = false;
    this.stopped = false;
    this.manualPaused = false;
    this.avgMs = null;
    this.note = undefined;

    // Open the run record (WP1) — its id becomes the harvest subfolder.
    this.runPrefix = '';
    this.recorderActive = false;
    // Fail LOUD if the run record cannot open (advisory-1 #7): an unrecorded
    // run would silently drop harvests into the output ROOT with no manifest.
    if (this.d.recorder) {
      try {
        this.runPrefix = await this.d.recorder.start({
          primer: this.primer,
          prompts: this.queue,
          mode: 'auto',
        });
        this.recorderActive = true;
      } catch (err) {
        this.stopped = true;
        this.phase = 'idle';
        this.emit();
        throw new Error(`cannot open the run record: ${String(err)}`);
      }
    }

    this.logger?.info(
      { total: this.queue.length, runId: this.runPrefix, entry: this.cfg.entry },
      'batch run started',
    );

    // WP5 — THE fix for B329 #12: 'continue' reuses the dialled-in conversation
    // as-is. No newConversation(), no primer — the chat already carries the
    // refinements. Straight to the queue, same pacing gate.
    if (this.cfg.entry === 'continue') {
      await this.feedNext();
      return;
    }
    await this.primeThenContinue(true);
  }

  /** Manual pause (the operator chose to hold). */
  pause(): void {
    if (this.stopped) return;
    this.manualPaused = true;
    this.clearTimers();
    this.phase = 'paused';
    this.note = 'paused by you';
    this.emit();
  }

  /** Resume from a manual pause / rate-limit / stall (re-feeds the current prompt). */
  resume(): void {
    if (this.stopped) return;
    this.manualPaused = false;
    this.guard.resume();
    this.note = undefined;
    // If we were awaiting an image (stall), re-feed the current prompt; else advance.
    void this.feedNext();
  }

  /** STOP — halt the loop cleanly. The ChatGPT view (login) stays attached. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.awaiting = false;
    this.manual = false;
    this.manualRunId = '';
    this.clearTimers();
    this.guard.dispose();
    this.phase = 'stopped';
    this.note = undefined;
    this.finishRun('stopped');
    this.emit();
    this.logger?.info({ harvested: this.harvestedCount }, 'batch run stopped');
  }

  // ── manual injection (WP4 — Dial-in is a real mode) ────────────────────────

  /**
   * "Initialise project" — post the composed primer into the LIVE chat and
   * submit it. No new conversation, no queue: the dial-in complement of Copy
   * Primer. Uses the proven feed() path (clipboard → click → paste → Enter).
   */
  async injectPrimer(): Promise<void> {
    if (!this.stopped || this.busy) throw new Error('an injection or run is already in flight');
    this.busy = true; // sync latch BEFORE any await (advisory-1 #1)
    try {
      const primer = await this.d.getPrimer();
      if (!primer.trim()) throw new Error('primer is empty — fill Brand/Project first');
      await this.feedGuarded(primer);
      this.chatPrimed = true; // the conversation now carries the primer (#8)
      this.logger?.info({ chars: primer.length }, 'dial-in: primer injected');
    } finally {
      this.busy = false;
    }
  }

  /**
   * Inject ONE queued prompt into the live chat and harvest its image into the
   * current dial-in run. Reuses the exact awaiting-gate + seen-set the Auto
   * loop uses — same de-dupe, same harvest path, no parallel mechanism.
   */
  async injectOne(promptId: string): Promise<void> {
    if (!this.stopped || this.busy) throw new Error('an injection or run is already in flight');
    this.busy = true; // sync latch BEFORE any await (advisory-1 #1)
    try {
      const prompt = (await this.d.getQueue()).find(
        (p) => p.id === promptId && p.status === 'queued',
      );
      if (!prompt) throw new Error('prompt not found or already harvested');

      // Lazily open ONE dial-in run record; later injects harvest into it too.
      // Fail LOUD if it cannot open (advisory-1 #7) — otherwise the harvest
      // would silently land in the output ROOT instead of a run folder.
      if (!this.manualRunId && this.d.recorder) {
        const primer = await this.d.getPrimer();
        try {
          this.manualRunId = await this.d.recorder.start({ primer, prompts: [], mode: 'dial-in' });
          this.recorderActive = true;
        } catch (err) {
          throw new Error(`cannot open the dial-in run record: ${String(err)}`);
        }
      }
      this.runPrefix = this.manualRunId;
      this.recordSafe((r) => r.addPrompt(prompt));

      // Single-item "run" through the normal machinery. seen is NOT cleared —
      // images already in the chat stay known and can never be mis-attributed.
      this.queue = [prompt];
      this.idx = 0;
      this.manual = true;
      this.stopped = false;
      this.manualPaused = false;
      this.note = undefined;

      this.phase = 'feeding';
      this.emit();
      try {
        await this.feedGuarded(prompt.text);
      } catch (err) {
        // The feed never reached the chat — roll back to idle, don't wedge.
        this.stopped = true;
        this.manual = false;
        this.phase = 'idle';
        this.emit();
        throw err;
      }
      if (this.stopped) return;
      this.chatPrimed = true; // dial-in touched the conversation (#8)
      this.awaiting = true;
      this.feedAt = Date.now();
      this.phase = 'awaiting';
      this.emit();
      this.logger?.info({ subject: prompt.subject }, 'dial-in: prompt injected');
    } finally {
      this.busy = false;
    }
  }

  /** Close the open dial-in run record (auto-start / project switch / stop). */
  closeManualRun(): void {
    if (!this.manualRunId) return;
    this.manualRunId = '';
    this.runPrefix = '';
    this.finishRun('complete');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async primeThenContinue(first: boolean): Promise<void> {
    this.phase = 'priming';
    this.note = first ? 'priming a fresh chat…' : 're-priming a fresh chat…';
    if (!first) this.recordSafe((r) => r.reprime(this.harvestedCount));
    this.emit();

    this.chatPrimed = false; // fresh conversation — nothing dialled in yet (#8)
    await this.d.harness.newConversation();
    if (this.stopped) return;
    await this.sleep(this.cfg.loadSettleMs);
    if (this.stopped) return;

    if (this.primer.trim()) {
      await this.feedGuarded(this.primer);
      if (this.stopped) return;
      this.chatPrimed = true; // primer posted — the chat is primed again (#8)
      await this.sleep(this.cfg.primerSettleMs);
      if (this.stopped) return;
    }
    await this.feedNext();
  }

  /**
   * feed() with the in-flight window marked (advisory-1 #6): passive
   * seen-banking is suppressed while a feed await is live, so an image-done
   * landing in that gap cannot bank OUR image's src and silently stall the run.
   */
  private async feedGuarded(text: string): Promise<void> {
    this.feedInFlight = true;
    try {
      await this.d.harness.feed(text);
    } finally {
      this.feedInFlight = false;
    }
  }

  private async feedNext(): Promise<void> {
    if (this.stopped || this.manualPaused || this.guard.isPaused) return;
    if (this.idx >= this.queue.length) {
      this.phase = 'done';
      this.note = undefined;
      this.finishRun('complete');
      this.emit();
      this.logger?.info({ harvested: this.harvestedCount }, 'batch run complete');
      return;
    }
    const prompt = this.queue[this.idx];
    this.phase = 'feeding';
    this.note = undefined;
    this.emit();

    await this.feedGuarded(prompt.text);
    if (this.stopped) return;

    this.awaiting = true;
    this.feedAt = Date.now();
    this.phase = 'awaiting';
    this.emit();
  }

  private async onImageDone(url: string): Promise<void> {
    if (!url) return;
    if (this.stopped || !this.awaiting) {
      // Passive learning (WP4): an image finishing while we are NOT awaiting
      // (e.g. hand-driven dial-in) is remembered, so a later DOM re-fire of its
      // src can never be mis-attributed to an injected prompt. This only ADDS
      // to "first UNSEEN wins" — the gate itself is unchanged.
      // Advisory-1 #6: never bank while a feed await is in flight — that could
      // be OUR image's src, and banking it would make it unharvestable.
      if (!this.feedInFlight) this.seen.add(url);
      return;
    }
    if (this.seen.has(url)) return; // flip-flop / re-fire — first UNSEEN wins
    this.seen.add(url);
    this.awaiting = false;

    const measured = this.feedAt ? Date.now() - this.feedAt : undefined;
    if (measured) this.avgMs = this.avgMs == null ? measured : this.avgMs * 0.7 + measured * 0.3;

    const prompt = this.queue[this.idx];
    const file = `${slugify(prompt.subject)}.png`;
    const relPath = this.runPrefix ? `${this.runPrefix}/${file}` : file;
    try {
      const savedPath = await this.d.harness.harvest(url, relPath);
      await this.d.markHarvested(prompt.id, savedPath);
      this.harvestedCount += 1;
      this.recordSafe((r) => r.harvest(prompt.id, file, measured, url));
      this.logger?.info({ subject: prompt.subject, savedPath, measured }, 'harvested');
    } catch (err) {
      // A harvest failure must not wedge the run — surface + advance past it.
      this.note = `harvest failed: ${prompt.subject}`;
      this.logger?.warn({ err: String(err), subject: prompt.subject }, 'harvest failed');
    }
    if (this.stopped) return;

    this.idx += 1;
    this.phase = 'harvested';
    this.emit();

    // A manual inject is one prompt: return to idle, keep the dial-in run
    // record OPEN so the next inject harvests into the same folder (WP4).
    if (this.manual) {
      this.manual = false;
      this.stopped = true;
      this.emit();
      return;
    }

    if (this.idx >= this.queue.length) {
      this.phase = 'done';
      this.finishRun('complete');
      this.emit();
      this.logger?.info({ harvested: this.harvestedCount }, 'batch run complete');
      return;
    }
    // Chunk boundary → re-prime a fresh chat to fight drift (plan §3).
    if (this.harvestedCount > 0 && this.harvestedCount % this.cfg.chunkSize === 0) {
      await this.primeThenContinue(false);
      return;
    }
    this.scheduleNextFeed();
  }

  private onRefused(): void {
    if (this.stopped || !this.awaiting) return;
    this.awaiting = false;
    const prompt = this.queue[this.idx];
    this.note = `refused: ${prompt?.subject ?? '?'} — skipped`;
    this.logger?.warn({ subject: prompt?.subject }, 'prompt refused — skipping');
    if (prompt) this.recordSafe((r) => r.refusal(prompt.id));
    if (this.manual) {
      this.manual = false;
      this.stopped = true;
      this.emit();
      return;
    }
    this.idx += 1;
    if (this.idx >= this.queue.length) {
      this.phase = 'done';
      this.finishRun('complete');
      this.emit();
      return;
    }
    this.scheduleNextFeed();
  }

  private onStall(waitedMs: number): void {
    if (this.stopped || !this.awaiting) return;
    // No image within the cap — hold and surface; the operator resumes or stops.
    this.manualPaused = true;
    this.clearTimers();
    this.phase = 'paused';
    this.note = `stalled — no image in ${Math.round(waitedMs / 1000)}s`;
    this.recordSafe((r) => r.pause(this.note ?? 'stall'));
    this.emit();
    this.logger?.warn({ waitedMs }, 'stall — pausing');
  }

  /** Fire a recorder hook without ever letting it wedge or slow the run. */
  private recordSafe(fn: (r: RunRecorderHooks) => Promise<void>): void {
    if (!this.recorderActive || !this.d.recorder) return;
    void fn(this.d.recorder).catch((err) =>
      this.logger?.warn({ err: String(err) }, 'run recorder hook failed'),
    );
  }

  /** Close the run record exactly once per run. */
  private finishRun(outcome: 'complete' | 'stopped'): void {
    if (!this.recorderActive || !this.d.recorder) return;
    this.recorderActive = false;
    void this.d.recorder
      .finish(outcome)
      .catch((err) => this.logger?.warn({ err: String(err) }, 'run recorder finish failed'));
  }

  private scheduleNextFeed(): void {
    const delay = this.cfg.cadenceBaseMs + Math.floor(Math.random() * this.cfg.cadenceJitterMs);
    this.phase = 'waiting';
    this.emit(delay);
    const t = setTimeout(() => {
      this.timers.delete(t);
      void this.feedNext();
    }, delay);
    this.timers.add(t);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, ms);
      this.timers.add(t);
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private emit(nextFeedInMs?: number): void {
    const remainingToChunk = this.cfg.chunkSize - (this.harvestedCount % this.cfg.chunkSize);
    this.d.emit({
      phase: this.phase,
      total: this.queue.length,
      harvested: this.harvestedCount,
      currentIndex: this.idx,
      currentSubject: this.queue[this.idx]?.subject ?? null,
      reprimeInImages: this.phase === 'done' ? 0 : remainingToChunk,
      avgMs: this.avgMs,
      nextFeedInMs: nextFeedInMs ?? null,
      note: this.note,
      at: Date.now(),
    });
  }
}
