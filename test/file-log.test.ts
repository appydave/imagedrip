import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@appydave/core';
import { FileLog, formatLine, teeToFile } from '../src/main/file-log';

/**
 * v5 Phase 0.2. The logger wrote to stdout and nowhere else, so backgrounding
 * the dev server — or letting `dev:watch` restart it — destroyed every line of
 * the run that just failed. "Unattended" means nobody was watching, so the file
 * is the only account there is.
 */

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'imagedrip-log-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => () => new Date(iso);
/**
 * A real pino logger, at its real level — `silent` would make `isLevelEnabled`
 * false for everything and the mirror assertions vacuously pass. The cost is a
 * few JSON lines on the test run's stdout, which is the point of the thing.
 */
const base = () => createLogger({ name: 'file-log-test' });

describe('FileLog', () => {
  it('writes lines into a day-named file under the directory it was given', () => {
    const f = new FileLog({ dir: join(dir, 'logs'), now: at('2026-08-09T10:00:00.000Z') });
    f.open();
    f.write('hello');
    f.write('world');
    f.close();

    const path = join(dir, 'logs', 'imagedrip-2026-08-09.log');
    expect(readFileSync(path, 'utf8')).toBe('hello\nworld\n');
  });

  it('appends to an existing day-file instead of truncating it', () => {
    // A dev:watch restart re-opens the same file minutes later. Truncating it
    // would destroy the evidence of the run that caused the restart.
    const opts = { dir: join(dir, 'logs'), now: at('2026-08-09T10:00:00.000Z') };
    const first = new FileLog(opts);
    first.open();
    first.write('before the restart');
    first.close();

    const second = new FileLog(opts);
    second.open();
    second.write('after the restart');
    second.close();

    const path = join(dir, 'logs', 'imagedrip-2026-08-09.log');
    expect(readFileSync(path, 'utf8')).toBe('before the restart\nafter the restart\n');
  });

  it('rolls to a single sibling once the cap is passed, keeping the newest lines live', () => {
    const f = new FileLog({
      dir,
      maxBytes: 20,
      now: at('2026-08-09T10:00:00.000Z'),
    });
    f.open();
    f.write('aaaaaaaaaaaaaaaaaaaaaaaaa'); // > 20 bytes, so the NEXT write rolls
    f.write('after the roll');
    f.close();

    expect(readFileSync(join(dir, 'imagedrip-2026-08-09.1.log'), 'utf8')).toMatch(/^a+\n$/);
    expect(readFileSync(join(dir, 'imagedrip-2026-08-09.log'), 'utf8')).toBe('after the roll\n');
  });

  it('prunes day-files older than the retention window, and touches nothing else', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'imagedrip-2026-07-01.log'), 'ancient');
    writeFileSync(join(dir, 'imagedrip-2026-08-08.log'), 'yesterday');
    writeFileSync(join(dir, 'notes.txt'), 'not mine');

    const f = new FileLog({ dir, keepDays: 7, now: at('2026-08-09T10:00:00.000Z') });
    f.open();
    f.close();

    const names = readdirSync(dir).sort();
    expect(names).toContain('imagedrip-2026-08-08.log'); // inside the window
    expect(names).toContain('notes.txt'); // never ours to delete
    expect(names).not.toContain('imagedrip-2026-07-01.log');
  });

  it('rolls over to a new file when the clock crosses midnight mid-session', () => {
    let clock = new Date('2026-08-09T23:59:59.000Z');
    const f = new FileLog({ dir, now: () => clock });
    f.open();
    f.write('late');
    clock = new Date('2026-08-10T00:00:01.000Z');
    f.write('early');
    f.close();

    expect(readFileSync(join(dir, 'imagedrip-2026-08-09.log'), 'utf8')).toBe('late\n');
    expect(readFileSync(join(dir, 'imagedrip-2026-08-10.log'), 'utf8')).toBe('early\n');
  });

  it('reports its own failure once and then goes inert — it never throws', () => {
    // A FILE where the log directory should be: mkdir fails, and so does
    // everything after it. The app must survive; the user must be told.
    const blocked = join(dir, 'blocked');
    writeFileSync(blocked, 'i am not a directory');
    const errors: string[] = [];
    const f = new FileLog({ dir: blocked, onError: (m) => errors.push(m) });

    expect(() => {
      f.open();
      f.write('one');
      f.write('two');
      f.close();
    }).not.toThrow();

    expect(errors).toHaveLength(1); // once, not once per line
    expect(errors[0]).toMatch(/file log disabled/);
    expect(errors[0]).toMatch(/stdout only/); // says what you have LEFT
  });
});

describe('formatLine', () => {
  it('renders a level, a message and its fields on one greppable line', () => {
    const line = formatLine(new Date('2026-08-09T10:00:00.000Z'), 'info', 'harvested', {
      subject: 'kangaroo',
    });
    expect(line).toBe('2026-08-09T10:00:00.000Z INFO  harvested {"subject":"kangaroo"}');
  });

  it('survives an unserialisable field rather than losing the line', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const line = formatLine(new Date('2026-08-09T10:00:00.000Z'), 'warn', 'odd', circular);
    expect(line).toMatch(/WARN {2}odd/);
  });
});

describe('teeToFile', () => {
  it('writes nothing until attach() names a directory', () => {
    const tee = teeToFile(base());
    tee.logger.info('before attach');
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('mirrors every level, message and field into the file', () => {
    const tee = teeToFile(base(), {
      now: at('2026-08-09T10:00:00.000Z'),
    });
    tee.attach(dir);
    tee.logger.info({ harvested: 3 }, 'batch run complete');
    tee.logger.warn('stall — pausing');
    tee.logger.error(new Error('feed failed'));
    tee.close();

    const body = readFileSync(join(dir, 'imagedrip-2026-08-09.log'), 'utf8');
    expect(body).toMatch(/INFO {2}batch run complete \{"harvested":3\}/);
    expect(body).toMatch(/WARN {2}stall — pausing/);
    expect(body).toMatch(/ERROR feed failed \{"err":"feed failed"/);
  });

  it('carries child-logger bindings onto every line', () => {
    const tee = teeToFile(base(), {
      now: at('2026-08-09T10:00:00.000Z'),
    });
    tee.attach(dir);
    tee.logger.child({ component: 'runner' }).info('fed');
    tee.close();

    expect(readFileSync(join(dir, 'imagedrip-2026-08-09.log'), 'utf8')).toMatch(
      /INFO {2}fed \{"component":"runner"\}/,
    );
  });

  it('still behaves as the underlying logger for callers that are not logging', () => {
    // The wrapper is a drop-in: anything reading `level`, or calling a pino
    // method the tee does not intercept, must get the real behaviour.
    const tee = teeToFile(createLogger({ name: 'test', level: 'warn' }));
    expect(tee.logger.level).toBe('warn');
    expect(tee.logger.isLevelEnabled('info')).toBe(false);
  });

  it('does not mirror lines the console itself would drop', () => {
    const tee = teeToFile(createLogger({ name: 'test', level: 'warn' }), {
      now: at('2026-08-09T10:00:00.000Z'),
    });
    tee.attach(dir);
    tee.logger.info('below the level');
    tee.logger.warn('at the level');
    tee.close();

    const body = readFileSync(join(dir, 'imagedrip-2026-08-09.log'), 'utf8');
    expect(body).not.toMatch(/below the level/);
    expect(body).toMatch(/at the level/);
  });
});
