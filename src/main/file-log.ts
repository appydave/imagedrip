import { closeSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@appydave/core';

/**
 * file-log (v5 Phase 0.2) — a forensic trail that survives the terminal.
 *
 * Until now the logger wrote to stdout and nowhere else (`create-console.ts`).
 * Background the dev server, or let `dev:watch` restart it, and every line of
 * the run that just failed is gone. "Unattended" means you were not watching,
 * so the ONLY account of what happened is the one written to disk — which is
 * why this is Phase 0 debt and not a nicety.
 *
 * Three deliberate choices:
 *
 * - **`writeSync` on a held fd, not a write stream.** A stream buffers, and the
 *   failure this exists to explain is exactly the one that kills the process
 *   before a buffer flushes. Each line is at the OS by the time the call
 *   returns. The volume is a few hundred lines per run; the cost is noise.
 * - **Human-readable, not JSON.** A person reads this after something went
 *   wrong, usually through `tail`. pino's JSON still goes to stdout unchanged.
 * - **It never throws.** A logger that can break the app it is reporting on is
 *   worse than no logger — but it does not fail SILENTLY either: the first
 *   failure is reported once through the underlying logger, on stdout.
 */
export interface FileLogOptions {
  /** Directory to write into — created if missing. Normally `<userData>/logs`. */
  dir: string;
  /** Roll the current file once it passes this size. Default 5 MB. */
  maxBytes?: number;
  /** Delete day-files older than this. Default 7. */
  keepDays?: number;
  /** Clock seam — tests pin the date rather than waiting for midnight. */
  now?: () => Date;
  /** Where to report a failure of the log itself (stdout, via the real logger). */
  onError?: (message: string) => void;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_KEEP_DAYS = 7;
const PREFIX = 'imagedrip-';
/** `imagedrip-2026-08-09.log` and its one rolled sibling `…-2026-08-09.1.log`. */
const FILE_RE = /^imagedrip-(\d{4}-\d{2}-\d{2})(\.1)?\.log$/;

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class FileLog {
  private readonly dir: string;
  private readonly maxBytes: number;
  private readonly keepDays: number;
  private readonly now: () => Date;
  private readonly onError?: (message: string) => void;

  private fd: number | null = null;
  private day = '';
  private bytes = 0;
  /** Set after the first failure — report once, then stay quiet and inert. */
  private broken = false;

  constructor(options: FileLogOptions) {
    this.dir = options.dir;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.keepDays = options.keepDays ?? DEFAULT_KEEP_DAYS;
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError;
  }

  /** Absolute path of the file currently being appended to ('' before open). */
  get path(): string {
    return this.day ? join(this.dir, `${PREFIX}${this.day}.log`) : '';
  }

  /** Open today's file and prune expired ones. Safe to call more than once. */
  open(): void {
    if (this.broken || this.fd !== null) return;
    try {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      this.prune();
      this.openDay(dayOf(this.now()));
    } catch (err) {
      this.fail(err);
    }
  }

  /** Append one already-formatted line. Never throws. */
  write(line: string): void {
    if (this.broken) return;
    try {
      const today = dayOf(this.now());
      if (this.fd === null || today !== this.day) {
        // First write, or the clock crossed midnight mid-session.
        if (this.fd !== null) this.closeFd();
        this.prune();
        this.openDay(today);
      } else if (this.bytes >= this.maxBytes) {
        this.roll();
      }
      const buf = Buffer.from(`${line}\n`, 'utf8');
      writeSync(this.fd as number, buf);
      this.bytes += buf.byteLength;
    } catch (err) {
      this.fail(err);
    }
  }

  close(): void {
    if (this.fd === null) return;
    try {
      this.closeFd();
    } catch {
      // Closing is best-effort — the lines are already at the OS.
    }
  }

  private openDay(day: string): void {
    this.day = day;
    const path = join(this.dir, `${PREFIX}${day}.log`);
    this.fd = openSync(path, 'a', 0o600);
    try {
      this.bytes = statSync(path).size;
    } catch {
      this.bytes = 0;
    }
  }

  /**
   * Size cap: keep ONE rolled sibling per day and overwrite it. A run's tail is
   * what gets read; unbounded history in `userData` is not worth the disk.
   */
  private roll(): void {
    const current = join(this.dir, `${PREFIX}${this.day}.log`);
    const rolled = join(this.dir, `${PREFIX}${this.day}.1.log`);
    this.closeFd();
    try {
      unlinkSync(rolled);
    } catch {
      // No previous roll — expected on the first one.
    }
    renameSync(current, rolled);
    this.openDay(this.day);
  }

  private prune(): void {
    const cutoff = dayOf(new Date(this.now().getTime() - this.keepDays * 86_400_000));
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return; // The directory is about to be created — nothing to prune.
    }
    for (const name of names) {
      const m = FILE_RE.exec(name);
      // A lexical compare is a date compare for ISO days, and only files this
      // class named are ever touched — never anything else in the directory.
      if (m && m[1] < cutoff) {
        try {
          unlinkSync(join(this.dir, name));
        } catch {
          // Locked or already gone — pruning must not stop logging.
        }
      }
    }
  }

  private closeFd(): void {
    if (this.fd === null) return;
    const fd = this.fd;
    this.fd = null;
    closeSync(fd);
  }

  /** Report the first failure loudly, then go inert. Never fails silently. */
  private fail(err: unknown): void {
    this.broken = true;
    try {
      this.closeFd();
    } catch {
      // Already unusable.
    }
    this.onError?.(
      `file log disabled — ${String(err)}. Logging continues on stdout only, ` +
        `so a crash from here on leaves no trail in ${this.dir}.`,
    );
  }
}

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
type Level = (typeof LEVELS)[number];

export interface LoggerTee {
  /** Drop-in replacement for the logger — same object shape, writes to both. */
  logger: Logger;
  /** Start writing to `<dir>`. Called AFTER any `APPYTRON_HOME` redirect. */
  attach(dir: string): void;
  close(): void;
}

/**
 * Return a logger that behaves exactly like `base` and also appends every
 * record to a file, once `attach()` names the directory.
 *
 * Why a wrapper rather than a second pino stream: pino writes to fd 1 through
 * SonicBoom, so it does NOT pass through `process.stdout.write` — patching
 * stdout would have captured nothing. Adding a `multistream` would mean
 * building the logger here instead of through `@appydave/core`'s factory,
 * forking the one place every AppyTron app configures logging. Wrapping the
 * object costs a Proxy and leaves both of those alone.
 *
 * The trade is honest and worth stating: this captures calls made through the
 * app's logger, which is every lifecycle line in `main` — not arbitrary
 * `console.log` or output from child processes.
 */
export function teeToFile(
  base: Logger,
  options: Omit<Partial<FileLogOptions>, 'dir' | 'onError'> = {},
): LoggerTee {
  let sink: FileLog | null = null;

  const emit = (level: Level, bindings: Record<string, unknown>, args: unknown[]): void => {
    if (!sink) return;
    const { msg, fields } = splitArgs(args);
    const all = { ...bindings, ...fields };
    sink.write(formatLine(new Date(), level, msg, all));
  };

  const wrap = (target: Logger, bindings: Record<string, unknown>): Logger =>
    new Proxy(target, {
      get(t, prop) {
        if (typeof prop === 'string' && (LEVELS as readonly string[]).includes(prop)) {
          const level = prop as Level;
          return (...args: unknown[]): void => {
            (t as unknown as Record<string, (...a: unknown[]) => void>)[level](...args);
            // Mirror the console's own level filter — a file that shows MORE
            // than stdout invites "why isn't this in the log?" the other way.
            if (t.isLevelEnabled?.(level) ?? true) emit(level, bindings, args);
          };
        }
        if (prop === 'child') {
          return (b: Record<string, unknown>, ...rest: unknown[]): Logger =>
            wrap(
              (t as unknown as { child: (...a: unknown[]) => Logger }).child(b, ...rest),
              { ...bindings, ...b },
            );
        }
        const value = Reflect.get(t, prop, t) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(t) : value;
      },
    }) as Logger;

  return {
    logger: wrap(base, {}),
    attach(dir: string) {
      if (sink) return;
      sink = new FileLog({
        ...options,
        dir,
        // Reported on the ORIGINAL logger: the wrapper's file half is the thing
        // that just failed, so routing this through it could vanish.
        onError: (message) => base.error({ dir }, message),
      });
      sink.open();
      base.info({ file: sink.path }, 'log file opened');
    },
    close() {
      sink?.close();
      sink = null;
    },
  };
}

/**
 * Pino accepts `info(msg)`, `info(obj, msg)`, `info(obj)` and `info(err, msg)`.
 * Normalise all four into a message plus fields.
 */
function splitArgs(args: unknown[]): { msg: string; fields?: Record<string, unknown> } {
  const [first, second] = args;
  if (first instanceof Error) {
    return {
      msg: typeof second === 'string' ? second : first.message,
      fields: { err: first.message, ...(first.stack ? { stack: first.stack } : {}) },
    };
  }
  if (first !== null && typeof first === 'object') {
    return {
      msg: typeof second === 'string' ? second : '',
      fields: first as Record<string, unknown>,
    };
  }
  return { msg: typeof first === 'string' ? first : String(first ?? '') };
}

/** Format one record the way a person reads it with `tail`. */
export function formatLine(
  at: Date,
  level: string,
  msg: string,
  fields?: Record<string, unknown>,
): string {
  const head = `${at.toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (!fields || Object.keys(fields).length === 0) return head;
  let tail: string;
  try {
    tail = JSON.stringify(fields);
  } catch {
    tail = String(fields); // circular or otherwise unserialisable — say something
  }
  return `${head} ${tail}`;
}
