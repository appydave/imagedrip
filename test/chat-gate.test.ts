import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatGate, summarise, GATE_TIMEOUT_MS } from '../src/main/chat-gate';
import type { ChatGateRequest } from '../src/shared/chat';

/**
 * D1 — the human gate.
 *
 * Every test here is a variation on ONE property: **anything that is not an
 * explicit human yes is a no.** `gated: true` was metadata until this existed —
 * advisory to the model, intercepted by nothing — and AC-5 requires that
 * starting a run asks *every time*. A gate that can be talked past, waited out,
 * or raced is not a gate.
 */

function call(verb = 'run.start', payload: unknown = { chunkSize: 12 }) {
  return { verb, payload, description: `docs for ${verb}` };
}

describe('the gate holds until a human answers', () => {
  it('allows only on an explicit yes', async () => {
    let shown: ChatGateRequest | null = null;
    const gate = createChatGate({
      present: (r) => {
        shown = r;
        return true;
      },
      dismiss: () => undefined,
    });

    const pending = gate.ask(call());
    await vi.waitFor(() => expect(shown).not.toBeNull());
    gate.decide(shown!.id, true);

    expect(await pending).toBe(true);
  });

  it('denies on an explicit no', async () => {
    let shown: ChatGateRequest | null = null;
    const gate = createChatGate({ present: (r) => ((shown = r), true), dismiss: () => undefined });

    const pending = gate.ask(call());
    await vi.waitFor(() => expect(shown).not.toBeNull());
    gate.decide(shown!.id, false);

    expect(await pending).toBe(false);
  });

  it('does not resolve while nobody has answered', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });
    let settled = false;
    void gate.ask(call()).then(() => {
      settled = true;
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);
    expect(gate.pending()?.verb).toBe('run.start');
  });
});

describe('everything that is not a yes is a no', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('DENIES on expiry — it never opens', async () => {
    const gate = createChatGate({
      present: () => true,
      dismiss: () => undefined,
      timeoutMs: 1000,
    });

    const pending = gate.ask(call());
    vi.advanceTimersByTime(1001);

    // The single most important assertion in this file. A confirm that defaults
    // OPEN under load, or when the user walked away, manufactures a record of
    // consent nobody gave.
    expect(await pending).toBe(false);
  });

  it('denies immediately when there is no window to ask in', async () => {
    // No human reachable is not "assume yes" — it is the absence of consent.
    // And it fails FAST rather than making the agent wait out a timeout to be
    // told nobody was home.
    const gate = createChatGate({ present: () => false, dismiss: () => undefined });
    expect(await gate.ask(call())).toBe(false);
    expect(gate.pending()).toBeNull();
  });

  it('denies a second question while one is already in front of the user', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });

    const first = gate.ask(call('run.start'));
    const second = gate.ask(call('project.delete'));

    // Two dialogs racing is how a person clicks Allow on the one they read and
    // grants the one they did not.
    expect(await second).toBe(false);
    expect(gate.pending()?.verb).toBe('run.start');

    gate.decide(gate.pending()!.id, true);
    expect(await first).toBe(true);
  });

  it('denies everything pending when cancelled', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });
    const pending = gate.ask(call());
    gate.cancelAll('quitting');
    expect(await pending).toBe(false);
  });
});

describe('answers are matched to the question that is open', () => {
  it('ignores an answer carrying a stale id', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });
    const pending = gate.ask(call());
    const real = gate.pending()!.id;

    // A late click on a dialog that already went away must not answer whatever
    // question came after it.
    gate.decide('some-other-id', true);
    expect(gate.pending()?.id).toBe(real);

    gate.decide(real, false);
    expect(await pending).toBe(false);
  });

  it('a second answer to an already-closed question does nothing', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });
    const pending = gate.ask(call());
    const id = gate.pending()!.id;

    gate.decide(id, false);
    expect(await pending).toBe(false);
    // Double-click, or a click racing the timeout. Must not throw, must not
    // reopen, must not settle anything twice.
    expect(() => gate.decide(id, true)).not.toThrow();
    expect(gate.pending()).toBeNull();
  });

  it('takes the dialog down exactly once, however it ended', async () => {
    const dismissed: string[] = [];
    const gate = createChatGate({
      present: () => true,
      dismiss: (id) => dismissed.push(id),
    });
    const pending = gate.ask(call());
    const id = gate.pending()!.id;
    gate.decide(id, true);
    await pending;
    gate.decide(id, false);

    expect(dismissed).toEqual([id]);
  });
});

describe('the question a human is actually asked', () => {
  it('says what a run.start DOES, not what it is called', () => {
    const text = summarise(call('run.start'));
    expect(text).toMatch(/live/i);
    expect(text).toMatch(/ChatGPT/);
    // "run.start" alone is not something a person can consent to.
    expect(text.length).toBeGreaterThan(40);
  });

  it('names the blast radius on the destructive ones', () => {
    expect(summarise(call('project.delete'))).toMatch(/queue/i);
    expect(summarise(call('domain.reset-run'))).toMatch(/re-queue/i);
    // The reassuring half matters too, or the user refuses safe things.
    expect(summarise(call('project.delete'))).toMatch(/stay on disk/i);
  });

  it('still says something usable for a verb nobody wrote a line for', () => {
    const text = summarise(call('brand.something-new'));
    expect(text).toContain('brand.something-new');
    expect(text).toMatch(/confirm-first/);
  });

  it('carries the payload and a real deadline', async () => {
    const gate = createChatGate({ present: () => true, dismiss: () => undefined });
    void gate.ask(call('run.start', { chunkSize: 12 }));
    const req = gate.pending()!;

    expect(req.payload).toEqual({ chunkSize: 12 });
    expect(req.expiresAt).toBeGreaterThan(Date.now());
    expect(req.expiresAt).toBeLessThanOrEqual(Date.now() + GATE_TIMEOUT_MS);
  });
});
