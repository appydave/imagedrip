import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface SpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type ProcessStatus = 'running' | 'exited' | 'error';
export interface LogChunk {
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface ManagedProcess {
  readonly id: string;
  readonly pid: number | undefined;
  readonly status: ProcessStatus;
  onLog(cb: (chunk: LogChunk) => void): () => void;
  onExit(cb: (code: number | null) => void): () => void;
  stop(signal?: NodeJS.Signals): void;
}

/**
 * ProcessSupervisor — spawn, monitor, and stream logs from local child
 * processes. The "GUI drives a local process" capability at the heart of an
 * operator console (borrowed pattern from eve-studio's agent manager).
 */
export class ProcessSupervisor {
  private procs = new Map<string, Managed>();

  spawn(options: SpawnOptions): ManagedProcess {
    const managed = new Managed(options);
    this.procs.set(managed.id, managed);
    managed.onExit(() => this.procs.delete(managed.id));
    return managed;
  }

  get(id: string): ManagedProcess | undefined {
    return this.procs.get(id);
  }

  all(): ManagedProcess[] {
    return [...this.procs.values()];
  }

  stopAll(signal?: NodeJS.Signals): void {
    for (const proc of this.procs.values()) proc.stop(signal);
  }
}

class Managed implements ManagedProcess {
  readonly id = randomUUID();
  private child: ChildProcess;
  private _status: ProcessStatus = 'running';
  private logCbs = new Set<(chunk: LogChunk) => void>();
  private exitCbs = new Set<(code: number | null) => void>();

  constructor(options: SpawnOptions) {
    this.child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (b: Buffer) => this.emitLog('stdout', b.toString()));
    this.child.stderr?.on('data', (b: Buffer) => this.emitLog('stderr', b.toString()));
    this.child.on('error', () => {
      this._status = 'error';
    });
    this.child.on('exit', (code) => {
      this._status = 'exited';
      for (const cb of this.exitCbs) cb(code);
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get status(): ProcessStatus {
    return this._status;
  }

  private emitLog(stream: 'stdout' | 'stderr', data: string): void {
    for (const cb of this.logCbs) cb({ stream, data });
  }

  onLog(cb: (chunk: LogChunk) => void): () => void {
    this.logCbs.add(cb);
    return () => this.logCbs.delete(cb);
  }

  onExit(cb: (code: number | null) => void): () => void {
    this.exitCbs.add(cb);
    return () => this.exitCbs.delete(cb);
  }

  stop(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.child.kill(signal);
  }
}
