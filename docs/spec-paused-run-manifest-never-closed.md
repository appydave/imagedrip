---
doc: spec
project: imagedrip
status: OPEN — defect report. Symptom reproduced twice; MECHANISM NOT ESTABLISHED. Nothing built.
created: 2026-08-29
reported_by: Claude Code session "imagedrip-dev", found while fixing spec-stall-budget-visibility
---

# A run that was PAUSED when the app went away stays `outcome: 'open'` forever

## The defect

`quit-flush.ts` exists to stop exactly this. Its own header says so:

> *Every other terminal path already writes `outcome` … `runs.list` therefore cannot tell
> [a cut-off run from a finished one]*

It does not hold when the run was **paused** at the moment the app was terminated. The
manifest keeps `outcome: 'open'` and never gains a `finishedAt`, so the record says "we
never heard the end of this" about a run that is definitively over.

## Reproduced twice, on 2026-08-29, by two different sessions

| Run | Paused at | App went away | Manifest now |
|---|---|---|---|
| `2026-08-29-1146-agent-office-s06-plates` | 12:02:13 (stall, 575s) | 12:02:2x — `npm run dev:stop` by session "imagedrip-dev" | `outcome: 'open'`, no `finishedAt`, 1/4 |
| `2026-08-29-1425-agent-office-s06-plates` | 14:32:17 (stall, 390s) | ~14:44 — restart by another session | `outcome: 'open'`, no `finishedAt`, 0/1 |

The control: `2026-08-29-1354-…` was stopped **explicitly** via `run.stop` at 14:05 and
closed correctly — `outcome: 'stopped'`, `finishedAt` present. So the ordinary stop path
works. It is the quit path, with a paused run, that does not.

## Why it matters

Three runs of one project now read `open, open, stopped`. Two of those `open`s are dead.
Nothing in the record distinguishes them from a run in flight — which is the same
conflation `spec-stall-budget-visibility.md` Part 2 is about, arriving from the other
direction: that spec fixed *liveness at read time*, this is *the record being wrong forever*.

The `live` field added for that spec **mitigates but does not fix** this. A client can now
read `open` + no `live` as "not running", so "is it stuck?" is answerable today. But the
manifest is the durable artifact — it is what a run is reconstructed from later, and it is
still lying.

## What is NOT established

**The mechanism.** Both observations are of the symptom.

`BatchRunner.stop()` looks correct on inspection: it early-returns only on `this.stopped`,
and a paused runner has `stopped === false`, so it should reach `finishRun('stopped')`.
That points at `before-quit` never running rather than at the flush failing — but that was
not tested, and a plausible-looking read of the code is not evidence.

Two candidates, neither confirmed:

1. **`before-quit` does not fire on SIGTERM.** Nothing in `src/main/` installs a signal
   handler (`grep -rn 'SIGTERM\|process.on(' src/main/` finds only child-process kills), so
   the default action may terminate the process before any Electron quit hook runs. This
   would explain both observations and would mean the flush is fine and simply never called.
2. **The flush is called but does not complete.** `before-quit` `preventDefault()`s, awaits
   `flushRunOnQuit`, then re-quits; a manifest write that misses `QUIT_FLUSH_MS` would be
   lost. `flushRunOnQuit` returns `'timed-out'` in that case and it is logged — **no such
   warning appears in either day's log**, which argues against this one without ruling it out.

### A second, smaller finding on the same path

`scripts/dev-stop.mjs` prints:

```
✓ quit gracefully (control.json self-removed — before-quit ran)
```

and it printed exactly that on the 12:02 stop that lost an outcome. The inference is
`control.json` gone ⇒ `will-quit` ran ⇒ `before-quit` ran. That is a chain, not an
observation: `stopSync()` is not the only thing that unlinks the file — `control.stop()` on
the lifecycle path does too. So the script reports the graceful path as CONFIRMED on
evidence that only shows *some* cleanup happened.

This matters beyond tidiness: it is the reason the first loss went unnoticed. The operator
was told the graceful path ran, so nobody looked at the manifest. **A check that cannot
distinguish success from absence reported success.**

## Suggested direction (not a decision)

- Establish the mechanism first. The cheap experiment: launch, start a run, pause it,
  `kill -TERM` the pid, and look at whether `before-quit` logged anything at all. One run,
  and it separates candidate 1 from candidate 2 outright.
- If it is candidate 1, an explicit `process.on('SIGTERM', …)` that routes into the same
  quit sequence is the small fix, and `dev-stop.mjs`'s promise becomes true rather than
  hopeful.
- Either way, `dev-stop.mjs` should report what it OBSERVED (`control.json` was removed)
  rather than what it inferred (`before-quit` ran), or should verify the stronger claim
  directly — e.g. by reading back the manifest it says it protected.

## Not proposed

- No change to `RunOutcome`. `open` is the right word for "we never heard the end of this";
  the bug is that we DID hear the end and failed to write it down.
- No retroactive repair of the two manifests above. They are David's records of real runs
  and rewriting history to look tidy is worse than a record that is visibly incomplete.
