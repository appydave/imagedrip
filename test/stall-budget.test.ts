import { describe, it, expect } from 'vitest';
import { BOOTSTRAP_STALL_MS, computeStallMs, summarise } from '../src/main/stall-budget';

/**
 * The stall cap used to be a constant somebody guessed — and it was guessed
 * wrong twice, halting healthy runs on images that were merely slow. These
 * tests pin the property that replaces the guess: the budget is derived from
 * measured generations, and can only ever widen to accommodate a slow one.
 */

const s = (n: number): number => n * 1000;

describe('computeStallMs', () => {
  it('falls back to the bootstrap budget with no samples', () => {
    expect(computeStallMs([])).toBe(BOOTSTRAP_STALL_MS);
  });

  it("clears David's worked example — ~2min average pads to about 3min", () => {
    // "2 minutes, 2 minutes 10, 1 minute 50, and 2 minutes 13 … the average is
    // 2 minutes, and we can set our padding to 3 minutes, right, or 2 minutes 30"
    const budget = computeStallMs([s(120), s(130), s(110), s(133)]);
    expect(budget).toBeGreaterThanOrEqual(s(150)); // at least 2m30
    expect(budget).toBeLessThanOrEqual(s(240)); // and not absurdly patient
  });

  it('clears the SLOWEST sample, not just the average', () => {
    // An average-based cap would declare a stall on every above-average image.
    const samples = [s(60), s(60), s(60), s(200)];
    expect(computeStallMs(samples)).toBeGreaterThan(s(200));
  });

  it('widens when a slow image appears — the self-correcting property', () => {
    const before = computeStallMs([s(120), s(120)]);
    const after = computeStallMs([s(120), s(120), s(400)]);
    expect(after).toBeGreaterThan(before);
  });

  it('never drops below the floor, however fast the samples', () => {
    // Ten fast-but-plausible samples: past CONFIDENT_SAMPLES, so tightening is
    // allowed — down to the hard floor, never below.
    expect(computeStallMs(Array(10).fill(s(6)))).toBe(90 * 1000);
  });

  /**
   * REGRESSION — run 2026-08-03-1233-smoothies.
   *
   * Recorded generations: 0.9s, 86.7s, then 153.7s. The budget computed 113s
   * from the first two and declared a stall on the third, which was a perfectly
   * healthy image. The adaptive budget caused the stall it exists to prevent.
   */
  describe('regression: the run that stalled at 113s', () => {
    it('discards the 0.9s sample — that was a re-fire, not a generation', () => {
      expect(computeStallMs([s(0.9), s(86.7)])).toBe(computeStallMs([s(86.7)]));
    });

    it('does not tighten below bootstrap on two samples', () => {
      // The exact inputs that produced 113s must now clear the 153.7s image.
      const budget = computeStallMs([s(0.9), s(86.7)]);
      expect(budget).toBe(BOOTSTRAP_STALL_MS);
      expect(budget).toBeGreaterThan(s(153.7));
    });

    it('still widens past bootstrap once a genuinely slow image lands', () => {
      // Widening never waits for confidence — one slow image is evidence enough.
      expect(computeStallMs([s(0.9), s(86.7), s(153.7)])).toBeGreaterThan(s(153.7));
      expect(computeStallMs([s(300), s(300)])).toBeGreaterThan(BOOTSTRAP_STALL_MS);
    });
  });

  it('never exceeds the ceiling, so a dead generation still ends the wait', () => {
    expect(computeStallMs([s(3600)])).toBe(15 * 60 * 1000);
  });

  it('ignores junk samples rather than poisoning the budget', () => {
    expect(computeStallMs([NaN, 0, -5])).toBe(BOOTSTRAP_STALL_MS);
    expect(computeStallMs([NaN, s(120), s(120)])).toBe(computeStallMs([s(120), s(120)]));
  });
});

describe('summarise', () => {
  it('reports nothing when there is nothing measured', () => {
    expect(summarise([])).toEqual({ count: 0, meanMs: null, minMs: null, maxMs: null });
  });

  it('reports the spread the operator needs to sanity-check the budget', () => {
    expect(summarise([s(100), s(200), s(300)])).toEqual({
      count: 3,
      meanMs: s(200),
      minMs: s(100),
      maxMs: s(300),
    });
  });
});
