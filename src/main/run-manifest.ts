import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from '@appydave/core';
import { slugify, type Prompt } from '../shared/domain.js';
import type { RunManifest, RunSummary } from '../shared/ipc.js';
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
  private manifest: RunManifest | null = null;
  private provenance = '';
  private readonly usedIds = new Set<string>();

  constructor(deps: { fileAuthor: FileAuthor; logger?: Logger }) {
    this.author = deps.fileAuthor;
    this.logger = deps.logger;
  }

  /** Open a run: create its manifest and return the run id (= folder name). */
  async start(info: RunStartInfo): Promise<string> {
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
      counts: { total: info.prompts.length, harvested: 0, refused: 0 },
      reprimes: [],
      pauses: [],
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

  async refusal(promptId: string): Promise<void> {
    const m = this.manifest;
    if (!m) return;
    const entry = m.prompts.find((p) => p.id === promptId);
    if (entry) entry.status = 'refused';
    m.counts.refused += 1;
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
    await this.flush();
    this.manifest = null;
    this.logger?.info({ runId: m.runId, outcome }, 'run manifest closed');
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
