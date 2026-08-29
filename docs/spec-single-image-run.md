---
doc: spec
project: imagedrip
status: OPEN — exposure gap. The capability EXISTS; it is not published.
created: 2026-08-29
reported_by: Claude Code session "break-room", driving the control surface over HTTP
depends_on: docs/rulings-open.md R1 (see "Model dependency")
---

# Single-image run over the control surface

## Verification first — which case is this?

The premise was checked before any spec was written. Three cases were possible; this is the
first, and the spec is correspondingly small.

> **CASE 1 — EXPOSURE GAP. Dial-in exists, does exactly what is wanted, and is not
> reachable from the control surface.**

Evidence:

| Fact | Where |
|---|---|
| Dial-in is a real mode, not a pacing setting | `src/main/batch-runner.ts:307` — *"manual injection (WP4 — Dial-in is a real mode)"* |
| It injects ONE prompt and does **not** consume the queue | `batch-runner.ts:311` — *"submit it. No new conversation, no queue"* |
| It opens a real run record, `mode: 'dial-in'` | `batch-runner.ts:348` — `recorder.start({ primer, prompts: [], mode: 'dial-in' })` |
| Later injects harvest into that same record | `batch-runner.ts:342` — *"Lazily open ONE dial-in run record; later injects harvest into it too"* |
| Selection is already by explicit id | `src/shared/ipc.ts:554` — `injectPrompt(promptId: string)` |
| The IPC channel is registered and validated | `src/main/index.ts` — `IPC.runInjectPrompt`, `input: z.string().min(1)`, `handle: (promptId) => getRunner().injectOne(promptId)` |
| **It is not published as a verb** | absent from the 33 verbs returned by `/v1/verbs` |

**Half the pair is already published-adjacent**: `IPC.runInjectPrimer` and
`IPC.runInjectPrompt` are registered in the same block as `IPC.harvestThumb`, and
`harvest.thumb` *is* a published verb. So the mechanism to publish these exists and is in
use two lines away.

### Two things that look like the answer and are not

- **`run.start` has no `mode` parameter.** Its schema is
  `{entry, chunkSize, cadenceBaseMs, cadenceJitterMs, primerSettleMs, loadSettleMs}`.
  There is no way to ask it for dial-in.
- **`chunkSize` does not bound a run.** It is the re-prime interval — `batch-runner.ts:63`,
  *"re-prime a fresh chat every ~15–20"*, and `harvestedCount % chunkSize` at line 574.
  Setting `chunkSize: 1` would re-prime after every image, not run one image. Anyone
  reaching for it as a single-image lever will get an expensive surprise.

## The problem, in cost

The unit of a run is the theme. To generate **one** image over the control surface today,
an agent must:

1. `domain.import-prompts` with `mode: replace` — **which discards every other queued prompt**
2. `run.start`
3. re-import the full set afterwards to restore the queue

That is destructive, lossy, and it makes the cheapest possible check cost the same setup as
a forty-minute run. It was done in this session: a 24-prompt queue was replaced with 4 to
run one scene.

## Why it earns its place

- **~100 seconds against ~40 minutes.** One image validates the entire chain — primer posts,
  `promptShape` wraps correctly, the image harvests, filename and output routing land, and
  (for this project) magenta keys to alpha cleanly — before committing to a long run.
- **It is the dial-in loop.** Change `promptShape`, fire one image, look, adjust. That loop
  is the reason Dial-in was built. Over the control surface it is currently unusable,
  because every iteration destroys and rebuilds the queue.

## Proposal

Publish the two existing channels as verbs. No new runner behaviour.

```
run.inject-primer          -> injectPrimer()          gated, requiresEngine
run.inject-prompt          -> injectOne(promptId)     gated, requiresEngine
    input: { promptId: string }   (min length 1, already validated at the IPC layer)
```

Implementation is expected to be `verb-policy.ts` entries plus descriptions — the handlers,
the input validation and the runner logic are all already written and exercised by the UI.

### The four design constraints, and how this proposal meets them

| # | Constraint | Status |
|---|---|---|
| 1 | **Must not mutate the queue.** Other items stay queued and untouched | ✅ already true — *"No new conversation, no queue"*. A solution that trims the queue is the workaround with a nicer name |
| 2 | **Must produce a real run record** in `runs.list` with `harvested/total`, so one polling path watches both | ⚠️ partly — a record IS opened with `mode: 'dial-in'`, but with `prompts: []`. **See open question below** |
| 3 | **Must keep existing gating** — confirm-first, requires a ready engine | ❗ must be ADDED. The IPC path has no gating because the UI is already a human pressing a button. A published verb is not, so both verbs must carry `gated: true` and `requiresEngine: true`. A cheaper run is not a less consequential one — it still posts to a live ChatGPT session |
| 4 | **Selection must be explicit** — a named id or bounded count, never "the first one" | ✅ already true — `injectOne(promptId)` takes an id |

Constraint 3 is the only real work, and it is the one that must not be skipped on the
grounds that a single image is cheap.

### Open question on constraint 2

The dial-in record opens with `prompts: []` and grows as injects harvest into it. So
`total` may read `0`, or may climb — unverified, because reading it requires a dial-in run
and this session did not start one.

**Whoever implements this must check what `runs.list` reports for a dial-in run before
declaring constraint 2 met.** If `total` is `0` or misleading, that is a second small fix,
not a reason to reject the approach. Do not assume it is fine because a record exists.

## Model dependency — NOT to be ruled here

`docs/rulings-open.md` **R1** asks whether a `Run` gains a `Segment` beneath it and becomes
reopenable. That is unruled and it is tier 1.

A single-image run *is* a Run with one item, and the dial-in record already behaves like the
thing R1 proposes — one record staying open across multiple injects, which is very close to
a Segment. **How a single-image run should be recorded may therefore be constrained by R1.**

State it, do not design around it, and do not rule it on David's behalf. If R1 lands one
way, the dial-in record may need to become a Segment; if it lands the other, it stays as
is. Publishing the verbs is safe either way, because it publishes behaviour that already
exists — but the *recording* semantics are R1's to settle.

## Suggested acceptance

With a queue of N > 1 items and a ready engine:

1. Call `run.inject-prompt` with the id of item 3.
2. That image generates and harvests.
3. **`domain.get` still shows all N items queued** — nothing consumed, nothing reordered.
4. `runs.list` shows a run record for it, and the same polling used for an Auto run reports
   its progress.
5. Calling it without a ready engine is refused with 409 + the engine hint, exactly as
   `run.start` is.

## Scope note

Independent of `docs/spec-control-surface-ui-staleness.md`. That spec is about the renderer
not repainting; this one is about a capability not being published. They share no code path
and should not be merged.
