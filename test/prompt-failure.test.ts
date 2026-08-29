import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prompt } from '../src/shared/domain';
import type { PromptFailure, RunManifest, RunStatus } from '../src/shared/ipc';
import { RunRecorder } from '../src/main/run-manifest';
import { FileAuthor } from '../src/main/file-author';
import { BatchRunner } from '../src/main/batch-runner';
import type { WebviewHarness } from '../src/main/webview-harness';

/**
 * The queue's terminal failure state (2026-08-29).
 *
 * ── Why these tests exist ──
 *
 * Across the 11 run manifests on David's machine, 47 prompt rows resolved to
 * exactly two values: 34 `queued` and 13 `harvested`. `refused` was never once
 * written. **A prompt that was fed, stalled for 390s and abandoned was recorded
 * identically to one the operator never reached** — so no honest harvest rate
 * could be computed from a manifest, and two engines could not be compared on a
 * queue that cannot say which prompts failed.
 *
 * The fix is `attempts` + `failure` + a terminal sweep in `finish()`. These
 * tests pin the three cases apart, and — the part that actually matters — pin
 * that the RUNNER calls the hooks on all three failure paths. The pre-existing
 * `batch-runner.test.ts` supplies no recorder at all, so without the second
 * describe block below this wiring would be green and unexercised, which is the
 * exact failure class the change was made to end.
 */

async function makeRecorder(): Promise<{ rec: RunRecorder; read: (id: string) => Promise<RunManifest> }> {
  const root = await mkdtemp(join(tmpdir(), 'imagedrip-failstate-'));
  const author = new FileAuthor({ root });
  const rec = new RunRecorder({ fileAuthor: author });
  return {
    rec,
    read: async (id) => JSON.parse(await readFile(join(root, id, 'manifest.json'), 'utf8')) as RunManifest,
  };
}

const P = (id: string, subject: string): Prompt => ({
  id,
  subject,
  text: `a ${subject}`,
  status: 'queued',
});

