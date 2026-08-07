import { describe, it, expect, vi } from 'vitest';
import { flushRunOnQuit, type QuitFlushDeps } from '../src/main/quit-flush';

/**
 * A2 — the missing terminal path.
 *
 * Both runs on disk as of 2026-08-07 have no `outcome`, because the app was
 * quit while they were live and the manifest write died with the process. These
 * tests pin the three properties that fix it: the run is CLOSED before the wait,
 * the wait covers the write that closing just queued, and the wait is bounded so
 * a wedged disk cannot trap the user in an app that will not quit.
 */

/** A deps bundle whose defaults do nothing, with call order recorded. */
function deps(over: Partial<QuitFlushDeps> = {}): QuitFlushDeps & { order: string[] } {
  const order: string[] = [];
  return {
    order,
    stopRun: () => order.push('stop'),
    closeManualRun: () => order.push('closeManual'),
    pending: () => {
      order.push('pending');
      return Promise.resolve();
    },
    timeoutMs: 1000,
    delay: () => new Promise<void>(() => undefined), // never times out unless asked
    ...over,
  };
}

describe('flushRunOnQuit', () => {
  it('closes a live run BEFORE reading what is pending', async () => {
    // The ordering IS the fix: reading `pending` first would await the state of
    // the world one moment before the `outcome` write was queued.
    const d = deps();
    await expect(flushRunOnQuit(d)).resolves.toBe('flushed');
    expect(d.order).toEqual(['stop', 'closeManual', 'pending']);
  });

  it('waits for the write the close just queued', async () => {
    let landed = false;
    let release = (): void => undefined;
    const write = new Promise<void>((r) => {
      release = r;
    });

    const d = deps({
      // `stop()` queues the manifest write, exactly as `finishRun` does.
      stopRun: () => void write.then(() => (landed = true)),
      pending: () => write,
    });

    const flush = flushRunOnQuit(d);
    expect(landed).toBe(false); // still in flight — quitting now would lose it
    release();
    await expect(flush).resolves.toBe('flushed');
    expect(landed).toBe(true);
  });

  it('closes the dial-in record too — an idle open run is still an open run', async () => {
    // `stop()` early-returns when nothing is running, so a dial-in record left
    // open between injects would never be closed by it alone.
    const closeManualRun = vi.fn();
    await flushRunOnQuit(deps({ stopRun: () => undefined, closeManualRun }));
    expect(closeManualRun).toHaveBeenCalledOnce();
  });

  it('gives up after the timeout rather than trapping the user in the app', async () => {
    const d = deps({
      pending: () => new Promise<void>(() => undefined), // a write that never lands
      delay: () => Promise.resolve(),
    });
    await expect(flushRunOnQuit(d)).resolves.toBe('timed-out');
  });

  it('treats a FAILED write as finished — there is nothing left to wait for', async () => {
    const d = deps({ pending: () => Promise.reject(new Error('disk full')) });
    await expect(flushRunOnQuit(d)).resolves.toBe('flushed');
  });

  it('never lets a throwing closer abandon the other one, or the flush', async () => {
    const closeManualRun = vi.fn();
    const d = deps({
      stopRun: () => {
        throw new Error('runner exploded');
      },
      closeManualRun,
    });
    await expect(flushRunOnQuit(d)).resolves.toBe('flushed');
    expect(closeManualRun).toHaveBeenCalledOnce();
  });
});
