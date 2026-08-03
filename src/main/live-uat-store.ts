import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';
import type { Snag, ImageVerdict, UatCounts } from '../shared/live-uat.js';

/**
 * LiveUatStore — the append-only judgment sidecar (`docs/live-uat.md`).
 *
 *   <userData>/live-uat/snags.jsonl
 *   <userData>/live-uat/image-verdicts.jsonl
 *
 * JSONL, not JSON, on purpose: a crash mid-session can lose at most the last
 * line rather than corrupt the corpus, appending never rewrites what's already
 * there, and `wc -l` is a live count. The consumer is an in-session agent
 * running `cat` — there is no API and there is deliberately no inbox.
 *
 * This is a SIDECAR. It never reads or writes `domain.json`, never touches a run
 * manifest, and never lands inside a harvested image folder. Removing the
 * directory removes the feature and nothing else.
 */

const SNAGS = 'snags.jsonl';
const VERDICTS = 'image-verdicts.jsonl';

function dir(): string {
  return join(app.getPath('userData'), 'live-uat');
}

/** Line counts per file, seeded from disk on first touch so ids never collide
 *  across app restarts (the same failure advisory-1 #5 fixed for run ids). */
const counts = new Map<string, number>();

async function countLines(file: string): Promise<number> {
  try {
    const text = await fs.readFile(join(dir(), file), 'utf8');
    return text.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0; // no file yet
  }
}

async function seeded(file: string): Promise<number> {
  const known = counts.get(file);
  if (known !== undefined) return known;
  const n = await countLines(file);
  counts.set(file, n);
  return n;
}

/** Append one record and return it. The caller never supplies id/status/createdAt. */
async function append<T extends { id: string }>(
  file: string,
  prefix: string,
  make: (id: string) => T,
): Promise<T> {
  const n = (await seeded(file)) + 1;
  counts.set(file, n);
  const record = make(`${prefix}-${n}`);
  await fs.mkdir(dir(), { recursive: true });
  await fs.appendFile(join(dir(), file), `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/** Raise one cockpit snag. Main owns id, status and the clock. */
export async function writeSnag(
  input: Omit<Snag, 'id' | 'status' | 'createdAt' | 'projectId'>,
  projectId: string,
): Promise<Snag> {
  return append<Snag>(SNAGS, 'snag', (id) => ({
    ...input,
    id,
    projectId,
    status: 'open',
    createdAt: Date.now(),
  }));
}

/** Record one image judgment. `producer` is resolved by the caller from the
 *  run manifest — never accepted from the renderer. */
export async function writeVerdict(
  input: Omit<ImageVerdict, 'id' | 'status' | 'createdAt'>,
): Promise<ImageVerdict> {
  return append<ImageVerdict>(VERDICTS, 'iv', (id) => ({
    ...input,
    id,
    status: 'open',
    createdAt: Date.now(),
  }));
}

export async function readCounts(): Promise<UatCounts> {
  return { snags: await seeded(SNAGS), verdicts: await seeded(VERDICTS) };
}

/** Show the corpus in Finder — the proof that capture landed. */
export async function revealStore(): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  shell.openPath(dir());
}
