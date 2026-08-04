import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isInside, isInsideWorkTree } from '../src/main/git-scope';

const exec = promisify(execFile);

/**
 * The nested-repo trap (v3 WP3).
 *
 * `ensureOutputRoot` used to test for `<dir>/.git` and git-init the folder when
 * it was absent — which is a different question from "is this under version
 * control?" for every directory INSIDE a repo. Pointing the output dir into an
 * existing repo therefore created a nested one, after which the outer repo
 * tracks nothing below it and the harvests you believed were committed sit in a
 * repository nobody pushes.
 *
 * These tests are the ancestor-detection guarantee: deep inside a work tree the
 * answer must be true, where the old `.git`-in-this-folder check said false.
 */

let base: string;
let repo: string;
let plain: string;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'imagedrip-gitscope-'));
  repo = join(base, 'i-appydave');
  plain = join(base, 'not-a-repo');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(plain, { recursive: true });
  await exec('git', ['init', '--quiet'], { cwd: repo });
});

describe('isInsideWorkTree', () => {
  it('is true at a repo root', async () => {
    expect(await isInsideWorkTree(repo)).toBe(true);
  });

  it('is true DEEP inside a repo — the case the old .git check missed', async () => {
    // Exactly the WP3 layout: <repo>/projects/<project>/runs/<run-id>/
    const deep = join(repo, 'projects', 'spring-gallery', 'runs', '2026-08-04-1233');
    await fs.mkdir(deep, { recursive: true });
    // There is no `.git` at this level — that is the whole point.
    await expect(fs.access(join(deep, '.git'))).rejects.toThrow();
    expect(await isInsideWorkTree(deep)).toBe(true);
  });

  it('is false for a standalone folder with no repo above it', async () => {
    expect(await isInsideWorkTree(plain)).toBe(false);
  });

  it('is false deep inside a standalone folder', async () => {
    const deep = join(plain, 'a', 'b', 'c');
    await fs.mkdir(deep, { recursive: true });
    expect(await isInsideWorkTree(deep)).toBe(false);
  });

  it('is false — not a throw — for a directory that does not exist', async () => {
    expect(await isInsideWorkTree(join(base, 'never-created'))).toBe(false);
  });

  it('does not leak the CALLER’s repo: a temp dir is judged on its own', async () => {
    // Running from inside the imagedrip repo must not make every path look
    // tracked; the check has to be scoped by cwd, not inherited.
    expect(await isInsideWorkTree(base)).toBe(false);
  });
});

describe('isInside', () => {
  it('is true for the directory itself and anything beneath it', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c/d')).toBe(true);
  });

  it('is false for a parent, a sibling, or a same-prefix neighbour', () => {
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/a/c')).toBe(false);
    // The string-prefix trap: /a/bb is NOT inside /a/b.
    expect(isInside('/a/b', '/a/bb')).toBe(false);
  });

  it('normalises traversal rather than trusting the literal path', () => {
    expect(isInside('/a/b', '/a/b/c/../d')).toBe(true);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
  });
});
