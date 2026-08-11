import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from '@appydave/core';
import type { HandlerDef } from '../src/main/ipc-router';
import { CLIENT_HEADER, createControlSurface, type ControlSurface } from '../src/main/control-surface';
import { createCapabilityGuard } from '../src/main/capability-guard';
import type { GatedCall } from '../src/main/chat-gate';

/**
 * D1 — which CALLER gets held, over a real loopback server.
 *
 * The gate logic itself is proven in `chat-gate.test.ts`. What is proven here
 * is the half that decides who it applies to, and a mistake in this file is the
 * dangerous kind in both directions:
 *
 *   - too narrow → the pane calls `run.start` unattended, and AC-5 is a lie
 *   - too wide   → `chat:probe` blocks forever on a dialog nobody can answer,
 *                  and the only thing standing between WP4 and a false green
 *                  stops running at all
 *
 * The bearer token and the pane credential are deliberately DIFFERENT secrets:
 * holding `control.json` must not make you the pane.
 */

const userData = mkdtempSync(join(tmpdir(), 'imagedrip-gate-'));

const defs = new Map<string, HandlerDef<unknown, unknown>>();
function def<In, Out>(d: HandlerDef<In, Out>): void {
  defs.set(d.channel, d as unknown as HandlerDef<unknown, unknown>);
}

let handled: string[] = [];

// Gated, and NOT engine-requiring — so these tests exercise the human gate
// rather than tripping the engine gate that sits in front of it.
def<void, { ok: boolean }>({
  channel: 'imagedrip:run:stop',
  handle: () => {
    handled.push('run.stop');
    return { ok: true };
  },
});
def<string, { ok: boolean }>({
  channel: 'imagedrip:project:delete',
  input: z.string().min(1),
  handle: () => {
    handled.push('project.delete');
    return { ok: true };
  },
});
// Gated AND on PANE_DENIED_VERBS — refused outright, never confirmed.
def<string, { ok: boolean }>({
  channel: 'imagedrip:repo:attach',
  input: z.string().min(1),
  handle: () => {
    handled.push('repo.attach');
    return { ok: true };
  },
});
// Not gated — must be untouched by any of this.
def<void, { ok: boolean }>({
  channel: 'imagedrip:domain:get',
  handle: () => {
    handled.push('domain.get');
    return { ok: true };
  },
});

let surface: ControlSurface;
let base = '';
let token = '';

/** What the gate is told to do next, and what it was asked. */
let answer: boolean | 'throw' = true;
let asked: GatedCall[] = [];
let paneToken: string | null = 'pane-secret-token';

async function call(
  path: string,
  init: { body?: string; client?: string | null } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.client ? { [CLIENT_HEADER]: init.client } : {}),
    },
    body: init.body ?? '{}',
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  surface = createControlSurface({
    defs: () => defs,
    userDataDir: userData,
    version: '0.1.0-test',
    isRunning: () => false,
    paneToken: () => paneToken,
    // The REAL guard. These tests used to drive an adapter-local copy of the
    // gate logic; since 2026-08-11 the logic lives beneath every adapter, so
    // this exercises the thing that actually enforces.
    guard: createCapabilityGuard({
      confirmGated: async (c) => {
        asked.push(c);
        if (answer === 'throw') throw new Error('the renderer blew up');
        return answer;
      },
    }),
    port: 0,
  });
  const info = await surface.start();
  token = info.token;
  base = `http://127.0.0.1:${info.port}`;
});

afterAll(async () => {
  await surface.stop();
});

beforeEach(() => {
  handled = [];
  asked = [];
  answer = true;
  paneToken = 'pane-secret-token';
});