describe('RunRecorder — attempted vs never reached', () => {
  it('an attempted-but-unresolved row becomes `failed` at finish; an unreached one stays `queued`', async () => {
    const { rec, read } = await makeRecorder();
    const id = await rec.start({
      projectName: 'p',
      themeName: 't',
      primer: 'PRIMER',
      prompts: [P('a-1', 'alpha'), P('b-2', 'bravo'), P('c-3', 'charlie')],
    });

    // alpha delivered. bravo was fed and stalled. charlie was never reached.
    await rec.attempt('a-1');
    await rec.harvest('a-1', 'alpha.png', 42_000);
    await rec.attempt('b-2');
    await rec.failure('b-2', 'stalled', 'stalled — no image in 390s');

    // Mid-run, bravo is still `queued` ON PURPOSE — the run is paused, not past
    // it, and a resume can still harvest it.
    const mid = await read(id);
    expect(mid.prompts.find((p) => p.id === 'b-2')?.status).toBe('queued');

    await rec.finish('stopped');

    const m = await read(id);
    const byId = Object.fromEntries(m.prompts.map((p) => [p.id, p]));

    expect(byId['a-1'].status).toBe('harvested');
    expect(byId['b-2'].status).toBe('failed');
    expect(byId['c-3'].status).toBe('queued');

    // The disambiguation, stated as the arithmetic that was impossible before.
    expect(byId['b-2'].attempts).toBe(1);
    expect(byId['c-3'].attempts).toBeUndefined();
    expect(m.counts.total).toBe(3);
    expect(m.counts.harvested).toBe(1);
    expect(m.counts.failed).toBe(1);
    const neverReached =
      m.counts.total - m.counts.harvested - m.counts.refused - (m.counts.failed ?? 0);
    expect(neverReached).toBe(1);
  });

  it('keeps WHY it failed, not just that it did', async () => {
    const { rec, read } = await makeRecorder();
    const id = await rec.start({
      projectName: 'p',
      themeName: 't',
      primer: '',
      prompts: [P('a-1', 'alpha')],
    });
    await rec.attempt('a-1');
    await rec.failure('a-1', 'feed-failed', 'feed failed — Enter did not submit it');
    await rec.finish('stopped');

    const f = (await read(id)).prompts[0].failure as PromptFailure;
    expect(f.kind).toBe('feed-failed');
    expect(f.detail).toContain('Enter did not submit it');
    expect(f.at).toBeGreaterThan(0);
  });

  it('a refusal is terminal immediately — the runner skips it, so the row must not wait for finish()', async () => {
    const { rec, read } = await makeRecorder();
    const id = await rec.start({
      projectName: 'p',
      themeName: 't',
      primer: '',
      prompts: [P('a-1', 'alpha')],
    });
    await rec.attempt('a-1');
    await rec.failure('a-1', 'refused', 'refused: alpha — skipped');

    const mid = await read(id);
    expect(mid.prompts[0].status).toBe('refused');
    expect(mid.counts.refused).toBe(1);

    await rec.finish('complete');
    const m = await read(id);
    // Already terminal — the sweep must not double-count it as failed too.
    expect(m.prompts[0].status).toBe('refused');
    expect(m.counts.failed).toBe(0);
  });

  it('a prompt that stalled and then succeeded on retry ends `harvested`, keeping the failure as history', async () => {
    const { rec, read } = await makeRecorder();
    const id = await rec.start({
      projectName: 'p',
      themeName: 't',
      primer: '',
      prompts: [P('a-1', 'alpha')],
    });
    await rec.attempt('a-1');
    await rec.failure('a-1', 'stalled', 'stalled — no image in 390s');
    await rec.attempt('a-1'); // operator resumed
    await rec.harvest('a-1', 'alpha.png', 51_000);
    await rec.finish('complete');

    const row = (await read(id)).prompts[0];
    expect(row.status).toBe('harvested');
    expect(row.attempts).toBe(2);
    // The history survives — two tries is the signal a bake-off wants.
    expect(row.failure?.kind).toBe('stalled');
    expect((await read(id)).counts.failed).toBe(0);
  });

  it('a run the operator stops while awaiting still explains the row, rather than leaving it blank', async () => {
    const { rec, read } = await makeRecorder();
    const id = await rec.start({
      projectName: 'p',
      themeName: 't',
      primer: '',
      prompts: [P('a-1', 'alpha')],
    });
    await rec.attempt('a-1'); // fed, then STOP — no failure hook fires
    await rec.finish('stopped');

    const row = (await read(id)).prompts[0];
    expect(row.status).toBe('failed');
    expect(row.failure?.detail).toContain('run ended (stopped)');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * The wiring. Without this, everything above passes and the runner still
 * calls nothing.
 * ───────────────────────────────────────────────────────────────────────── */

const FAST = {
  chunkSize: 18,
  cadenceBaseMs: 0,
  cadenceJitterMs: 0,
  primerSettleMs: 0,
  loadSettleMs: 0,
};
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

interface Calls {
  attempts: string[];
  failures: { id: string; kind: string; detail: string }[];
}

function makeRunner(
  prompts: Prompt[],
  opts: { failFeedFrom?: number } = {},
): { runner: BatchRunner; calls: Calls; imageDone: (u: string) => void; refused: () => void; stall: (ms: number) => void } {
  const calls: Calls = { attempts: [], failures: [] };
  let imageCb: ((e: { imageUrl: string; at: number }) => void) | undefined;
  let refusedCb: (() => void) | undefined;
  let stallCb: ((e: { waitedMs: number }) => void) | undefined;
  let feeds = 0;

  const harness = {
    onImageDone: (cb: (e: { imageUrl: string; at: number }) => void) => {
      imageCb = cb;
    },
    onRateLimit: () => {},
    onRefused: (cb: () => void) => {
      refusedCb = cb;
    },
    onStall: (cb: (e: { waitedMs: number }) => void) => {
      stallCb = cb;
    },
    setStallMs: () => {},
    feed: async () => {
      if (opts.failFeedFrom !== undefined && feeds >= opts.failFeedFrom) {
        throw new Error('feed: the prompt is still sitting in the composer — Enter did not submit it.');
      }
      feeds += 1;
    },
    newConversation: async () => {},
    harvest: async (_u: string, relPath: string) => relPath,
  } as unknown as WebviewHarness;

  const runner = new BatchRunner({
    harness,
    getPrimer: async () => 'PRIMER',
    getQueue: async () => prompts,
    markHarvested: async () => {},
    emit: (_s: RunStatus) => {},
    recorder: {
      start: async () => 'run-1',
      addPrompt: async () => {},
      harvest: async () => {},
      attempt: async (id) => {
        calls.attempts.push(id);
      },
      failure: async (id, kind, detail) => {
        calls.failures.push({ id, kind, detail });
      },
      reprime: async () => {},
      pause: async () => {},
      finish: async () => {},
    },
  });

  return {
    runner,
    calls,
    imageDone: (u) => imageCb?.({ imageUrl: u, at: Date.now() }),
    refused: () => refusedCb?.(),
    stall: (ms) => stallCb?.({ waitedMs: ms }),
  };
}

describe('BatchRunner — records every attempt and every failure', () => {
  it('counts an attempt per prompt fed, and not for prompts it never reaches', async () => {
    const prompts = [P('a-1', 'alpha'), P('b-2', 'bravo'), P('c-3', 'charlie')];
    const r = makeRunner(prompts);
    await r.runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    r.imageDone('https://img/alpha.png');
    await settle();
    r.runner.stop();
    await settle();

    // alpha and bravo were fed; charlie never was.
    expect(r.calls.attempts).toEqual(['a-1', 'b-2']);
    expect(r.calls.attempts).not.toContain('c-3');
  });

  it('records a feed failure against the prompt, not only as a run-level pause', async () => {
    const prompts = [P('a-1', 'alpha')];
    // Feed 0 is the primer; feed 1 is alpha, and that is the one that throws.
    const r = makeRunner(prompts, { failFeedFrom: 1 });
    await r.runner.start({ ...FAST, entry: 'fresh' });
    await settle();

    expect(r.calls.attempts).toContain('a-1');
    const f = r.calls.failures.find((x) => x.id === 'a-1');
    expect(f?.kind).toBe('feed-failed');
    expect(f?.detail).toContain('Enter did not submit it');
  });

  it('records a stall against the prompt that stalled', async () => {
    const prompts = [P('a-1', 'alpha')];
    const r = makeRunner(prompts);
    await r.runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    r.stall(390_000);
    await settle();

    const f = r.calls.failures.find((x) => x.id === 'a-1');
    expect(f?.kind).toBe('stalled');
    expect(f?.detail).toContain('390s');
  });

  it('records a refusal against the prompt that was refused', async () => {
    const prompts = [P('a-1', 'alpha'), P('b-2', 'bravo')];
    const r = makeRunner(prompts);
    await r.runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    r.refused();
    await settle();

    const f = r.calls.failures.find((x) => x.id === 'a-1');
    expect(f?.kind).toBe('refused');
  });
});
