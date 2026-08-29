import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from '@appydave/core';
import { slugify, type Prompt } from '../shared/domain.js';
import type { PromptFailure, RunManifest, RunSummary } from '../shared/ipc.js';
import { appendProvenance } from './image-harvest.js';
import type { FileAuthor } from './file-author.js';

/**
 * Run manifest (WP1) — `<outputDir>/<run-id>/manifest.json`, the durable record
 * of HOW a set of images was made: the exact primer as posted, every prompt
 * with its outcome, re-prime boundaries, and pauses. Written through the same
 * FileAuthor as the images (scoped + committed), and each harvest also appends
 * to the run's `provenance.jsonl` via the existing `appendProvenance` — one
 * provenance mechanism, extended, not duplicated.
 */

/** `YYYY-MM-DD-HHmm-<theme-slug>`, suffixed -2, -3… if already taken. */
export function makeRunId(now: Date, themeName: string, taken?: ReadonlySet<string>): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const base = [
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    `${p(now.getHours())}${p(now.getMinutes())}`,
    slugify(themeName),
  ].join('-');
  if (!taken?.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export interface RunStartInfo {
  projectName: string;
  themeName: string;
  primer: string;
  prompts: Prompt[];
  /** 'auto' (Batch Runner) or 'dial-in' (manual injects — WP4). */
  mode?: 'auto' | 'dial-in';
}

/** Records one run at a time; every mutation rewrites the manifest atomically. */
export class RunRecorder {
  private readonly author: FileAuthor;
  private readonly logger?: Logger;
  /** On-disk run folders (advisory-1 #5) — collision source across restarts. */
  private readonly listExistingRunIds?: () => Promise<string[]>;
  private manifest: RunManifest | null = null;
  private provenance = '';
  private readonly usedIds = new Set<string>();

  constructor(deps: {
    fileAuthor: FileAuthor;
    listExistingRunIds?: () => Promise<string[]>;
    logger?: Logger;
  }) {
    this.author = deps.fileAuthor;
    this.listExistingRunIds = deps.listExistingRunIds;
    this.logger = deps.logger;
  }

  /** Open a run: create its manifest and return the run id (= folder name). */
  async start(info: RunStartInfo): Promise<string> {
    // Seed from disk so a same-minute same-theme run after an app restart can
    // never write into an existing run folder (advisory-1 #5).
    if (this.listExistingRunIds) {
      try {
        for (const id of await this.listExistingRunIds()) this.usedIds.add(id);
      } catch (err) {
        this.logger?.warn({ err: String(err) }, 'could not list existing run ids');
      }
    }
    const runId = makeRunId(new Date(), info.themeName, this.usedIds);
    this.usedIds.add(runId);
    this.provenance = '';
    this.manifest = {
      runId,
      projectName: info.projectName,
      themeName: info.themeName,
      mode: info.mode ?? 'auto',
      startedAt: Date.now(),
      primer: info.primer,
      prompts: info.prompts.map((p) => ({
        id: p.id,
        subject: p.subject,
        text: p.text,
        status: 'queued',
      })),
      counts: { total: info.prompts.length, harvested: 0, refused: 0, failed: 0 },
      reprimes: [],
      pauses: [],
      // v5 Phase 0.3 — declare the run OPEN before anything is fed, so that from
      // here on an absent `outcome` can only mean a pre-0.3 manifest. The flush
      // below is what makes it true on disk even if the process dies next.
      outcome: 'open',
    };
    await this.flush();
    this.logger?.info({ runId }, 'run manifest opened');
    return runId;
  }

  /** Register a prompt injected into an open (dial-in) run — idempotent (WP4). */
  async addPrompt(p: Prompt): Promise<void> {
    const m = this.manifest;
    if (!m || m.prompts.some((x) => x.id === p.id)) return;
    m.prompts.push({ id: p.id, subject: p.subject, text: p.text, status: 'queued' });
    m.counts.total += 1;
    await this.flush();
  }

  async harvest(
    promptId: string,
    file: string,
    generationMs?: number,
    imageUrl?: string,
  ): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const entry = m.prompts.find((p) => p.id === promptId);
    if (entry) {
      entry.status = 'harvested';
      entry.file = file;
      entry.generationMs = generationMs;
    }
    m.counts.harvested += 1;
    await this.flush();
    // The per-harvest provenance line — the v1 mechanism, now per-run.
    const line = {
      prompt: entry?.text ?? promptId,
      imageUrl: imageUrl ?? '',
      savedPath: file,
      at: Date.now(),
    };
    await appendProvenance(this.author, `${m.runId}/provenance.jsonl`, line, this.provenance);
    this.provenance += `${JSON.stringify(line)}\n`;
  }

  /**
   * This prompt is being fed, now. Counted BEFORE the feed rather than after,
   * because a feed that throws is exactly the case this exists to record — an
   * attempt counted only on success would be blind to the failure it is for.
   */
  async attempt(promptId: string): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const entry = m.prompts.find((p) => p.id === promptId);
    if (!entry) return;
    entry.attempts = (entry.attempts ?? 0) + 1;
    await this.flush();
  }

  /**
   * This prompt did not deliver, and why.
   *
   * Only `refused` moves the row to a terminal status here, because only a
   * refusal makes the runner SKIP the prompt. `stalled` and `feed-failed` pause
   * the run with the prompt still current, so the row stays `queued` and may
   * still be harvested on resume — `finish()` is what converts the ones that
   * never came back into `failed`.
   */
  async failure(promptId: string, kind: PromptFailure['kind'], detail: string): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const entry = m.prompts.find((p) => p.id === promptId);
    if (!entry) return;
    entry.failure = { kind, detail, at: Date.now() };
    if (kind === 'refused') {
      entry.status = 'refused';
      m.counts.refused += 1;
    }
    await this.flush();
  }

  async reprime(afterHarvested: number): Promise<void> {
    if (!this.manifest) return;
    this.manifest.reprimes.push(afterHarvested);
    await this.flush();
  }

  async pause(reason: string): Promise<void> {
    if (!this.manifest) return;
    this.manifest.pauses.push({ at: Date.now(), reason });
    await this.flush();
  }

  async finish(outcome: 'complete' | 'stopped'): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    m.finishedAt = Date.now();
    m.outcome = outcome;

    // ── The terminal sweep ──
    // A row that was fed and never came back has sat at `queued` until now,
    // which is the same value as "the run never reached it". Once the run is
    // over that ambiguity is permanent, so this is the last honest moment to
    // resolve it. Anything attempted and still unresolved is `failed`.
    let failed = 0;
    for (const p of m.prompts) {
      if (p.status === 'queued' && (p.attempts ?? 0) > 0) {
        p.status = 'failed';
        failed += 1;
        // A stall or feed-failure always records a `failure` first, so an
        // absent one here means the run ended some other way mid-flight —
        // stopped by the operator while awaiting, or quit. Say that, rather
        // than leaving the row with no explanation at all.
        p.failure ??= {
          kind: 'stalled',
          detail: `run ended (${outcome}) while this prompt was still awaiting an image`,
          at: Date.now(),
        };
      }
    }
    m.counts.failed = failed;

    await this.flush();
    this.manifest = null;
    this.logger?.info({ runId: m.runId, outcome, failed }, 'run manifest closed');
  }

  private async flush(): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    await this.author.write(
      `${m.runId}/manifest.json`,
      JSON.stringify(m, null, 2),
      `run ${m.runId}: manifest`,
    );
  }
}

