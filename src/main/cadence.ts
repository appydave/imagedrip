/**
 * Cadence — how long to wait BETWEEN images.
 *
 * This is not the stall cap, and conflating the two has already caused
 * confusion. They answer different questions and are driven by different
 * statistics:
 *
 *   stall cap (stall-budget.ts)  "when is a generation DEAD?"
 *                                → driven by the SLOWEST observation, because
 *                                  the cap must clear the worst real case
 *
 *   cadence   (this file)        "how long does a human pause between asks?"
 *                                → driven by the MEDIAN, because it should
 *                                  track the typical case, not the worst
 *
 * Median, not mean: the corpus already contains a 0.9s re-fire that poisoned a
 * mean-based calculation once (run 2026-08-03-1233 — see
 * docs/kdd/learnings/). The same MIN_PLAUSIBLE_MS filter applies here.
 *
 * Why cadence should scale with generation time at all: a fixed 3.5s gap after
 * a 90-second generation is not a human rhythm — nobody waits a minute and a
 * half for an image and then fires the next prompt in three seconds. The pause
 * a person takes scales with how long they have been waiting, because they
 * look at the result before asking for the next thing.
 */

/** Below this it was not a generation — a re-fired src. Matches stall-budget. */
const MIN_PLAUSIBLE_MS = 5 * 1000;

/**
 * Cadence as a fraction of the typical generation. At a 90s median this gives
 * a ~11s base, which reads as "looked at it, then typed the next one".
 */
const CADENCE_FRACTION = 0.12;

/** Never so fast it looks scripted… */
const MIN_CADENCE_MS = 3 * 1000;
/** …and never so slow that a long queue becomes unusable. */
const MAX_CADENCE_MS = 30 * 1000;

/**
 * Jitter as a fraction of base. Wide on purpose: a tight jitter around a fixed
 * base is still a detectable rhythm, just a fuzzy one.
 */
const JITTER_FRACTION = 0.75;

/** The cadence before anything has been measured. Matches the v1 defaults. */
export const BOOTSTRAP_CADENCE = { baseMs: 3500, jitterMs: 3000 };

/** Median of a numeric list. Even counts average the middle pair. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The inter-image delay implied by the generations observed so far.
 *
 * Pure. Returns the v1 defaults until there is at least one plausible sample,
 * so a run with no data behaves exactly as it did before.
 */
export function computeCadence(samples: number[]): { baseMs: number; jitterMs: number } {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS);
  if (valid.length === 0) return BOOTSTRAP_CADENCE;

  const typical = median(valid);
  const baseMs = Math.round(
    Math.min(MAX_CADENCE_MS, Math.max(MIN_CADENCE_MS, typical * CADENCE_FRACTION)),
  );
  return { baseMs, jitterMs: Math.round(baseMs * JITTER_FRACTION) };
}
