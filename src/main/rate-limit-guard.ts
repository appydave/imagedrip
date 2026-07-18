import type { Logger } from '@appydave/core';

/**
 * rate-limit-guard (spec §6) — turn a detected provider limit-state into a pause,
 * not a blind spin. The harness emits `onRateLimit`; the batch runner feeds that
 * to `hit()`, then checks `isPaused` before every `feed()`. Account-safety, not a
 * nicety: the cost of getting ChatGPT automation wrong is the account (plan §7).
 *
 * Mechanism, not policy: it owns "are we allowed to send right now?" and the
 * backoff clock. WHEN to actually resume/stop is the caller's call — it may wait
 * for the timer, prompt the user, or stop the run entirely.
 */
export interface RateLimitGuardOptions {
  /** How long to pause after a limit is hit. Default 15 min (conservative). */
  backoffMs?: number;
  /** Called when a limit pauses the run (surface it to the user). */
  onPause?: (info: { text: string; resumeAt: number }) => void;
  /** Called when the backoff elapses and sending is allowed again. */
  onResume?: () => void;
  logger?: Logger;
}

const DEFAULT_BACKOFF_MS = 15 * 60 * 1000;

export class RateLimitGuard {
  private readonly backoffMs: number;
  private readonly onPause?: (info: { text: string; resumeAt: number }) => void;
  private readonly onResume?: () => void;
  private readonly logger?: Logger;

  private paused = false;
  private resumeAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // De-dupe: the observer re-fires the banner every DOM settle while it's visible.
  private lastHitAt = 0;

  constructor(options: RateLimitGuardOptions = {}) {
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
    this.logger = options.logger;
  }

  /** A limit banner was observed. Pause + schedule a resume (idempotent while paused). */
  hit(text: string): void {
    const now = Date.now();
    // Ignore repeat banners within a short window, or while already paused.
    if (this.paused || now - this.lastHitAt < 1000) return;
    this.lastHitAt = now;
    this.paused = true;
    this.resumeAt = now + this.backoffMs;
    this.logger?.warn({ text, resumeAt: this.resumeAt }, 'rate limit — pausing');
    this.onPause?.({ text, resumeAt: this.resumeAt });

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.resume(), this.backoffMs);
  }

  /** True while the run must NOT send (the batch runner gates `feed` on this). */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Milliseconds until the backoff elapses (0 when not paused). */
  msUntilResume(): number {
    return this.paused ? Math.max(0, this.resumeAt - Date.now()) : 0;
  }

  /** Force-resume early (e.g. the user chose to continue). */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.resumeAt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger?.info('rate limit — resuming');
    this.onResume?.();
  }

  /** Clear all state + timers (on stop/dispose). */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.paused = false;
    this.resumeAt = 0;
  }
}
