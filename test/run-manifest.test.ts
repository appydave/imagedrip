import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunManifest } from '../src/shared/ipc';
import type { FileAuthor } from '../src/main/file-author';
import { RunRecorder, listRuns, makeRunId, readRunManifest } from '../src/main/run-manifest';

/** In-memory FileAuthor stand-in (structurally cast — no disk, no git). */
function fakeAuthor(): { files: Map<string, string>; author: FileAuthor } {
  const files = new Map<string, string>();
  const author = {
    write: async (relPath: string, content: string | Uint8Array) => {
      files.set(relPath, content.toString());
      return { path: relPath, committed: false };
    },
    delete: async (relPath: string) => {
      files.delete(relPath);
      return { path: relPath, committed: false };
    },
  } as unknown as FileAuthor;
  return { files, author };
}

const PROMPTS = [
  { id: 'kangaroo-1', subject: 'kangaroo', text: 'a kangaroo', status: 'queued' as const },
  { id: 'koala-2', subject: 'koala', text: 'a koala', status: 'queued' as const },
];

describe('makeRunId', () => {
  const at = new Date(2026, 6, 28, 9, 5); // 2026-07-28 09:05 local

  it('formats YYYY-MM-DD-HHmm-<theme-slug>', () => {
    expect(makeRunId(at, 'Aussie Animals')).toBe('2026-07-28-0905-aussie-animals');
  });

  it('suffixes -2, -3… when the id is taken (same-minute rerun)', () => {
    const taken = new Set(['2026-07-28-0905-aussie-animals']);
    expect(makeRunId(at, 'Aussie Animals', taken)).toBe('2026-07-28-0905-aussie-animals-2');
    taken.add('2026-07-28-0905-aussie-animals-2');
    expect(makeRunId(at, 'Aussie Animals', taken)).toBe('2026-07-28-0905-aussie-animals-3');
  });
});

describe('RunRecorder', () => {
  it('records a run end to end: start → harvest/refusal/reprime/pause → finish', async () => {
    const { files, author } = fakeAuthor();
    const rec = new RunRecorder({ fileAuthor: author });

    const runId = await rec.start({
      projectName: 'Smoothies',
      themeName: 'animals',
      primer: 'BRAND\n\nPROJECT',
      prompts: PROMPTS,
    });
    expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-animals$/);

    let m = JSON.parse(files.get(`${runId}/manifest.json`)!) as RunManifest;
    expect(m.primer).toBe('BRAND\n\nPROJECT');
    expect(m.counts).toEqual({ total: 2, harvested: 0, refused: 0 });
    expect(m.prompts.every((p) => p.status === 'queued')).toBe(true);

    await rec.harvest('kangaroo-1', 'kangaroo.png', 42000, 'https://img/1');
    await rec.refusal('koala-2');
    await rec.reprime(1);
    await rec.pause('rate limit');
    await rec.finish('complete');

    m = JSON.parse(files.get(`${runId}/manifest.json`)!) as RunManifest;
    expect(m.prompts[0]).toMatchObject({
      status: 'harvested',
      file: 'kangaroo.png',
      generationMs: 42000,
    });
    expect(m.prompts[1].status).toBe('refused');
    expect(m.counts).toEqual({ total: 2, harvested: 1, refused: 1 });
    expect(m.reprimes).toEqual([1]);
    expect(m.pauses).toHaveLength(1);
    expect(m.pauses[0].reason).toBe('rate limit');
    expect(m.outcome).toBe('complete');
    expect(m.finishedAt).toBeTypeOf('number');

    // Provenance rides along in the run folder via the existing mechanism.
    const prov = files.get(`${runId}/provenance.jsonl`)!;
    expect(prov.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(prov.trim())).toMatchObject({
      savedPath: 'kangaroo.png',
      imageUrl: 'https://img/1',
    });
  });

  it('records a dial-in run: starts empty, addPrompt is idempotent, harvests land (WP4)', async () => {
    const { files, author } = fakeAuthor();
    const rec = new RunRecorder({ fileAuthor: author });
    const runId = await rec.start({
      projectName: 'Smoothies',
      themeName: 'animals',
      primer: 'PRIMER',
      prompts: [],
      mode: 'dial-in',
    });

    await rec.addPrompt(PROMPTS[0]);
    await rec.addPrompt(PROMPTS[0]); // second inject of the same prompt: no dupe
    await rec.harvest('kangaroo-1', 'kangaroo.png', 30000, 'https://img/k');

    const m = JSON.parse(files.get(`${runId}/manifest.json`)!) as RunManifest;
    expect(m.mode).toBe('dial-in');
    expect(m.prompts).toHaveLength(1);
    expect(m.prompts[0]).toMatchObject({ id: 'kangaroo-1', status: 'harvested' });
    expect(m.counts).toEqual({ total: 1, harvested: 1, refused: 0 });
  });

  it('gives a second same-minute run of the same theme a distinct id', async () => {
    const { author } = fakeAuthor();
    const rec = new RunRecorder({ fileAuthor: author });
    const info = { projectName: 'P', themeName: 't', primer: '', prompts: PROMPTS };
    const first = await rec.start(info);
    await rec.finish('complete');
    const second = await rec.start(info);
    expect(second).not.toBe(first);
  });

  it('seeds used ids from the folders on disk — no collision across an app restart (advisory-1 #5)', async () => {
    const info = { projectName: 'P', themeName: 't', primer: '', prompts: PROMPTS };
    // "First app session" writes a run.
    const s1 = fakeAuthor();
    const first = await new RunRecorder({ fileAuthor: s1.author }).start(info);
    // "Second app session" (fresh in-memory usedIds) sees that folder on disk.
    const s2 = fakeAuthor();
    const rec2 = new RunRecorder({
      fileAuthor: s2.author,
      listExistingRunIds: async () => [first],
    });
    const second = await rec2.start(info);
    expect(second).not.toBe(first);
  });
});

describe('listRuns / readRunManifest', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'imagedrip-runs-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function writeRun(runId: string, startedAt: number): Promise<void> {
    await fs.mkdir(join(dir, runId), { recursive: true });
    const manifest: RunManifest = {
      runId,
      projectName: 'P',
      themeName: 'animals',
      startedAt,
      primer: 'p',
      prompts: [],
      counts: { total: 3, harvested: 2, refused: 0 },
      reprimes: [],
      pauses: [],
    };
    await fs.writeFile(join(dir, runId, 'manifest.json'), JSON.stringify(manifest));
  }

  it('lists runs newest-first, skipping non-run folders', async () => {
    await writeRun('2026-07-27-0900-animals', 100);
    await writeRun('2026-07-28-0900-animals', 200);
    await fs.mkdir(join(dir, 'not-a-run'));
    const runs = await listRuns(dir);
    expect(runs.map((r) => r.runId)).toEqual([
      '2026-07-28-0900-animals',
      '2026-07-27-0900-animals',
    ]);
    expect(runs[0]).toMatchObject({ harvested: 2, total: 3, themeName: 'animals' });
  });

  it('returns [] when the output dir does not exist yet', async () => {
    expect(await listRuns(join(dir, 'missing'))).toEqual([]);
  });

  it('refuses a runId that escapes the output dir', async () => {
    expect(await readRunManifest(dir, '../outside')).toBeNull();
    expect(await readRunManifest(dir, '/abs')).toBeNull();
  });
});
