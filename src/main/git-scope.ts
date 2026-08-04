import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, relative, resolve } from 'node:path';

const exec = promisify(execFile);

/**
 * Git scope checks for the output dir (v3 WP3).
 *
 * THE BUG THIS EXISTS TO FIX: `ensureOutputRoot` tested for `<dir>/.git` and
 * git-initialised the folder when it was absent. That question is not "is this
 * folder under version control?" — it is "is there a `.git` in this exact
 * folder?", and the two differ for every directory inside a repo. Point the
 * output dir at `~/dev/image-projects/i-appydave/projects/x/runs` and the check
 * sees no `.git` there, runs `git init`, and silently creates a NESTED repo
 * inside the brand repo. Nested repos are invisible until they bite: the outer
 * repo stops tracking anything below them, so the harvests you thought were
 * committed are in a repository nobody ever pushes.
 *
 * `git rev-parse --is-inside-work-tree` asks the question that was actually
 * meant — it walks ANCESTORS, so it answers true anywhere inside the tree.
 */
export async function isInsideWorkTree(dir: string): Promise<boolean> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir });
    return stdout.trim() === 'true';
  } catch {
    // Not a repo, git missing, or the directory is gone — all mean "no".
    return false;
  }
}

/**
 * Is `child` at or inside `parent`? Used to keep the app from initialising a
 * repo inside a brand repo root that is deliberately not yet git-initialised.
 * Pure path arithmetic — it never touches the filesystem.
 */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
