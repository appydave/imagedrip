import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeCapabilities, missingContainment } from '../src/main/claude-cli';

/**
 * The capability probe reads the WHOLE help, or it reads nothing.
 *
 * ── Why this test exists (2026-08-08, found by running the real app) ──
 *
 * `claude -p --help` writes ~15 KB and exits immediately. A child's unflushed
 * pipe data dies with it, and macOS starts a pipe at an 8 KB buffer — so a
 * parent that does not drain fast enough silently receives a FRAGMENT. Plain
 * Node usually drains in time; Electron's main process, busy at startup, does
 * not. It saw 45 of 65 flags. `--verbose` sat past the cut, so the pane refused
 * to open and told the user their CLI could not be contained.
 *
 * The defect worth pinning is not the truncation. It is that **a short read is
 * indistinguishable from a genuinely absent flag** — the caller gets the same
 * empty answer for "your CLI is too old" and "we only read half the page", and
 * believes the first. That is this repo's own cardinal sin, and every test here
 * is a variation on it.
 *
 * ⚠️ **What these tests do NOT establish.** They do not reproduce the bug.
 * The truncation only happens under ELECTRON's main process — plain Node drains
 * the pipe fast enough, even with the event loop deliberately blocked for
 * 400ms right after the spawn, so the old pipe-based implementation passes
 * every test in this file. A test that is green before and after a fix guards
 * nothing, and saying otherwise here would be the same species of false
 * confidence the bug itself was.
 *
 * What they DO pin is the contract the fix has to keep: a complete read, the
 * same answer every time, an empty set (never a partial one) when the binary is
 * missing, and no invented flags. The fix itself was verified where it
 * actually breaks — see
 * `docs/kdd/learnings/a-truncated-probe-reads-as-an-absent-flag.md`, which
 * carries the Electron reproduction and its before/after numbers.
 */

let dir: string;

/** Write an executable stand-in CLI that prints `body` and leaves at once. */
function fakeCli(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env node',
      `process.stdout.write(${JSON.stringify(body)});`,
      // The whole point: exit before the write has drained. Against a pipe this
      // is what loses everything past the buffer.
      'process.exit(0);',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

/** Help text where the interesting flags sit far past any 8 KB boundary. */
function bigHelp(): string {
  const filler = Array.from(
    { length: 500 },
    (_, i) => `  --filler-${i}    description padding to push the real flags down the page`,
  ).join('\n');
  return [
    'Usage: claude [options]',
    '  --input-format <fmt>    input format',
    filler,
    '  --output-format <fmt>   output format',
    '  --verbose               override verbose mode',
    '  --allowed-tools <t>     allow',
    '  --disallowed-tools <t>  deny',
    '',
  ].join('\n');
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'imagedrip-probetest-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('probeCapabilities', () => {
  it('reads flags that sit past the 8 KB pipe boundary', async () => {
    const help = bigHelp();
    // The fixture is only meaningful if it actually crosses the boundary.
    expect(help.indexOf('--verbose')).toBeGreaterThan(8192);
    const caps = await probeCapabilities(fakeCli('big-help', help));

    // The four that matter are all beyond byte 8192 in this fixture.
    expect(caps.has('--verbose')).toBe(true);
    expect(caps.has('--output-format')).toBe(true);
    expect(caps.has('--allowed-tools')).toBe(true);
    expect(caps.has('--disallowed-tools')).toBe(true);
    expect(missingContainment(caps)).toEqual([]);
  });

  it('is deterministic — a race would show up as a flaky flag set', async () => {
    const bin = fakeCli('repeat-help', bigHelp());
    const sizes = new Set<number>();
    for (let i = 0; i < 5; i++) sizes.add((await probeCapabilities(bin)).size);
    // Truncation is a RACE, so its tell is variance between identical runs.
    expect(sizes.size).toBe(1);
  });

  it('returns an empty set when the CLI does not exist — never a partial guess', async () => {
    const caps = await probeCapabilities(join(dir, 'no-such-binary'));
    expect(caps.size).toBe(0);
    // And an empty probe refuses the spawn, rather than degrading to full tools.
    expect(missingContainment(caps).length).toBeGreaterThan(0);
  });

  it('reports only what the help actually contains', async () => {
    // The other direction: the probe must not invent flags an old CLI lacks.
    const caps = await probeCapabilities(
      fakeCli('old-cli', 'Usage: claude\n  --input-format <fmt>\n  --output-format <fmt>\n'),
    );
    expect(caps.has('--input-format')).toBe(true);
    expect(caps.has('--disallowed-tools')).toBe(false);
    expect(missingContainment(caps)).toContain('--disallowed-tools');
  });
});
