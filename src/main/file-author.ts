import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { atomicWrite } from '@appydave/core';
import type { Logger } from '@appydave/core';

const exec = promisify(execFile);

export interface FileAuthorOptions {
  /** The scoped root. Every write/delete MUST resolve inside this directory. */
  root: string;
  /** Git-commit each change (a revert point per write). Default true. */
  git?: boolean;
  /** Warned on `failed` only — the one reason that is nobody's intention. */
  logger?: Logger;
}

/**
 * WHY a write was not committed.
 *
 * `committed: false` used to mean five different things behind one bare `catch`,
 * and the comment only named two of them. The one it did not name is the one
 * about to matter: **`ignored`**. The moment run PNGs are gitignored (the
 * proposed image-storage policy), every harvest stops committing — and with a
 * single boolean there is no way to tell that intended policy from a broken
 * repo. Absence and success would look identical, which is the failure this
 * repo forbids by name.
 *
 *   git-disabled  FileAuthor was constructed with `git: false`. Intentional.
 *   not-a-repo    the root is not inside a git work tree. Usually intentional.
 *   ignored       the path is gitignored. POLICY — the file is on disk and the
 *                 repo was asked not to track it. NOT a failure.
 *   no-change     git had nothing to commit; the content was already identical.
 *   failed        git ran and genuinely failed — a lock, permissions, a corrupt
 *                 index. **This is the only one anybody needs to act on**, and
 *                 the only one that is logged.
 */
export type CommitSkipReason =
  | 'git-disabled'
  | 'not-a-repo'
  | 'ignored'
  | 'no-change'
  | 'failed';

export interface AuthorResult {
  /** Path relative to root. */
  path: string;
  committed: boolean;
  /** Commit SHA when committed. */
  commit?: string;
  /** Present exactly when `committed` is false. See `CommitSkipReason`. */
  reason?: CommitSkipReason;
  /** Git's own message, when `reason` is `failed`. Never swallowed. */
  error?: string;
}

/**
 * FileAuthor — path-scoped, git-committed file authoring.
 *
 * The guarantee that makes AppyTron's "mutating operator" safe (docs §9): every
 * write is (a) refused if it resolves outside `root`, and (b) git-committed, so
 * every change has a revert point. Borrowed pattern from eve-studio. Uses
 * `@appydave/core`'s `atomicWrite`, so writes are also torn-write-proof.
 */
export class FileAuthor {
  private readonly root: string;
  private readonly git: boolean;
  private readonly logger?: Logger;

  constructor(options: FileAuthorOptions) {
    this.root = resolve(options.root);
    this.git = options.git ?? true;
    this.logger = options.logger;
  }

  /** Resolve a relative path, refusing anything that escapes the root. */
  private safe(relPath: string): string {
    const abs = resolve(this.root, relPath);
    const rel = relative(this.root, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`FileAuthor: path escapes root: ${relPath}`);
    }
    return abs;
  }

  async write(
    relPath: string,
    content: string | Uint8Array,
    message?: string,
  ): Promise<AuthorResult> {
    const abs = this.safe(relPath);
    await fs.mkdir(dirname(abs), { recursive: true });
    await atomicWrite(abs, content);
    return this.commit(relPath, message ?? `author: write ${relPath}`);
  }

  async delete(relPath: string, message?: string): Promise<AuthorResult> {
    const abs = this.safe(relPath);
    await fs.rm(abs, { force: true });
    return this.commit(relPath, message ?? `author: delete ${relPath}`);
  }

  private async commit(relPath: string, message: string): Promise<AuthorResult> {
    if (!this.git) return { path: relPath, committed: false, reason: 'git-disabled' };
    try {
      await exec('git', ['add', '--', relPath], { cwd: this.root });
      await exec('git', ['commit', '--quiet', '-m', message, '--', relPath], { cwd: this.root });
      const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: this.root });
      return { path: relPath, committed: true, commit: stdout.trim() };
    } catch (err) {
      // The write itself succeeded — only the commit did not. Diagnose WHY, and
      // deliberately only on the failure path: the happy path keeps its three
      // execs, and nothing pays for this until something has already gone wrong.
      const reason = await this.diagnose(relPath);
      const error = err instanceof Error ? err.message : String(err);
      if (reason === 'failed') {
        this.logger?.warn(
          { path: relPath, root: this.root, error },
          'FileAuthor: git commit FAILED — the file is on disk but has no revert point',
        );
        return { path: relPath, committed: false, reason, error };
      }
      return { path: relPath, committed: false, reason };
    }
  }

  /**
   * Why did the commit not happen? Ordered cheapest-and-most-specific first.
   * Every probe is read-only and scoped to `this.root`; a probe that itself
   * throws is treated as inconclusive rather than as an answer, so an unusable
   * git can never be mistaken for a deliberate policy.
   */
  private async diagnose(relPath: string): Promise<CommitSkipReason> {
    // `check-ignore` exits 0 when the path IS ignored, 1 when it is not.
    try {
      await exec('git', ['check-ignore', '-q', '--', relPath], { cwd: this.root });
      return 'ignored';
    } catch {
      /* exit 1 = not ignored; anything else falls through to the checks below */
    }
    try {
      const { stdout } = await exec('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: this.root,
      });
      if (stdout.trim() !== 'true') return 'not-a-repo';
    } catch {
      return 'not-a-repo';
    }
    try {
      const { stdout } = await exec('git', ['status', '--porcelain', '--', relPath], {
        cwd: this.root,
      });
      if (stdout.trim() === '') return 'no-change';
    } catch {
      /* status failed — that is itself a broken repo, so fall through to failed */
    }
    return 'failed';
  }
}
