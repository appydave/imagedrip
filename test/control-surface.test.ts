import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from '@appydave/core';
import type { HandlerDef } from '../src/main/ipc-router';
import { createControlSurface, listVerbs, type ControlSurface } from '../src/main/control-surface';
import { SIGNED_OUT_HINT, type EngineReadiness } from '../src/main/engine-readiness';

/**
 * The control surface against a real loopback server on an OS-assigned port.
 *
 * These pin the four things the design leans on and that a rewrite could
 * silently lose: the status codes are DISTINCT (404/422/409/500 mean different
 * things to an agent), auth is required everywhere except health, the webview
 * writers are not published at all, and control.json is 0600 and disappears.
 */

const userData = mkdtempSync(join(tmpdir(), 'imagedrip-control-'));

// A stand-in registry with the shapes that matter: a schema-less read, a
// validated object payload, a handler that refuses (a run-state lock), a
// scaffold channel outside the namespace, and a webview writer.
let running = false;

const defs = new Map<string, HandlerDef<unknown, unknown>>();
function def<In, Out>(d: HandlerDef<In, Out>): void {
  defs.set(d.channel, d as unknown as HandlerDef<unknown, unknown>);
}

def<void, { brands: string[]; activeProjectId: string }>({
  channel: 'imagedrip:domain:get',
  handle: () => ({ brands: ['b1'], activeProjectId: 'spring-nails' }),
});
def<{ text: string; mode: 'replace' | 'add' | 'clear' }, { ok: boolean }>({
  channel: 'imagedrip:domain:import-prompts',
  input: z.object({ text: z.string(), mode: z.enum(['replace', 'add', 'clear']) }),
  handle: () => ({ ok: true }),
});
def<{ name?: string }, { ok: boolean }>({
  channel: 'imagedrip:domain:save-brand',
  input: z.object({ name: z.string().min(1).optional() }),
  handle: () => {
    if (running) throw new Error('brand is locked while a run is live');
    return { ok: true };
  },
});
def<void, { active: boolean }>({
  channel: 'imagedrip:context:get',
  handle: () => ({ active: true }),
});
def<string, string>({
  channel: 'imagedrip:project:switch',
  input: z.string().min(1),
  handle: (id) => id,
});
def<void, { name: string }>({ channel: 'app:info', handle: () => ({ name: 'imagedrip' }) });
def<string, void>({
  channel: 'imagedrip:harness:feed',
  input: z.string().min(1),
  handle: () => undefined,
});
// The run verbs record whether they were REACHED, so a gate test can prove the
// refusal happened at the call rather than inside the handler.
let runStartReached = false;
def<void, void>({
  channel: 'imagedrip:run:start',
  handle: () => {
    runStartReached = true;
  },
});
let runStopReached = false;
def<void, void>({
  channel: 'imagedrip:run:stop',
  handle: () => {
    runStopReached = true;
  },
});
def<void, void>({
  channel: 'imagedrip:run:resume',
  handle: () => undefined,
});
def<void, void>({
  channel: 'imagedrip:run:inject-prompt',
  handle: () => undefined,
});

let surface: ControlSurface;
let base: string;
let token: string;

