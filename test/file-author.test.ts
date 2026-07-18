import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAuthor } from '../src/main/file-author';

const exec = promisify(execFile);

describe('FileAuthor', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'appytron-fileauthor-'));
    await exec('git', ['init', '-q'], { cwd: root });
    await exec('git', ['config', 'user.email', 'test@appytron.dev'], { cwd: root });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: root });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a file inside root and commits it', async () => {
    const author = new FileAuthor({ root });
    const res = await author.write('a/b.txt', 'hello', 'add b');
    expect(res.path).toBe('a/b.txt');
    expect(res.committed).toBe(true);
    expect(res.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await fs.readFile(join(root, 'a/b.txt'), 'utf8')).toBe('hello');
  });

  it('refuses to write outside root (path safety)', async () => {
    const author = new FileAuthor({ root });
    await expect(author.write('../escape.txt', 'x')).rejects.toThrow(/escapes root/);
    await expect(author.write('/etc/passwd', 'x')).rejects.toThrow(/escapes root/);
    await expect(author.write('a/../../escape.txt', 'x')).rejects.toThrow(/escapes root/);
  });

  it('deletes a file and commits the removal', async () => {
    const author = new FileAuthor({ root });
    await author.write('gone.txt', 'bye');
    const res = await author.delete('gone.txt');
    expect(res.committed).toBe(true);
    await expect(fs.access(join(root, 'gone.txt'))).rejects.toThrow();
  });

  it('writes binary content (Uint8Array) — e.g. a harvested image', async () => {
    const author = new FileAuthor({ root });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const res = await author.write('img/x.png', bytes, 'add png');
    expect(res.committed).toBe(true);
    const read = await fs.readFile(join(root, 'img/x.png'));
    expect(read.equals(Buffer.from(bytes))).toBe(true);
  });

  it('writes without committing when git is disabled', async () => {
    const author = new FileAuthor({ root, git: false });
    const res = await author.write('nogit.txt', 'x');
    expect(res.committed).toBe(false);
    expect(await fs.readFile(join(root, 'nogit.txt'), 'utf8')).toBe('x');
  });
});
