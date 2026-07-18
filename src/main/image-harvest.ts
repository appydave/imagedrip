import type { Session } from 'electron';
import type { Logger } from '@appydave/core';
import type { FileAuthor } from './file-author.js';

/**
 * image-harvest (spec §5) — download a finished image IN the ChatGPT session, then
 * route it through `FileAuthor` (scoped root + git-committed).
 *
 * Fetching through `view.webContents.session` (not a bare `fetch`) means the
 * request carries the session's auth/CDN cookies, so `oaiusercontent`-style URLs
 * resolve. `FileAuthor` refuses any `relPath` that escapes its root, so a harvested
 * image can land ONLY inside the project's scoped output dir (spec §8).
 */
export interface HarvestOptions {
  /** The ChatGPT view's session — `view.webContents.session`. */
  session: Session;
  /** Scoped, git-committed writer (its root is the project output dir). */
  fileAuthor: FileAuthor;
  /** The finished image URL reported by the preload. */
  imageUrl: string;
  /** Destination relative to the FileAuthor root, e.g. `brand-art/item-001.png`. */
  relPath: string;
  logger?: Logger;
}

export interface HarvestResult {
  /** Path relative to the FileAuthor root. */
  path: string;
  bytes: number;
  committed: boolean;
  commit?: string;
}

export async function harvestImage(opts: HarvestOptions): Promise<HarvestResult> {
  const { session, fileAuthor, imageUrl, relPath, logger } = opts;

  const res = await session.fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`image-harvest: fetch ${res.status} for ${imageUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw new Error(`image-harvest: empty body for ${imageUrl}`);
  }

  const authored = await fileAuthor.write(relPath, buf, `harvest ${relPath}`);
  logger?.info({ relPath, bytes: buf.byteLength, commit: authored.commit }, 'harvested image');

  return {
    path: authored.path,
    bytes: buf.byteLength,
    committed: authored.committed,
    commit: authored.commit,
  };
}

/**
 * Append one provenance line per harvest to a log file (also via FileAuthor, so
 * it is scoped + committed). Keeps a durable prompt→url→file→time record.
 */
export async function appendProvenance(
  fileAuthor: FileAuthor,
  logRelPath: string,
  entry: { prompt: string; imageUrl: string; savedPath: string; at: number },
  existing = '',
): Promise<void> {
  const line = JSON.stringify(entry);
  await fileAuthor.write(logRelPath, `${existing}${line}\n`, `provenance ${entry.savedPath}`);
}
