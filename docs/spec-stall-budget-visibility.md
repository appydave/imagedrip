---
doc: spec
project: imagedrip
status: SHIPPED 2026-08-29 in `c2c2624` — batch-runner, index, run-manifest, App.tsx, ipc,
  and `test/stall-visibility.test.ts`. Kept as the rationale for why the field exists.
created: 2026-08-29
reported_by: Claude Code session "break-room", watching a live run
---

# Show the stall budget burning down while awaiting an image

## The problem, in the operator's words

> *"I think it is when things work and then stop, now I don't know if it is a situation of
> lacking patience but right now I have 2 images and it looks stuck and I don't know if it
> is stuck or if it is waiting."* — David, 2026-08-29, mid-run

**A healthy 5-minute generation and a dead one look identical on screen.** The status bar
reads `awaiting image: [s01-02-mid-furniture]` and nothing changes for five and a half
minutes. There is no way to tell, by looking, whether the app is patiently waiting or has
silently lost the thread.

The app already knows the answer. It is not on screen.

## The asymmetry that makes this obvious

`src/renderer/src/App.tsx:148-157` handles two waits, and gives the **cheap** one a live
countdown while the **expensive** one gets nothing:

```ts
phase === 'awaiting'
  ? `awaiting image: ${status?.currentSubject ?? ''}`      // 5.5 min, NO countdown
  : phase === 'waiting'
    ? `next in ${Math.round((status?.nextFeedInMs ?? 0) / 1000)}s`   // ~11s, HAS countdown
```

The inter-image pause is roughly 11 seconds and shows a ticking `next in Ns`. The
generation wait — measured at **328.9s** on the run that prompted this — shows a static
string. The pattern for solving this is already in the file, one branch away.

## What already exists

Nearly everything:

| Piece | Where |
|---|---|
| The budget is derived, not guessed | `src/main/stall-budget.ts` — from the SLOWEST observation × 1.3 |
| It re-derives after each image | `batch-runner.ts:530` |
| `stallMs` is in `RunStatus` | `src/shared/ipc.ts:396` |
| **The total is already rendered** | `App.tsx:684` — `stall budget: <secs>` |
| The harness tracks how long it has waited | `webview-harness.ts:507` — `const waited = …` |

So the operator can already see *"the cap is 575s"*. What they cannot see is **how far
through that cap the current image is** — which is the only part that answers "stuck or
waiting?".

## What is missing

`RunStatus` carries `nextFeedInMs` — *"When `waiting`, ms until the next feed (for a live
countdown)"* — but has **no equivalent for the awaiting phase**. There is no
`awaitingForMs`, no `stallRemainingMs`, and `at` alone is not enough for the renderer to
compute one, because it does not know when the current await began.

## Proposal

**1. Add one field to `RunStatus`** (`src/shared/ipc.ts`), mirroring `nextFeedInMs` in both
shape and comment style:

```ts
/** When `awaiting`, ms remaining before the stall cap fires (for a live countdown). */
stallRemainingMs: number | null;
```

Sourced where the harness already tracks `waited` (`webview-harness.ts:507`), as
`stallMs - waited`, clamped at 0.

**2. Render it in the awaiting branch** (`App.tsx:154`):

```
awaiting image: [s01-02-mid-furniture] · 4m52s of 9m36s
```

Exact wording is the implementer's call. What matters is that **elapsed and cap are both
visible and one of them moves.**

## Why a countdown and not a spinner

A spinner says "something is happening". It says the same thing when nothing is happening,
so it cannot answer the operator's question. **A number that moves toward a known limit
distinguishes waiting from stuck; an animation does not.**

This matters more than usual here because the cap is *derived* and changes run to run — it
was 575s on the run that prompted this, and will differ on the next. The operator cannot
hold it in their head, so it has to be on screen next to the elapsed time, not just in the
panel below.

## Second-order cost this already caused

On the run that prompted this spec, an agent (me) estimated ~100s/image from a code comment
in `cadence.ts` rather than from measurement. The real rate was 328.9s. The operator judged
"stuck" against the wrong number and reasonably concluded the app had failed.

**A visible budget makes the operator independent of anyone's estimate**, including a
confidently wrong one. That is worth more than the pixels it costs.

## Suggested acceptance

During a live run, while an image is generating:

1. The status line shows elapsed time and the stall cap together.
2. The elapsed value visibly advances without operator interaction.
3. When a generation legitimately runs long, the operator can see it is inside budget —
   and when it exceeds the cap, they can see that too, before the app declares the stall.
4. The existing `stall budget: <secs>` display at `App.tsx:684` continues to work; this
   adds the in-flight view, it does not replace the summary.

## Not proposed

- No change to how the budget is derived. `stall-budget.ts` is well-reasoned, carries its
  evidence, and has already been wrong-then-fixed twice. Leave it alone.
- No alert, no auto-stop, no notification. The operator is watching; they need information,
  not intervention.

---

# Part 2 — the same blindness exists over the API

Added 2026-08-29 on David's question: *"can you read those values from the api because you
could have told me instead of looking"*

**No — and that is the second half of this defect.**

`RunStatus` (`src/shared/ipc.ts:380-408`) carries everything needed: `phase`,
`currentSubject`, `stallMs`, `avgMs`, `timings`, `nextFeedInMs`. **None of it is published
as a control-surface verb.** It is IPC-only, so the renderer can see it and nothing else can.

What an agent gets instead is `runs.list`, which returns `{runId, outcome, harvested, total,
mode, startedAt}`. On the run that prompted this spec, at a moment when the runner had
already logged `WARN stall — pausing`, `runs.list` still reported:

```
1/4  outcome=open
```

**A paused run and a healthy run are indistinguishable over the API.** An agent watching a
run cannot tell the operator what is happening, and had to read
`~/Library/Application Support/imagedrip/logs/imagedrip-YYYY-MM-DD.log` to find out — which
is not an interface, it is archaeology.

## Proposal — publish `run.status`

```
run.status  ->  RunStatus     read-only, ungated
```

Return the existing `RunStatus` unchanged. No new computation; the object is already built
and pushed to the renderer every tick.

With it, an agent watching a run can report *"awaiting image, 4m52s of 9m36s"* or *"paused
on a stall"* without reading a log file — which is what the operator asked for, and what
`runs.list` alone cannot support.

**Also add `outcome: 'paused'`** (or an explicit `paused: boolean`) to the `runs.list` row.
`outcome: open` covering both running and paused is the same conflation this whole spec is
about: two states that need different operator responses, rendered identically.

## Why both halves matter

The UI half serves the operator watching the window. The API half serves an agent watching
on their behalf — and the agent is often the one who notices first, because it can poll.
Fixing only the UI leaves every agent driving ImageDrip unable to answer "is it stuck?"
except by tailing a log.

## Scope note

Independent of `spec-control-surface-ui-staleness.md` and `spec-single-image-run.md`.
Touches `RunStatus` and one renderer branch. It does not depend on any `rulings-open.md`
decision.
