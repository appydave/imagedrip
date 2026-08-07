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
    //
    // Six samples, not four: past CONFIDENT_SAMPLES the bootstrap floor lifts
    // and the DERIVATION is what is being measured here. Below it the answer is
    // the floor for every input, which tests the floor rather than the maths.
    const budget = computeStallMs([s(120), s(130), s(110), s(133), s(125), s(118)]);
    expect(budget).toBeGreaterThanOrEqual(s(150)); // at least 2m30
    expect(budget).toBeLessThanOrEqual(s(240)); // and not absurdly patient
  });

  it('stays at the bootstrap floor until there are enough samples to tighten', () => {
    // The same four samples BELOW CONFIDENT_SAMPLES: the derivation would give
    // ~3m30, but four timings are not yet a distribution, so the conservative
    // floor stands. This is the boundary the test above deliberately clears.
    expect(computeStallMs([s(120), s(130), s(110), s(133)])).toBe(BOOTSTRAP_STALL_MS);
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
      expect(computeStallMs([s(300), s(300)])).toBeGreaterThan(BOOTSTRAP_STALL_MS);
      expect(computeStallMs([s(0.9), s(86.7), s(153.7)])).toBeGreaterThan(s(153.7));
    });
  });

  /**
   * REGRESSION — run 2026-08-03-1446-smoothies (A3b).
   *
   * Dragonite recorded 0s — a mis-attributed DOM src, correctly discarded by
   * MIN_PLAUSIBLE_MS — so the run had NO valid samples and was still on the
   * bootstrap budget when a genuine 300s generation was in flight. The bootstrap
   * was 240s, and it fired: the guess that the derived cap replaced survived in
   * the one place the derivation does not reach.
   */
  describe('regression: the bootstrap that stalled a 300s image', () => {
    it('clears the slowest generation actually observed', () => {
      expect(BOOTSTRAP_STALL_MS).toBeGreaterThan(s(300));
    });

    it('is still on bootstrap after the 0s sample is discarded — and now survives it', () => {
      const budget = computeStallMs([0]);
      expect(budget).toBe(BOOTSTRAP_STALL_MS);
      expect(budget).toBeGreaterThan(s(300));
    });

    it('stays under the ceiling, so a dead generation still ends the wait', () => {
      expect(BOOTSTRAP_STALL_MS).toBeLessThan(15 * 60 * 1000);
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
