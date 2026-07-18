import { describe, it, expect } from 'vitest';
import { ProcessSupervisor } from '../src/main/process-supervisor';

describe('ProcessSupervisor', () => {
  it('spawns a process, captures stdout, and reports a clean exit', async () => {
    const sup = new ProcessSupervisor();
    const out: string[] = [];
    const proc = sup.spawn({
      command: process.execPath,
      args: ['-e', "process.stdout.write('hi')"],
    });
    proc.onLog((c) => {
      if (c.stream === 'stdout') out.push(c.data);
    });
    const code = await new Promise<number | null>((res) => proc.onExit(res));
    expect(code).toBe(0);
    expect(out.join('')).toContain('hi');
    expect(sup.all()).toHaveLength(0); // removed from the registry on exit
  });

  it('reports non-zero exit codes', async () => {
    const sup = new ProcessSupervisor();
    const proc = sup.spawn({ command: process.execPath, args: ['-e', 'process.exit(3)'] });
    const code = await new Promise<number | null>((res) => proc.onExit(res));
    expect(code).toBe(3);
  });

  it('stop() terminates a long-running process', async () => {
    const sup = new ProcessSupervisor();
    const proc = sup.spawn({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    });
    const exit = new Promise<number | null>((res) => proc.onExit(res));
    proc.stop();
    await exit;
    expect(proc.status).toBe('exited');
  });
});
