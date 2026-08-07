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

/** Headroom over the slowest seen — the cap must clear the known worst case. */
const MAX_FACTOR = 1.3;

/**
 * The slowest generation ImageDrip has actually observed.
 *
 * Run `2026-08-03-1446-smoothies`: normal images landed at 57–116s, and one took
 * 300s. That single sample is the evidence the bootstrap has to survive.
 */
const OBSERVED_SLOWEST_MS = 300 * 1000;

/**
 * No samples yet: assume a slow model rather than interrupt a healthy run.
 *
 * This was 4 minutes, and 4 minutes was too impatient — which is the SAME
 * failure the derived cap below was built to end, surviving in the one place the
 * derivation does not reach. In `2026-08-03-1446-smoothies` the run's only prior
 * timing was Dragonite's 0s, a mis-attributed DOM src that `MIN_PLAUSIBLE_MS`
 * correctly discards; with no valid samples the budget was still bootstrap when
 * a genuine 300s generation was in flight, and it fired at 240s.
 *
 * So it is no longer chosen either: it is the worst case actually seen, with the
 * same headroom the computed cap gives its own worst case. A slower generation
 * than any yet observed raises `OBSERVED_SLOWEST_MS`, and this follows.
 */
export const BOOTSTRAP_STALL_MS = Math.round(OBSERVED_SLOWEST_MS * MAX_FACTOR);

/**
 * Below this, it was not a generation.
 *
 * A real image takes tens of seconds. A sub-5s "generation" is a re-fired or
 * mis-attributed DOM src, and averaging it in drags the budget toward zero.
 * Live run 2026-08-03-1233 recorded 0.9s for "José Rizal" — with that sample
 * included the budget computed 113s, and the next legitimate image (153.7s)
 * was declared a stall by the very mechanism meant to prevent that.
 */
const MIN_PLAUSIBLE_MS = 5 * 1000;

/**
 * Samples needed before the budget is allowed to tighten below bootstrap.
 *
 * Two samples are not a distribution. In that same run, 1.3× the slowest of two
 * samples (86.7s) gave 113s — and the very next image took 153.7s. Early on the
 * honest position is that we do not yet know the spread, so stay conservative
 * and only tighten once there is enough evidence to justify it.
 */
const CONFIDENT_SAMPLES = 5;

/** Never impatient enough to cut off a normal image… */
const MIN_STALL_MS = 90 * 1000;
/** …and never so patient that a genuinely dead generation hangs the run. */
const MAX_STALL_MS = 15 * 60 * 1000;

/** Headroom over the mean — covers ordinary run-to-run variance. */
const MEAN_FACTOR = 1.75;

/**
 * The stall cap implied by the generation times observed so far.
 *
 * Pure and monotonic in the samples: a new slow image can only ever RAISE the
 * cap, never lower it below what has already been survived. That is what makes
 * it self-correcting — the first image to exceed the budget widens the budget
 * for the ones after it.
 */
export function computeStallMs(samples: number[]): number {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS);
  if (valid.length === 0) return BOOTSTRAP_STALL_MS;

  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const slowest = Math.max(...valid);

  const budget = Math.max(mean * MEAN_FACTOR, slowest * MAX_FACTOR);

  // Tightening below bootstrap requires enough samples to have earned it.
  // Widening is always allowed — a slow image is evidence immediately.
  const floor = valid.length < CONFIDENT_SAMPLES ? BOOTSTRAP_STALL_MS : MIN_STALL_MS;

  return Math.round(Math.min(MAX_STALL_MS, Math.max(floor, budget)));
}

/** Summary stats for the timings panel — what the cap was derived FROM. */
export function summarise(samples: number[]): {
  count: number;
  meanMs: number | null;
  minMs: number | null;
  maxMs: number | null;
} {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS);
  if (valid.length === 0) return { count: 0, meanMs: null, minMs: null, maxMs: null };
  return {
    count: valid.length,
    meanMs: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length),
    minMs: Math.min(...valid),
    maxMs: Math.max(...valid),
  };
}
