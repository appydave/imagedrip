/**
 * quit-flush (A2) — close the open run record before the process dies.
 *
 * Every other terminal path already writes `outcome`: STOP calls
 * `finishRun('stopped')`, a completed queue and a project switch call
 * `finishRun('complete')`. The one path that did not was **quitting the app
 * while a run was live** — and it is the path that produced both runs currently
 * on disk, neither of which has an `outcome`. `runs.list` therefore cannot tell
 * "this run is still going" from "this run died with the app", which is the
 * whole reason the field exists.
 *
 * Two things make that write actually land, and both live here rather than in
 * `BatchRunner`:
 *
 *  1. **Order.** `stop()` first — a LIVE run ends as `stopped`, which is the
 *     truth: it was cut off. Then `closeManualRun()` — an idle-but-open dial-in
 *     record ends as `complete`, matching what a project switch already does to
 *     the same record. `stop()` clears the dial-in id when it runs, so the
 *     second call is a no-op in the live case rather than a double close.
 *
 *  2. **`pending` is a THUNK, not a promise.** It is read only after both calls,
 *     so the writes those calls just queued are inside the wait. Reading it
 *     first would await the state of the world one moment before the write that
 *     matters — the exact shape of the bug being fixed.
 *
 * The wait is BOUNDED. A quit that hangs on a wedged disk is a worse failure
 * than a missing `outcome`: the user cannot even close the app, and force-quit
 * loses the write anyway. Nothing here throws — a quit must never be blocked by
 * the bookkeeping it is trying to finish.
 */

export interface QuitFlushDeps {
  /** Halt a live run. Closes its record with `outcome: 'stopped'`. */
  stopRun: () => void;
  /** Close an open dial-in record with `outcome: 'complete'`. */
  closeManualRun: () => void;
  /**
   * Resolves once every recorder write asked for SO FAR has landed. Called
   * after the two closers above, so their writes are included — see (2).
   */
  pending: () => Promise<void>;
  /** Upper bound on the wait, in ms. */
  timeoutMs: number;
  /** Injected so the bound is testable without a real timer. */
  delay?: (ms: number) => Promise<void>;
}

export type QuitFlushOutcome = 'flushed' | 'timed-out';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Never hold the process open just to time out a shutdown.
    t.unref?.();
  });
}

export async function flushRunOnQuit(deps: QuitFlushDeps): Promise<QuitFlushOutcome> {
  // A closer that throws must not abandon the other one, or the flush.
  for (const close of [deps.stopRun, deps.closeManualRun]) {
    try {
      close();
    } catch {
      // Nothing useful to do while quitting — the bounded wait below still runs.
    }
  }

  const settled = deps
    .pending()
    .then<QuitFlushOutcome>(() => 'flushed')
    // A failed write is still a finished one: there is nothing left to wait for.
    .catch<QuitFlushOutcome>(() => 'flushed');

  const expired = (deps.delay ?? sleep)(deps.timeoutMs).then<QuitFlushOutcome>(() => 'timed-out');
  return Promise.race([settled, expired]);
}
