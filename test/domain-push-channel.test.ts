import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from '@appydave/core';
import { IpcRouter } from '../src/main/ipc-router';
import { createControlSurface, type ControlSurface } from '../src/main/control-surface';
import { createCapabilityGuard } from '../src/main/capability-guard';
import type { DomainState } from '../src/shared/domain';

/**
 * The SEAM between the two write paths (defect of 2026-08-29,
 * `docs/spec-control-surface-ui-staleness.md`).
 *
 * ImageDrip has one API and two clients: the window over IPC, and an agent over
 * the loopback control surface. The renderer used to learn about a domain
 * change only as the RETURN VALUE of its own call — so an agent's write updated
 * the document, the disk and `domain.get`, and left every pane in the control
 * column showing the previous values. `run.start` is gated on a human eyeballing
 * that column, which is why a stale window is a safety defect and not a
 * cosmetic one.
 *
 * So this test drives the REAL thing end to end on main's side:
 *
 *   HTTP POST /v1/call/…  →  control surface  →  IpcRouter registry
 *                         →  real domain-store  →  onDomainChanged(state)
 *
 * Nothing is stubbed except `electron` itself (a temp `userData`, and an
 * `ipcMain` that records rather than binds). The store, the router, the Zod
 * schemas, the guard and a real loopback server are the shipped code.
 *
 * ── What this does NOT establish ──
 * That the RENDERER repaints. It stops at the callback that feeds
 * `webContents.send`; the far side of a structured-clone boundary and a React
 * subscription is not reachable from a node test, and asserting it here would
 * be the false green this repo refuses to ship. The renderer half — the
 * `domain.onChanged` subscription in `store.ts` and the one wiring line in
 * `index.ts` — is confirmed by running the app against a visible window.
 *
 * It also does not establish that a mutation NOT routed through `updateDoc`
 * would notify. Nothing may be: `updateDoc` is the only writer, which is the
 * reason the notification was put there rather than at each entry point.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_PUSH_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_PUSH_TEST_DIR not set');
        return j(base, name);
      },
    },
    // The router binds handlers on `ipcMain`. A recording stand-in is enough:
    // this test calls through HTTP, which reaches `def.handle` directly.
    ipcMain: { handle: (): void => undefined, removeHandler: (): void => undefined },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-push-'));
process.env.IMAGEDRIP_PUSH_TEST_DIR = base;
const userData = join(base, 'userData');
mkdirSync(userData, { recursive: true });

let store: typeof import('../src/main/domain-store');
let surface: ControlSurface;
let endpoint: string;
let token: string;

/** Every payload the main → renderer push channel was handed, in order. */
const pushed: DomainState[] = [];

async function call(verb: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${endpoint}/v1/call/${verb}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  store = await import('../src/main/domain-store');

  // This is the line `index.ts` owns in production — the ONLY wiring the fix
  // needs, because the store notifies from where it writes.
  store.onDomainChanged((state) => {
    pushed.push(state);
  });

  // The real registry, carrying the same channels and the same Zod schemas the
  // window is held to. The control surface mirrors this map; it declares no
  // routes of its own, so there is no second contract to drift.
  const ipc = new IpcRouter();
  ipc.register<void, DomainState>({
    channel: 'imagedrip:domain:get',
    handle: () => store.getDomain(),
  });
  ipc.register<{ name: string }, DomainState>({
    channel: 'imagedrip:brand:create',
    input: z.object({ name: z.string().min(1) }),
    handle: (input) => store.createBrand(input),
  });
  ipc.register<
    { text: string; mode: 'replace' | 'add' | 'clear'; format?: 'lines' | 'blocks' },
    DomainState
  >({
    channel: 'imagedrip:domain:import-prompts',
    input: z.object({
      text: z.string(),
      mode: z.enum(['replace', 'add', 'clear']),
      format: z.enum(['lines', 'blocks']).optional(),
    }),
    handle: ({ text, mode, format }) => store.importPrompts(text, mode, format ?? 'lines'),
  });
  ipc.register<{ name?: string; body?: string; outputDir?: string }, DomainState>({
    channel: 'imagedrip:domain:save-project',
    input: z.object({
      name: z.string().min(1).optional(),
      body: z.string().optional(),
      outputDir: z.string().min(1).optional(),
    }),
    handle: (patch) => store.saveProject(patch),
  });

  surface = createControlSurface({
    defs: () => ipc.list(),
    userDataDir: userData,
    version: '0.1.0-test',
    isRunning: () => false,
    guard: createCapabilityGuard({
      engineReadiness: async () => ({
        ready: true,
        state: 'ready',
        checkedAt: '2027-01-15T00:00:00Z',
      }),
    }),
    port: 0, // OS-assigned — never fight the real app for 7180
  });
  const info = await surface.start();
  token = info.token;
  endpoint = `http://127.0.0.1:${info.port}`;
});

afterAll(async () => {
  await surface.stop();
  store.onDomainChanged(null);
});

describe('domain push channel — an agent writes, the window is told', () => {
  it('pushes the new state when a brand is created over HTTP', async () => {
    const before = pushed.length;
    const res = await call('brand.create', { name: 'Agent Office — Retro Pixel' });
    expect(res.status).toBe(200);

    // The defect in one assertion: this used to be zero.
    expect(pushed.length).toBeGreaterThan(before);
    expect(pushed[pushed.length - 1].brand?.name).toBe('Agent Office — Retro Pixel');
  });

  it('pushes the new queue when prompts are imported over HTTP', async () => {
    const before = pushed.length;
    const res = await call('domain.import-prompts', {
      text: 's01-01-back-wall\ns01-02-desk\ns06-04-foreground',
      mode: 'replace',
      format: 'lines',
    });
    expect(res.status).toBe(200);

    const last = pushed[pushed.length - 1];
    expect(pushed.length).toBeGreaterThan(before);
    expect(last.theme.prompts.filter((p) => p.status === 'queued')).toHaveLength(3);
  });

  it('pushes a payload identical to what domain.get returns', async () => {
    // The acceptance in the spec, minus the eyes: whatever the window is handed
    // must BE the authority's answer, not a summary of it or a lagging copy.
    // A push carrying anything else would repaint the cockpit into a second
    // wrong state, which is not an improvement on the first.
    await call('domain.save-project', { name: 'Agent Office S06 Plates' });
    const authority = await call('domain.get');
    expect(authority.status).toBe(200);
    // `result` is the control surface's envelope; the value inside it is what
    // `domain.get` answers with.
    expect(pushed[pushed.length - 1]).toEqual(authority.body.result);
  });

  it('pushes for the human path too — one notification, not one per client', async () => {
    // The window's own writes reach `updateDoc` by the same road. This is what
    // makes the fix a REPLACEMENT for "set state from the call's return value"
    // rather than a second mechanism bolted alongside it: had the notification
    // been added at the HTTP adapter, the two clients would each need their own
    // and the next adapter would silently need a third.
    const before = pushed.length;
    await store.createBrand({ name: 'Typed By A Human' });
    expect(pushed.length).toBeGreaterThan(before);
    expect(pushed[pushed.length - 1].brand?.name).toBe('Typed By A Human');
  });

  it('lets go of the listener when it is unset, without failing the write', async () => {
    store.onDomainChanged(null);
    const frozen = pushed.length;
    const state = await store.createBrand({ name: 'Nobody Listening' });
    expect(state.brand?.name).toBe('Nobody Listening');
    expect(pushed.length).toBe(frozen);
    store.onDomainChanged((s) => {
      pushed.push(s);
    });
  });
});