describe('the pane is held; everyone else is not', () => {
  it('holds a gated verb from the pane and runs it when the human allows', async () => {
    const res = await call('/v1/call/run.stop', { client: 'pane-secret-token' });

    expect(asked.map((a) => a.verb)).toEqual(['run.stop']);
    expect(res.status).toBe(200);
    expect(handled).toEqual(['run.stop']);
  });

  it('refuses with 403 when the human denies, and does NOT run the verb', async () => {
    answer = false;
    const res = await call('/v1/call/run.stop', { client: 'pane-secret-token' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('confirm_denied');
    expect(handled).toEqual([]);
  });

  it('tells the agent a denial is FINAL, not a lock that will clear', async () => {
    // The distinction that matters: a 409 run-state lock clears itself, so
    // waiting is sensible. A person saying no does not clear, and retrying is
    // asking someone who already answered to answer again.
    answer = false;
    const res = await call('/v1/call/run.stop', { client: 'pane-secret-token' });
    expect(res.body.message).toMatch(/do NOT retry/i);
    expect(res.body.message).toMatch(/declined/i);
  });

  it('does NOT hold the same verb from a client with no credential', async () => {
    // This is `chat:probe`, `curl`, and a terminal Claude Code session. If this
    // test ever fails, the headless probe hangs on a dialog nobody can answer.
    const res = await call('/v1/call/run.stop');

    expect(asked).toEqual([]);
    expect(res.status).toBe(200);
    expect(handled).toEqual(['run.stop']);
  });

  it('does NOT hold a caller presenting the wrong credential', async () => {
    const res = await call('/v1/call/run.stop', { client: 'not-the-pane' });
    expect(asked).toEqual([]);
    expect(res.status).toBe(200);
  });

  it('does NOT treat the BEARER token as proof of being the pane', async () => {
    // The whole design rests on this: possessing control.json does not make
    // you the pane. If the two secrets were ever unified, every terminal
    // session would start blocking on confirms.
    const res = await call('/v1/call/run.stop', { client: token });
    expect(asked).toEqual([]);
    expect(res.status).toBe(200);
  });

  it('stops recognising the pane once its credential is revoked', async () => {
    // Revoked when the CLI child dies. A confirm raised for a chat that is no
    // longer running is a question the user cannot make sense of.
    paneToken = null;
    const res = await call('/v1/call/run.stop', { client: 'pane-secret-token' });
    expect(asked).toEqual([]);
    expect(res.status).toBe(200);
  });

  it('never holds a NON-gated verb, even from the pane', async () => {
    const res = await call('/v1/call/domain.get', { client: 'pane-secret-token' });
    expect(asked).toEqual([]);
    expect(res.status).toBe(200);
    expect(handled).toEqual(['domain.get']);
  });
});

describe('fail closed', () => {
  it('denies when the confirm channel throws', async () => {
    // A confirm that blew up told us nothing about what the human wants, and
    // "we could not ask" is not "they said yes".
    answer = 'throw';
    const res = await call('/v1/call/run.stop', { client: 'pane-secret-token' });

    expect(res.status).toBe(403);
    expect(handled).toEqual([]);
  });

  it('denies when no confirm channel is wired at all', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'imagedrip-gate-none-'));
    const s = createControlSurface({
      defs: () => defs,
      userDataDir: scratch,
      version: 'x',
      isRunning: () => false,
      paneToken: () => 'pane-secret-token',
      // confirmGated deliberately omitted — no window, no human.
      guard: createCapabilityGuard({}),
      port: 0,
    });
    const info = await s.start();
    const res = await fetch(`http://127.0.0.1:${info.port}/v1/call/run.stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${info.token}`,
        [CLIENT_HEADER]: 'pane-secret-token',
      },
      body: '{}',
    });

    expect(res.status).toBe(403);
    expect(handled).toEqual([]);
    await s.stop();
  });
});

describe('repo.attach is refused to the pane outright', () => {
  it('never even asks the human', async () => {
    // Its defect — publishing every unsourced record into whichever repo you
    // point at, stamped with the active brand — cannot be conveyed by a yes/no
    // dialog, so a yes would not be informed consent.
    const res = await call('/v1/call/repo.attach', {
      client: 'pane-secret-token',
      body: JSON.stringify('/tmp/some-repo'),
    });

    expect(asked).toEqual([]);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden_for_pane');
    expect(handled).toEqual([]);
  });

  it('is unaffected for other clients — the human path still works', async () => {
    // It is gated in the UI, not removed from the app.
    const res = await call('/v1/call/repo.attach', { body: JSON.stringify('/tmp/some-repo') });
    expect(res.status).toBe(200);
    expect(handled).toEqual(['repo.attach']);
  });
});

describe('the gate runs after the cheaper refusals', () => {
  it('answers 422 for a bad payload without troubling a human', async () => {
    const res = await call('/v1/call/project.delete', {
      client: 'pane-secret-token',
      body: JSON.stringify(''), // fails .min(1)
    });

    expect(res.status).toBe(422);
    // Spending someone's attention to approve a call that cannot succeed is
    // how a confirm dialog becomes noise to click through.
    expect(asked).toEqual([]);
  });
});