/** Resolve a runId inside outputDir, refusing anything that escapes it. */
function safeRunDir(outputDir: string, runId: string): string | null {
  const abs = resolve(outputDir, runId);
  const rel = relative(resolve(outputDir), abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.includes('/')) return null;
  return abs;
}

/** Every subdirectory name in the output dir — run folders with OR without a
 *  manifest (a crashed run's folder must still block id reuse, advisory-1 #5). */
export async function listRunDirNames(outputDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Scan the project's output dir for run folders (any dir with a manifest). */
export async function listRuns(outputDir: string): Promise<RunSummary[]> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await fs.readdir(outputDir, { withFileTypes: true });
  } catch {
    return []; // output dir not created yet — no runs
  }
  const out: RunSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = await readRunManifest(outputDir, e.name);
    if (!m) continue;
    out.push({
      runId: m.runId,
      themeName: m.themeName,
      mode: m.mode,
      startedAt: m.startedAt,
      finishedAt: m.finishedAt,
      outcome: m.outcome,
      harvested: m.counts.harvested,
      total: m.counts.total,
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Stamp the live run's in-process state onto its row.
 *
 * Pure, and separate from `listRuns`, because the two answer different
 * questions from different sources: the manifest on disk says what was
 * RECORDED, the runner says what is HAPPENING. Conflating them is the defect —
 * `outcome: 'open'` is written for a run in flight and stays written for one
 * that was paused, stopped mid-flight, or killed with the app, so all four read
 * identically to a client (`docs/spec-stall-budget-visibility.md` Part 2).
 *
 * `liveId` of null means no run is live, and every row comes back untouched.
 * A `liveId` matching nothing on disk also touches nothing: a run whose folder
 * has not been written yet is not a row to invent.
 */
export function markLiveRun(
  rows: RunSummary[],
  liveId: string | null,
  live: 'running' | 'paused',
): RunSummary[] {
  if (!liveId) return rows;
  return rows.map((r) => (r.runId === liveId ? { ...r, live } : r));
}

/** Read one run's manifest; null when missing/unparsable/escaping the root. */
export async function readRunManifest(
  outputDir: string,
  runId: string,
): Promise<RunManifest | null> {
  const dir = safeRunDir(outputDir, runId);
  if (!dir) return null;
  try {
    const text = await fs.readFile(join(dir, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(text) as RunManifest;
    return parsed && typeof parsed.runId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
