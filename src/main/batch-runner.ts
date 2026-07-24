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
  logger?: Logger;
}

const DEFAULTS: Required<RunConfig> = {
  chunkSize: 18, // re-prime a fresh chat every ~15–20 (plan §3)
  cadenceBaseMs: 3500,
  cadenceJitterMs: 3000,
  primerSettleMs: 6000, // let ChatGPT ingest the primer before the first prompt
  loadSettleMs: 2500, // let a fresh chat hydrate before feeding
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

  async start(config?: RunConfig): Promise<void> {
    if (!this.stopped) return; // already running
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
    this.seen.clear();
    this.awaiting = false;
    this.stopped = false;
    this.manualPaused = false;
    this.avgMs = null;
    this.note = undefined;

    this.logger?.info({ total: this.queue.length }, 'batch run started');
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
    this.clearTimers();
    this.guard.dispose();
    this.phase = 'stopped';
    this.note = undefined;
    this.emit();
    this.logger?.info({ harvested: this.harvestedCount }, 'batch run stopped');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async primeThenContinue(first: boolean): Promise<void> {
    this.phase = 'priming';
    this.note = first ? 'priming a fresh chat…' : 're-priming a fresh chat…';
    this.emit();

    await this.d.harness.newConversation();
    if (this.stopped) return;
    await this.sleep(this.cfg.loadSettleMs);
    if (this.stopped) return;

    if (this.primer.trim()) {
      await this.d.harness.feed(this.primer);
      if (this.stopped) return;
      await this.sleep(this.cfg.primerSettleMs);
      if (this.stopped) return;
    }
    await this.feedNext();
  }

  private async feedNext(): Promise<void> {
    if (this.stopped || this.manualPaused || this.guard.isPaused) return;
    if (this.idx >= this.queue.length) {
      this.phase = 'done';
      this.note = undefined;
      this.emit();
      this.logger?.info({ harvested: this.harvestedCount }, 'batch run complete');
      return;
    }
    const prompt = this.queue[this.idx];
    this.phase = 'feeding';
    this.note = undefined;
    this.emit();

    await this.d.harness.feed(prompt.text);
    if (this.stopped) return;

    this.awaiting = true;
    this.feedAt = Date.now();
    this.phase = 'awaiting';
    this.emit();
  }

  private async onImageDone(url: string): Promise<void> {
    if (this.stopped || !this.awaiting) return;
    if (!url || this.seen.has(url)) return; // flip-flop / re-fire — first UNSEEN wins
    this.seen.add(url);
    this.awaiting = false;

    const measured = this.feedAt ? Date.now() - this.feedAt : undefined;
    if (measured) this.avgMs = this.avgMs == null ? measured : this.avgMs * 0.7 + measured * 0.3;

    const prompt = this.queue[this.idx];
    const relPath = `${slugify(prompt.subject)}.png`;
    try {
      const savedPath = await this.d.harness.harvest(url, relPath);
      await this.d.markHarvested(prompt.id, savedPath);
      this.harvestedCount += 1;
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

    if (this.idx >= this.queue.length) {
      this.phase = 'done';
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
    this.idx += 1;
    if (this.idx >= this.queue.length) {
      this.phase = 'done';
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
    this.emit();
    this.logger?.warn({ waitedMs }, 'stall — pausing');
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
