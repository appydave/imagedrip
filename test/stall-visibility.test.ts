import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Prompt } from '../src/shared/domain';
import type { RunStatus } from '../src/shared/ipc';
import { BatchRunner } from '../src/main/batch-runner';
import { markLiveRun } from '../src/main/run-manifest';
import type { WebviewHarness } from '../src/main/webview-harness';

/**
 * "Is it waiting, or is it stuck?" — `docs/spec-stall-budget-visibility.md`.
 *
 * A generation measured at 328.9s showed the static string
 * `awaiting image: <subject>` for its whole duration, so a healthy slow render
 * and a dead one were indistinguishable on screen. Over the API it was worse:
 * `runs.list` returned `1/4 outcome=open` at the exact moment the runner had
 * logged `WARN stall — pausing`, so the only way to find out was to tail a log.
 *
 * These pin the two facts that make the answer reachable — the runner reports
 * how much of the derived stall budget the CURRENT image has burned, and it
 * reports whether the live run is paused.
 *
 * ── What this does NOT establish ──
 * That the footer visibly ticks. The 1s interpolation lives in a React hook
 * (`useStallCountdown`), on the far side of a bridge no node test reaches; its
 * arithmetic is pinned below against the same fields, but the rendering is
 * confirmed by watching a real run.
 */

const PROMPTS: Prompt[] = [
  { id: 'kangaroo-1', subject: 'kangaroo', text: 'a kangaroo', status: 'queued' },
  { id: 'koala-2', subject: 'koala', text: 'a koala', status: 'queued' },
];

const FAST = {
  chunkSize: 18,
  cadenceBaseMs: 0,
  cadenceJitterMs: 0,
  primerSettleMs: 0,
  loadSettleMs: 0,
};

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

function makeRunner(): {
  runner: BatchRunner;
  statuses: RunStatus[];
  imageDone: (url: string) => void;
} {
  let imageCb: ((e: { imageUrl: string; at: number }) => void) | undefined;
  const harness = {
    onImageDone: (cb: (e: { imageUrl: string; at: number }) => void) => {
      imageCb = cb;
    },
    onRateLimit: () => {},
    onRefused: () => {},
    onStall: () => {},
    setStallMs: () => {},
    feed: async () => {},
    newConversation: async () => {},
    harvest: async (_url: string, relPath: string) => relPath,
  } as unknown as WebviewHarness;

  const statuses: RunStatus[] = [];
  const runner = new BatchRunner({
    harness,
    getPrimer: async () => 'PRIMER',
    getPromptShape: async () => undefined,
    getQueue: async () => PROMPTS,
    markHarvested: async () => {},
    emit: (s: RunStatus) => {
      statuses.push(s);
    },
  });
  return { runner, statuses, imageDone: (url) => imageCb?.({ imageUrl: url, at: Date.now() }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('stallRemainingMs — how much of the budget this image has left', () => {
  it('is null before a run starts: nothing is generating, so nothing is draining', () => {
    const { runner } = makeRunner();
    expect(runner.snapshot().stallRemainingMs).toBeNull();
  });

  it('is a real remaining budget while awaiting an image', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();

    const s = runner.snapshot();
    expect(s.phase).toBe('awaiting');
    expect(s.stallRemainingMs).not.toBeNull();
    // Just fed — essentially the whole cap is still ahead of it.
    expect(s.stallRemainingMs!).toBeGreaterThan(s.stallMs - 5_000);
    expect(s.stallRemainingMs!).toBeLessThanOrEqual(s.stallMs);
    runner.stop();
  });

  it('counts DOWN as the generation runs — the number has to move', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();

    const first = runner.snapshot().stallRemainingMs!;
    // Advance wall-clock only. Fake timers would also freeze the runner's own
    // scheduling, and what is under test is that the value is DERIVED from the
    // clock at read time rather than captured once at feed time.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 30_000);
    const later = runner.snapshot().stallRemainingMs!;
    vi.restoreAllMocks();

    expect(later).toBeLessThan(first);
    expect(first - later).toBeGreaterThanOrEqual(29_000);
    runner.stop();
  });

  it('clamps at zero rather than going negative once the budget is blown', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();

    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 60 * 60_000);
    expect(runner.snapshot().stallRemainingMs).toBe(0);
    vi.restoreAllMocks();
    runner.stop();
  });

  it('goes back to null once the image lands — a finished wait drains nothing', async () => {
    const { runner, imageDone } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    expect(runner.snapshot().stallRemainingMs).not.toBeNull();

    imageDone('https://img/kangaroo.png');
    await settle();
    runner.stop();

    // `feedAt` survives the image that cleared it, so this is the assertion
    // that stops a stopped run reporting a budget quietly draining on nothing.
    expect(runner.snapshot().stallRemainingMs).toBeNull();
  });

  it('rides on the DERIVED cap, not a constant — stallMs travels with it', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    const s = runner.snapshot();
    // The operator cannot hold a per-run number in their head, so the cap has
    // to be in the same payload as the remaining time, not looked up elsewhere.
    expect(s.stallMs).toBeGreaterThan(0);
    expect(s.stallRemainingMs).not.toBeNull();
    runner.stop();
  });
});

