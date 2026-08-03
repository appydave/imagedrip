/**
 * StallBudget — derive the stall cap from what generations ACTUALLY take.
 *
 * A stall cap is a claim about how long an image "should" take, and until now
 * that claim was a guess baked into a constant. It was wrong twice: 3 minutes
 * was too short for detailed character sheets, so the runner declared stalls on
 * images that were generating perfectly well, and the run halted every couple
 * of prompts. Raising the constant to 6 minutes replaced one guess with another.
 *
 * David's framing, 2026-08-03:
 *
 *   "If it takes 2 minutes, 2 minutes 10, 1 minute 50, and 2 minutes 13, then
 *    the average is 2 minutes, and we can set our padding to 3 minutes… If then
 *    one of them goes over 2 minutes 30, we should be able to increase our
 *    padding further, but we can't do it if we don't track it."
 *
 * So the cap is computed, not chosen. It is driven by the SLOWEST observed
 * generation as well as the mean, because the slowest is what a stall cap has
 * to survive — an average-based cap declares a stall on every above-average
 * image, which is roughly half of them.
 */

/** No samples yet: assume a slow model rather than interrupt a healthy run. */
export const BOOTSTRAP_STALL_MS = 4 * 60 * 1000;

/** Never impatient enough to cut off a normal image… */
const MIN_STALL_MS = 90 * 1000;
/** …and never so patient that a genuinely dead generation hangs the run. */
const MAX_STALL_MS = 15 * 60 * 1000;

/** Headroom over the mean — covers ordinary run-to-run variance. */
const MEAN_FACTOR = 1.75;
/** Headroom over the slowest seen — the cap must clear the known worst case. */
const MAX_FACTOR = 1.3;

/**
 * The stall cap implied by the generation times observed so far.
 *
 * Pure and monotonic in the samples: a new slow image can only ever RAISE the
 * cap, never lower it below what has already been survived. That is what makes
 * it self-correcting — the first image to exceed the budget widens the budget
 * for the ones after it.
 */
export function computeStallMs(samples: number[]): number {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms > 0);
  if (valid.length === 0) return BOOTSTRAP_STALL_MS;

  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const slowest = Math.max(...valid);

  const budget = Math.max(mean * MEAN_FACTOR, slowest * MAX_FACTOR);
  return Math.round(Math.min(MAX_STALL_MS, Math.max(MIN_STALL_MS, budget)));
}

/** Summary stats for the timings panel — what the cap was derived FROM. */
export function summarise(samples: number[]): {
  count: number;
  meanMs: number | null;
  minMs: number | null;
  maxMs: number | null;
} {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms > 0);
  if (valid.length === 0) return { count: 0, meanMs: null, minMs: null, maxMs: null };
  return {
    count: valid.length,
    meanMs: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length),
    minMs: Math.min(...valid),
    maxMs: Math.max(...valid),
  };
}
