import { describe, it, expect } from 'vitest';
import {
  buildEngineReadiness,
  DETACHED_HINT,
  INDETERMINATE_HINT,
  SIGNED_OUT_HINT,
  type EngineProbe,
} from '../src/main/engine-readiness';

/**
 * The engine-readiness verdict.
 *
 * This exists because the v4 control surface can start a run with nobody
 * looking at the window, and `WebviewHarness.feed` does NOT abort when it cannot
 * find the composer — it pastes into whatever holds focus and presses Return.
 * On a signed-out page that is the login form.
 *
 * So the property under test is not "does it detect a login screen". It is
 * **nothing except a confirmed composer is allowed to read as ready.** Every
 * uncertain case must refuse, because the cost of a false ready is typing prompt
 * text into a credential field once per queued prompt, and the cost of a false
 * not-ready is a hint the user can act on in ten seconds.
 */

const NOW = 1_800_000_000_000;
const PROBE_AT = NOW - 250;

function probe(over: Partial<EngineProbe> = {}): EngineProbe {
  return {
    composer: true,
    loginAffordance: false,
    readyState: 'complete',
    url: 'https://chatgpt.com/',
    at: PROBE_AT,
    ...over,
  };
}

describe('buildEngineReadiness — ready', () => {
  it('is ready when the composer is present', () => {
    const r = buildEngineReadiness({ now: NOW, attached: true, probe: probe() });
    expect(r.ready).toBe(true);
    expect(r.state).toBe('ready');
  });

  it('carries no hint when ready — a hint implies something to fix', () => {
    const r = buildEngineReadiness({ now: NOW, attached: true, probe: probe() });
    expect(r.hint).toBeUndefined();
  });

  it('stamps checkedAt from the probe, not the call', () => {
    const r = buildEngineReadiness({ now: NOW, attached: true, probe: probe() });
    expect(r.checkedAt).toBe(new Date(PROBE_AT).toISOString());
  });

  it('stays ready even mid-load — a present composer can accept a prompt', () => {
    // readyState is a tiebreaker for the AMBIGUOUS case, not a second gate on
    // the affirmative one. Demanding 'complete' too would refuse runs that would
    // have worked, on a page that is demonstrably usable.
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ readyState: 'interactive' }),
    });
    expect(r.ready).toBe(true);
  });
});

describe('buildEngineReadiness — not ready (signed out)', () => {
  it('is signed-out when there is no composer but a login affordance', () => {
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ composer: false, loginAffordance: true }),
    });
    expect(r.ready).toBe(false);
    expect(r.state).toBe('signed-out');
  });

  it('is signed-out on an /auth/ URL even with no affordance detected', () => {
    // The selector-based tell and the URL tell are independent on purpose: a
    // redesigned login page that breaks the first must not read as ready.
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({
        composer: false,
        loginAffordance: false,
        url: 'https://chatgpt.com/auth/login',
      }),
    });
    expect(r.state).toBe('signed-out');
  });

  it('names the manual fix — this machine, the right-hand pane, by hand', () => {
    // The hint is relayed verbatim to a human by an agent that cannot fix this
    // itself, so vague wording sends them to the wrong place.
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ composer: false, loginAffordance: true }),
    });
    expect(r.hint).toBe(SIGNED_OUT_HINT);
    expect(r.hint).toMatch(/sign in/i);
    expect(r.hint).toMatch(/right-hand pane/i);
    expect(r.hint).toMatch(/no agent/i);
  });
});

describe('buildEngineReadiness — not ready (detached)', () => {
  it('is detached when no view is attached, whatever the probe says', () => {
    const r = buildEngineReadiness({ now: NOW, attached: false, probe: null });
    expect(r.ready).toBe(false);
    expect(r.state).toBe('detached');
    expect(r.hint).toBe(DETACHED_HINT);
  });

  it('does not collapse detached into signed-out — the fixes differ', () => {
    // "Open the app" and "log in" are different instructions. Merging them
    // sends a user with a closed app hunting for a login screen.
    const detached = buildEngineReadiness({ now: NOW, attached: false, probe: null });
    const signedOut = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ composer: false, loginAffordance: true }),
    });
    expect(detached.hint).not.toBe(signedOut.hint);
  });

  it('falls back to `now` for checkedAt when there was no probe', () => {
    const r = buildEngineReadiness({ now: NOW, attached: false, probe: null });
    expect(r.checkedAt).toBe(new Date(NOW).toISOString());
  });
});

describe('buildEngineReadiness — indeterminate', () => {
  it('refuses when the probe timed out — silence is not consent', () => {
    // The load-bearing case. Defaulting a silent probe to ready would restore
    // the original bug in full, since a hung or crashed page answers nothing.
    const r = buildEngineReadiness({ now: NOW, attached: true, probe: null });
    expect(r.ready).toBe(false);
    expect(r.state).toBe('indeterminate');
    expect(r.hint).toBe(INDETERMINATE_HINT);
  });

  it('refuses a still-loading page with no composer and no login tell', () => {
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ composer: false, readyState: 'loading' }),
    });
    expect(r.state).toBe('indeterminate');
  });

  it('refuses a loaded page with no composer and no login tell — selector drift', () => {
    // Re-pinning selectors is expected maintenance (chatgpt-selectors §4). When
    // it is overdue, the honest answer is "I cannot tell", not "go ahead".
    const r = buildEngineReadiness({
      now: NOW,
      attached: true,
      probe: probe({ composer: false, readyState: 'complete' }),
    });
    expect(r.state).toBe('indeterminate');
    expect(r.ready).toBe(false);
  });
});

describe('buildEngineReadiness — the invariant', () => {
  it('ready is true for exactly one state, across every input combination', () => {
    // Exhaustive over the flags that decide the verdict. This is the guard that
    // survives a refactor: any future branch that returns ready:true without
    // `state === 'ready'` fails here.
    for (const attached of [true, false]) {
      for (const composer of [true, false]) {
        for (const loginAffordance of [true, false]) {
          for (const readyState of ['complete', 'loading']) {
            for (const url of ['https://chatgpt.com/', 'https://chatgpt.com/auth/login']) {
              for (const p of [probe({ composer, loginAffordance, readyState, url }), null]) {
                const r = buildEngineReadiness({ now: NOW, attached, probe: p });
                expect(r.ready).toBe(r.state === 'ready');
                // Every refusal must be actionable — a bare `false` tells a
                // caller nothing it can relay to the person who can fix it.
                if (!r.ready) expect(r.hint && r.hint.length > 0).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('never reads as ready without an attached view AND a confirmed composer', () => {
    const readyCases = [
      buildEngineReadiness({ now: NOW, attached: true, probe: probe({ composer: true }) }),
    ];
    const notReady = [
      buildEngineReadiness({ now: NOW, attached: false, probe: probe({ composer: true }) }),
      buildEngineReadiness({ now: NOW, attached: true, probe: null }),
      buildEngineReadiness({ now: NOW, attached: true, probe: probe({ composer: false }) }),
    ];
    expect(readyCases.every((r) => r.ready)).toBe(true);
    expect(notReady.some((r) => r.ready)).toBe(false);
  });
});
