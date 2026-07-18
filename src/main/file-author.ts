import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { atomicWrite } from '@appydave/core';

const exec = promisify(execFile);

export interface FileAuthorOptions {
  /** The scoped root. Every write/delete MUST resolve inside this directory. */
  root: string;
  /** Git-commit each change (a revert point per write). Default true. */
  git?: boolean;
}

export interface AuthorResult {
  /** Path relative to root. */
  path: string;
  committed: boolean;
  /** Commit SHA when committed. */
  commit?: string;
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

  constructor(options: FileAuthorOptions) {
    this.root = resolve(options.root);
    this.git = options.git ?? true;
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
    if (!this.git) return { path: relPath, committed: false };
    try {
      await exec('git', ['add', '--', relPath], { cwd: this.root });
      await exec('git', ['commit', '--quiet', '-m', message, '--', relPath], { cwd: this.root });
      const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: this.root });
      return { path: relPath, committed: true, commit: stdout.trim() };
    } catch {
      // Not a git repo, or nothing to commit — the write still succeeded.
      return { path: relPath, committed: false };
    }
  }
}
