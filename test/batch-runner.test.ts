import { describe, it, expect } from 'vitest';
import type { Prompt } from '../src/shared/domain';
import type { RunStatus } from '../src/shared/ipc';
import { BatchRunner } from '../src/main/batch-runner';
import type { WebviewHarness } from '../src/main/webview-harness';

/**
 * WP5 Problem C — re-verify the pacing gate (awaiting + seen, first UNSEEN src
 * wins) under BOTH run entries, against a scripted fake harness. These tests
 * pin the invariant the account's safety depends on: no prompt is ever fed
 * before the previous image has landed.
 */

const PROMPTS: Prompt[] = [
  { id: 'kangaroo-1', subject: 'kangaroo', text: 'a kangaroo', status: 'queued' },
  { id: 'koala-2', subject: 'koala', text: 'a koala', status: 'queued' },
  { id: 'emu-3', subject: 'emu', text: 'an emu', status: 'queued' },
];

// All settles/cadence zeroed so the loop advances on real (immediate) timers.
const FAST = {
  chunkSize: 18,
  cadenceBaseMs: 0,
  cadenceJitterMs: 0,
  primerSettleMs: 0,
  loadSettleMs: 0,
};

interface Fake {
  runner: BatchRunner;
  feeds: string[];
  harvests: string[];
  newConversations: () => number;
  imageDone: (url: string) => void;
}

function makeFake(prompts: Prompt[] = PROMPTS, primer = 'PRIMER'): Fake {
  const feeds: string[] = [];
  const harvests: string[] = [];
  let newConv = 0;
  let imageCb: ((e: { imageUrl: string; at: number }) => void) | undefined;

  const harness = {
    onImageDone: (cb: (e: { imageUrl: string; at: number }) => void) => {
      imageCb = cb;
    },
    onRateLimit: () => {},
    onRefused: () => {},
    onStall: () => {},
    feed: async (text: string) => {
      feeds.push(text);
    },
    newConversation: async () => {
      newConv += 1;
    },
    harvest: async (_url: string, relPath: string) => {
      harvests.push(relPath);
      return relPath;
    },
  } as unknown as WebviewHarness;

  const runner = new BatchRunner({
    harness,
    getPrimer: async () => primer,
    getQueue: async () => prompts,
    markHarvested: async () => {},
    emit: (_s: RunStatus) => {},
  });

  return {
    runner,
    feeds,
    harvests,
    newConversations: () => newConv,
    imageDone: (url) => imageCb?.({ imageUrl: url, at: Date.now() }),
  };
}

/** Let queued microtasks + 0ms timers run. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe('BatchRunner run entries (WP5)', () => {
  it("'fresh' opens a new conversation and posts the primer first (v1 behaviour)", async () => {
    const f = makeFake();
    await f.runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    expect(f.newConversations()).toBe(1);
    expect(f.feeds[0]).toBe('PRIMER');
    expect(f.feeds[1]).toBe('a kangaroo');
  });

  it("'continue' NEVER opens a new conversation and NEVER posts the primer — the dial-in fix", async () => {
    const f = makeFake();
    await f.runner.start({ ...FAST, entry: 'continue' });
    await settle();
    expect(f.newConversations()).toBe(0);
    expect(f.feeds).toEqual(['a kangaroo']); // straight into the queue
  });

  it('entry defaults to fresh when omitted (unchanged v1 call sites)', async () => {
    const f = makeFake();
    await f.runner.start({ ...FAST });
    await settle();
    expect(f.newConversations()).toBe(1);
  });
});

describe('BatchRunner pacing gate (WP5 problem C — re-verified, not rebuilt)', () => {
  it('never feeds the next prompt before the previous image lands', async () => {
    const f = makeFake();
    await f.runner.start({ ...FAST, entry: 'continue' });
    await settle();
    expect(f.feeds).toEqual(['a kangaroo']); // waiting on image 1 — nothing else fed

    await settle(); // time alone must not advance it
    expect(f.feeds).toHaveLength(1);

    f.imageDone('https://img/1');
    await settle();
    expect(f.harvests).toEqual(['kangaroo.png']);
    expect(f.feeds).toEqual(['a kangaroo', 'a koala']);

    f.imageDone('https://img/2');
    await settle();
    expect(f.feeds).toEqual(['a kangaroo', 'a koala', 'an emu']);
  });

  it('a re-fired (seen) src does not advance the run — first UNSEEN wins', async () => {
    const f = makeFake();
    await f.runner.start({ ...FAST, entry: 'continue' });
    await settle();

    f.imageDone('https://img/1');
    await settle();
    expect(f.feeds).toHaveLength(2); // koala fed, awaiting image 2

    f.imageDone('https://img/1'); // DOM flip-flop re-fires the old src
    await settle();
    expect(f.harvests).toHaveLength(1); // NOT harvested twice
    expect(f.feeds).toHaveLength(2); // NOT advanced

    f.imageDone('https://img/2'); // the real image 2
    await settle();
    expect(f.harvests).toEqual(['kangaroo.png', 'koala.png']);
    expect(f.feeds).toHaveLength(3);
  });

  it("passive seen-learning (WP4): a hand-made image observed while idle can't be mis-attributed after 'continue'", async () => {
    const f = makeFake();
    // David dials in by hand — an image completes while NO run is live.
    f.imageDone('https://img/hand-made');
    await settle();

    await f.runner.start({ ...FAST, entry: 'continue' });
    await settle();
    expect(f.feeds).toEqual(['a kangaroo']);

    // The old src re-fires during hydration churn — must NOT count as image 1.
    f.imageDone('https://img/hand-made');
    await settle();
    expect(f.harvests).toHaveLength(0);

    f.imageDone('https://img/real-kangaroo');
    await settle();
    expect(f.harvests).toEqual(['kangaroo.png']);
  });

  it("a 'fresh' entry clears the seen set (new empty chat), 'continue' keeps it", async () => {
    const f = makeFake();
    f.imageDone('https://img/old');
    await settle();

    // fresh: seen cleared — 'old' would be a NEW src in a new chat's DOM. The
    // fresh chat can't re-fire it in practice, but the gate must still await
    // the post-feed event; verify it harvests as image 1 when it arrives.
    await f.runner.start({ ...FAST, entry: 'fresh' });
    await settle();
    f.imageDone('https://img/old');
    await settle();
    expect(f.harvests).toEqual(['kangaroo.png']);
  });
});