describe('the same snapshot the window gets is the one an agent can pull', () => {
  it('snapshot() carries every field the push channel emits', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();

    const pushed = statuses[statuses.length - 1];
    const pulled = runner.snapshot();
    // `at` and `stallRemainingMs` are clock-derived and must differ freely;
    // everything else is the same object built the same way, because two
    // builders would be two chances to disagree.
    const { at: _a, stallRemainingMs: _b, ...pushedRest } = pushed;
    const { at: _c, stallRemainingMs: _d, ...pulledRest } = pulled;
    expect(pulledRest).toEqual(pushedRest);
    runner.stop();
  });

  it('reports the run id, so a status lines up with its runs.list row', async () => {
    const { runner } = makeRunner();
    // No recorder is attached in this fake, so there is no id to report and
    // `null` is the honest answer — not an empty string pretending to be one.
    expect(runner.runId).toBeNull();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    expect(runner.snapshot().runId).toBeNull();
    runner.stop();
  });
});

describe('paused — the state runs.list used to render as healthy', () => {
  it('is false when nothing is running', () => {
    const { runner } = makeRunner();
    expect(runner.paused).toBe(false);
    expect(runner.runId).toBeNull();
  });

  it('is true while paused and false again after resume', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    expect(runner.paused).toBe(false);

    runner.pause();
    expect(runner.paused).toBe(true);
    expect(runner.snapshot().phase).toBe('paused');

    runner.resume();
    await settle();
    expect(runner.paused).toBe(false);
    runner.stop();
  });

  it('is false once STOPPED — a finished run is not a resting one', async () => {
    const { runner } = makeRunner();
    await runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    runner.pause();
    expect(runner.paused).toBe(true);
    runner.stop();
    // The distinction `runs.list` could not draw: `outcome: 'open'` on disk
    // covers stopped-mid-flight AND paused, so liveness is answered from the
    // process or not at all.
    expect(runner.paused).toBe(false);
    expect(runner.runId).toBeNull();
  });
});

describe('runs.list — liveness comes from the process, never from the file', () => {
  const rows = [
    { runId: 'r-2', themeName: 't', startedAt: 2, outcome: 'open' as const, harvested: 1, total: 4 },
    { runId: 'r-1', themeName: 't', startedAt: 1, outcome: 'complete' as const, harvested: 4, total: 4 },
  ];

  it('stamps only the live run', () => {
    const out = markLiveRun(rows, 'r-2', 'paused');
    expect(out[0].live).toBe('paused');
    expect(out[1].live).toBeUndefined();
  });

  it('leaves every row alone when nothing is live', () => {
    // The historical case, and the common one. A finished run must never come
    // back carrying a liveness claim.
    expect(markLiveRun(rows, null, 'running')).toEqual(rows);
    expect(markLiveRun(rows, null, 'running').every((r) => r.live === undefined)).toBe(true);
  });

  it('invents nothing for a live id with no folder on disk yet', () => {
    const out = markLiveRun(rows, 'r-3-not-written-yet', 'running');
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.live === undefined)).toBe(true);
  });

  it('does not mutate the rows it was handed', () => {
    const before = JSON.parse(JSON.stringify(rows));
    markLiveRun(rows, 'r-2', 'running');
    expect(rows).toEqual(before);
  });

  it('keeps outcome and live as SEPARATE facts', () => {
    // The whole point: `outcome` stays what the manifest recorded, and `live`
    // says what the process is doing. A paused run is `open` AND `paused`, and
    // collapsing either into the other is the conflation being fixed.
    const [live] = markLiveRun(rows, 'r-2', 'paused');
    expect(live.outcome).toBe('open');
    expect(live.live).toBe('paused');
  });
});