async function call(
  path: string,
  init: { method?: string; body?: string; auth?: boolean } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: init.auth === false ? {} : { authorization: `Bearer ${token}` },
    body: init.body,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Flipped per-test to drive the engine gate. Defaults to ready so every
// pre-existing expectation keeps its original meaning.
let engine: EngineReadiness = { ready: true, state: 'ready', checkedAt: '2027-01-15T00:00:00Z' };

beforeAll(async () => {
  surface = createControlSurface({
    defs: () => defs,
    userDataDir: userData,
    version: '0.1.0-test',
    isRunning: () => running,
    engineReadiness: async () => engine,
    port: 0, // OS-assigned — tests must never fight the real app for 7180
  });
  const info = await surface.start();
  token = info.token;
  base = `http://127.0.0.1:${info.port}`;
});

afterAll(async () => {
  await surface.stop();
});

describe('control.json', () => {
  it('publishes port, token and pid at mode 0600', async () => {
    const stat = await fs.stat(surface.controlFilePath);
    expect(stat.mode & 0o777).toBe(0o600);
    const file = JSON.parse(await fs.readFile(surface.controlFilePath, 'utf8'));
    expect(file.port).toBeGreaterThan(0);
    expect(file.token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
    expect(file.pid).toBe(process.pid);
  });
});

describe('auth', () => {
  it('answers /v1/health without a token', async () => {
    const res = await call('/v1/health', { auth: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe('0.1.0-test');
  });

  it('rejects an unauthenticated call with 401', async () => {
    const res = await call('/v1/call/domain.get', { method: 'POST', auth: false });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token with 401', async () => {
    const res = await fetch(`${base}/v1/verbs`, { headers: { authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });
});

describe('/v1/verbs', () => {
  it('names verbs in dot-form and excludes scaffold channels', async () => {
    const res = await call('/v1/verbs');
    const verbs: string[] = res.body.verbs.map((v: any) => v.verb);
    expect(verbs).toContain('domain.get');
    expect(verbs).toContain('domain.import-prompts');
    expect(verbs).toContain('project.switch');
    expect(verbs).not.toContain('app.info');
  });

  it('never publishes a channel that writes to the ChatGPT webview', async () => {
    const res = await call('/v1/verbs');
    const verbs: string[] = res.body.verbs.map((v: any) => v.verb);
    // v4 §4: the CadenceEngine owns that session exclusively.
    expect(verbs).not.toContain('harness.feed');
    expect(verbs).not.toContain('run.inject-prompt');
  });

  it('declares run.start but marks it confirm-first', async () => {
    const res = await call('/v1/verbs');
    const start = res.body.verbs.find((v: any) => v.verb === 'run.start');
    expect(start).toBeTruthy();
    expect(start.gated).toBe(true);
    expect(res.body.verbs.find((v: any) => v.verb === 'domain.get').gated).toBe(false);
  });

  it('carries a tool schema projected from the handler’s own Zod schema', async () => {
    const res = await call('/v1/verbs');
    const imp = res.body.verbs.find((v: any) => v.verb === 'domain.import-prompts');
    expect(imp.hasSchema).toBe(true);
    expect(imp.payloadWrapped).toBe(false);
    expect(imp.inputSchema.properties.mode.enum).toEqual(['replace', 'add', 'clear']);
    expect(imp.inputSchema.required.sort()).toEqual(['mode', 'text']);
    expect(res.body.verbs.find((v: any) => v.verb === 'domain.get').hasSchema).toBe(false);
  });

  it('wraps a bare-scalar verb so every tool schema is an object', async () => {
    const res = await call('/v1/verbs');
    const sw = res.body.verbs.find((v: any) => v.verb === 'project.switch');
    expect(sw.payloadWrapped).toBe(true);
    expect(sw.inputSchema.properties.payload).toEqual({ type: 'string', minLength: 1 });
  });

  it('describes when to call, not just what', async () => {
    const res = await call('/v1/verbs');
    for (const v of res.body.verbs) expect(v.description.length).toBeGreaterThan(20);
  });
});

describe('POST /v1/call/:verb', () => {
  it('returns the handler result', async () => {
    const res = await call('/v1/call/domain.get', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.result.activeProjectId).toBe('spring-nails');
  });

  it('accepts a bare scalar payload', async () => {
    const res = await call('/v1/call/project.switch', {
      method: 'POST',
      body: JSON.stringify('spring-nails'),
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('spring-nails');
  });

  it('404s an unknown verb', async () => {
    const res = await call('/v1/call/does.not.exist', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('unknown_verb');
  });

  it('404s an unpublished webview writer rather than admitting it exists', async () => {
    const res = await call('/v1/call/harness.feed', {
      method: 'POST',
      body: JSON.stringify('hello'),
    });
    expect(res.status).toBe(404);
  });

  it('422s an invalid payload and carries the Zod issues', async () => {
    const res = await call('/v1/call/domain.import-prompts', {
      method: 'POST',
      body: JSON.stringify({ text: 123, mode: 'add' }),
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_input');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues[0].path).toEqual(['text']);
  });

  it('422s a body that is not JSON', async () => {
    const res = await call('/v1/call/domain.import-prompts', { method: 'POST', body: '{not json' });
    expect(res.status).toBe(422);
    expect(res.body.issues[0].message).toMatch(/not valid JSON/);
  });

  it('409s a handler refusal and passes its message through verbatim', async () => {
    running = true;
    try {
      const res = await call('/v1/call/domain.save-brand', {
        method: 'POST',
        body: JSON.stringify({ name: 'New' }),
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('refused');
      expect(res.body.message).toBe('brand is locked while a run is live');
    } finally {
      running = false;
    }
  });

  it('reports the live run state on /v1/health', async () => {
    running = true;
    try {
      const res = await call('/v1/health', { auth: false });
      expect(res.body.running).toBe(true);
    } finally {
      running = false;
    }
  });
});

describe('/v1/context', () => {
  it('dispatches to the same handler as context.get', async () => {
    const viaRoute = await call('/v1/context');
    const viaVerb = await call('/v1/call/context.get', { method: 'POST' });
    expect(viaRoute.status).toBe(200);
    expect(viaRoute.body).toEqual(viaVerb.body);
  });
});

describe('listVerbs', () => {
  it('is sorted, so a tool list is stable across launches', () => {
    const verbs = listVerbs(defs).map((v) => v.verb);
    expect(verbs).toEqual([...verbs].sort());
  });
});

describe('teardown', () => {
  it('removes control.json when the surface stops', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'imagedrip-control-stop-'));
    const s = createControlSurface({
      defs: () => defs,
      userDataDir: scratch,
      version: 'x',
      isRunning: () => false,
      port: 0,
    });
    await s.start();
    await expect(fs.stat(s.controlFilePath)).resolves.toBeTruthy();
    await s.stop();
    await expect(fs.stat(s.controlFilePath)).rejects.toThrow();
  });
});

/**
 * The engine gate.
 *
 * The manual ChatGPT sign-in is the system's one human-only precondition, and
 * before v4 it was self-announcing: you opened the app and saw a login wall.
 * The control surface removed that feedback, so a run could be started by a
 * caller who had no way to know. And an unguarded start does not fail cleanly —
 * `WebviewHarness.feed` pastes into whatever holds focus when it cannot find the
 * composer, which on a signed-out page is the login form.
 *
 * These pin the gate's three load-bearing properties: it refuses BEFORE the
 * handler, it refuses when readiness is merely UNKNOWN, and it never blocks the
 * verbs that stop a run.
 */
describe('engine gate', () => {
  const signedOut: EngineReadiness = {
    ready: false,
    state: 'signed-out',
    hint: SIGNED_OUT_HINT,
    checkedAt: '2027-01-15T00:00:00Z',
  };
  const ready: EngineReadiness = { ready: true, state: 'ready', checkedAt: '2027-01-15T00:00:00Z' };

  afterEach(() => {
    engine = ready;
    runStartReached = false;
    runStopReached = false;
  });

  it('refuses run.start with 409 when the engine is signed out', async () => {
    engine = signedOut;
    const res = await call('/v1/call/run.start', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('engine_not_ready');
  });

  it('refuses BEFORE the handler — the run never starts', async () => {
    // The point of the whole exercise. A refusal that arrives after
    // `getRunner().start()` has begun feeding is not a guard, it is a log line.
    engine = signedOut;
    await call('/v1/call/run.start', { method: 'POST' });
    expect(runStartReached).toBe(false);
  });

  it('carries the actionable hint verbatim, in `message`', async () => {
    // `message` is where a 409's wording already lives, so a client written
    // against the old shape still surfaces this without knowing about engines.
    engine = signedOut;
    const res = await call('/v1/call/run.start', { method: 'POST' });
    expect(res.body.message).toBe(SIGNED_OUT_HINT);
    expect(res.body.engine.state).toBe('signed-out');
  });

  it('refuses run.resume too — resuming feeds the engine just as start does', async () => {
    engine = signedOut;
    const res = await call('/v1/call/run.resume', { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('refuses when readiness is INDETERMINATE, not only when signed out', async () => {
    engine = {
      ready: false,
      state: 'indeterminate',
      hint: 'could not tell',
      checkedAt: '2027-01-15T00:00:00Z',
    };
    const res = await call('/v1/call/run.start', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(runStartReached).toBe(false);
  });

  it('allows run.start when the engine is ready', async () => {
    engine = ready;
    const res = await call('/v1/call/run.start', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(runStartReached).toBe(true);
  });

  it('NEVER gates run.stop — a bad engine must not trap a live run', async () => {
    // Gating stop would make a batch un-stoppable in exactly the situation
    // where stopping matters most: mid-flight against a page that is not the
    // composer. The guard must not be able to trap the user inside the failure.
    engine = signedOut;
    const res = await call('/v1/call/run.stop', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(runStopReached).toBe(true);
  });

  it('does not gate ordinary config verbs on the engine', async () => {
    // Prompt generation and configuration are exactly what still WORKS on a
    // machine that has never signed in — over-gating would remove the main
    // reason to reach the app from a chat at all.
    engine = signedOut;
    const res = await call('/v1/call/domain.get', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('still answers 422 for a bad payload before consulting the engine', async () => {
    // The documented 409/422 split survives: "you sent garbage" is still
    // distinguishable from "you may not do that right now".
    engine = signedOut;
    const res = await call('/v1/call/domain.import-prompts', {
      method: 'POST',
      body: JSON.stringify({ text: 5, mode: 'nope' }),
    });
    expect(res.status).toBe(422);
  });

  it('publishes requiresEngine in /v1/verbs so the precondition is discoverable', async () => {
    const res = await call('/v1/verbs');
    const byVerb = new Map(res.body.verbs.map((v: any) => [v.verb, v]));
    expect((byVerb.get('run.start') as any).requiresEngine).toBe(true);
    expect((byVerb.get('run.stop') as any).requiresEngine).toBe(false);
    expect((byVerb.get('domain.get') as any).requiresEngine).toBe(false);
  });
});

describe('engine gate — fail closed', () => {
  /**
   * A surface built with NO readiness probe at all. An unchecked engine and a
   * broken engine are indistinguishable from here, and only one of those two
   * guesses can type prompts into a login form — so the absence of a check must
   * refuse, never wave through.
   */
  let bare: ControlSurface;
  let bareBase: string;
  let bareToken: string;

  beforeAll(async () => {
    bare = createControlSurface({
      defs: () => defs,
      userDataDir: mkdtempSync(join(tmpdir(), 'imagedrip-control-bare-')),
      version: '0.1.0-test',
      isRunning: () => false,
      port: 0,
    });
    const info = await bare.start();
    bareToken = info.token;
    bareBase = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await bare.stop();
  });

  it('refuses run.start when no readiness probe is wired', async () => {
    runStartReached = false;
    const res = await fetch(`${bareBase}/v1/call/run.start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bareToken}` },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('engine_not_ready');
    expect(body.message.length).toBeGreaterThan(0);
    expect(runStartReached).toBe(false);
  });

  it('still serves config verbs with no probe wired', async () => {
    const res = await fetch(`${bareBase}/v1/call/domain.get`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bareToken}` },
    });
    expect(res.status).toBe(200);
  });
});
