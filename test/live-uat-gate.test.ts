import { describe, it, expect } from 'vitest';
import { uatEnabled } from '../src/shared/live-uat';

/**
 * A4 — the Live UAT gate defaults ON.
 *
 * Evidence: `~/Library/Application Support/imagedrip/live-uat/` did not exist on
 * 2026-08-07 — no snags, no verdicts, four days after the feature shipped. The
 * default was the whole reason.
 */

describe('uatEnabled', () => {
  it('is ON for a user who has never touched the toggle', () => {
    expect(uatEnabled(null)).toBe(true);
  });

  it('stays OFF for someone who explicitly turned it off', () => {
    // The one case that must NOT flip. Re-enabling a deliberate off on every
    // launch is precisely the nag the original default was avoiding.
    expect(uatEnabled('off')).toBe(false);
  });

  it('is ON for someone who explicitly turned it on', () => {
    expect(uatEnabled('on')).toBe(true);
  });

  it('treats a junk value as never-decided, not as off', () => {
    // A stale or hand-edited localStorage entry is not a decision, and the
    // decision is the only thing allowed to keep the gate shut.
    expect(uatEnabled('')).toBe(true);
    expect(uatEnabled('true')).toBe(true);
  });
});
