import { describe, it, expect } from 'vitest';
import { BOOTSTRAP_CADENCE, computeCadence, median } from '../src/main/cadence';

/**
 * Cadence answers "how long does a human pause between asks?" and is driven by
 * the MEDIAN — a different question and a different statistic from the stall
 * cap, which is driven by the slowest observation. Conflating the two is the
 * mistake these tests exist to prevent regressing.
 */

const s = (n: number): number => n * 1000;

describe('median', () => {
  it('takes the middle of an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the middle pair of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('computeCadence', () => {
  it('returns the v1 defaults before anything is measured', () => {
    expect(computeCadence([])).toEqual(BOOTSTRAP_CADENCE);
  });

  it('rejects sub-5s re-fires — the outlier that poisoned a mean once', () => {
    // 0.9s is not a generation. Including it would halve the median.
    expect(computeCadence([s(0.9), s(90), s(90)])).toEqual(computeCadence([s(90), s(90)]));
  });

  it('ignores a single extreme outlier, unlike a mean', () => {
    // A mean would be dragged upward by the 600s sample; the median must not be.
    const withOutlier = computeCadence([s(90), s(90), s(90), s(600)]);
    const without = computeCadence([s(90), s(90), s(90)]);
    expect(withOutlier).toEqual(without);
  });

  it('scales with the typical generation — a 90s median gives a ~11s base', () => {
    const { baseMs } = computeCadence([s(90), s(90), s(90)]);
    expect(baseMs).toBe(Math.round(s(90) * 0.12));
  });

  it('never drops below the floor for very fast generations', () => {
    expect(computeCadence([s(6), s(6)]).baseMs).toBe(3000);
  });

  it('never exceeds the ceiling for very slow ones', () => {
    expect(computeCadence([s(900), s(900)]).baseMs).toBe(30000);
  });

  it('jitter is a wide fraction of base — a tight jitter is still a rhythm', () => {
    const { baseMs, jitterMs } = computeCadence([s(100), s(100)]);
    expect(jitterMs).toBe(Math.round(baseMs * 0.75));
  });
});
