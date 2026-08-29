---
doc: spec
project: imagedrip
status: SHIPPED 2026-08-29 in `6f7993a` — `IPC.domainChanged` (`shared/ipc.ts:48`), emitted at
  `main/index.ts:145`, bridged at `preload/index.ts:50`, consumed in `renderer/src/store.ts`,
  covered by `test/domain-push-channel.test.ts`. Kept as the defect record.
created: 2026-08-29
reported_by: Claude Code session "break-room", driving the control surface over HTTP
---

# Control-surface writes do not repaint the UI

## The defect

A mutation made through the control surface updates the domain, persists, and is
immediately readable back — **but the running window keeps showing the previous values.**
The operator sees a cockpit that disagrees with the app's own state.

## Reproduced 2026-08-29

An agent wrote a full three-layer setup over `http://127.0.0.1:7180/v1/call/…`:

```
brand.create            -> "Agent Office — Retro Pixel"
domain.save-brand       -> 1844-char body
template.create         -> "Isolated Depth Plate", importFormat: blocks
template.save           -> body 783c, promptShape 935c, negatives 421c
project.create          -> "Agent Office S06 Plates" + new outputDir
template.switch         -> isolated-depth-plate
domain.import-prompts   -> 24 prompts, mode replace, format blocks
theme.rename            -> agent-office-s06-plates
```

`domain.get` immediately afterwards returns **all** of the above.

The window at the same moment still showed:

| Pane | UI showed | Domain actually held |
|---|---|---|
| 1 BRAND | `SHAPE COPILOT` | `Agent Office — Retro Pixel` |
| 2 TEMPLATE | `Verify PromptShape 0819` | `Isolated Depth Plate` |
| import format | `One per line` (highlighted) | `blocks` |
| 3 PROJECT | `Verify PromptShape 0819` | `Agent Office S06 Plates` |
| OUTPUT FOLDER | `…/verify-promptshape-0819` | `…/agent-office-s06-plates` |
| QUEUED | `3` — a woman and / a dog and / a car and | `24` — s01-01-back-wall … s06-04-foreground |

Every pane in the control column was wrong, including the highlighted segmented control.

## Why this matters more than a cosmetic refresh

The control surface exists so an agent can set a run up and a human can then eyeball it
before pressing Run. **That review step is the whole safety model**, and a stale window
breaks it in the worst direction: the operator approves what they see, and something else
runs. `run.start` is gated on human confirmation precisely so a person checks first — this
defect makes that check unreliable.

It also produces a second-order failure already observed in this session: the operator
reasonably concluded the agent's writes had failed, when they had succeeded. Debugging
effort went to the wrong layer.

## Not established

- Whether the UI recovers on **refocus**, **tab switch**, or **restart**. The reporting
  agent cannot drive the UI. If it repaints on restart this is a missing subscription; if
  it never repaints, state is being cached at load.
- Whether **UI → control surface** has the same problem in reverse (a change typed in the
  window while an agent holds stale data). Untested.
- Whether the QUEUED pane and the CONTEXT panes fail for the same reason or two different
  ones. They were only observed failing together.

## Proposed fix

The domain already has a single authority. The renderer needs to follow it rather than
snapshot it.

1. **Emit a `domain:changed` event from the main process** on every mutation that touches
   brand / template / project / theme — the same set that `domain.get` returns. One event
   carrying the whole domain document is simpler than per-field deltas and matches how
   `domain.get` is already shaped.
2. **Subscribe the renderer** and re-render from that payload. No merge logic: last write
   wins, because the main process is the authority.
3. **Cover the control-surface path specifically.** The likely cause is that IPC-originated
   mutations (from the window) notify the renderer, while HTTP-originated ones do not —
   two write paths, one notification. If so, the fix is to move the notification down to
   where the domain is written, so it cannot be bypassed by the caller's entry point.
4. **Regression test**: write via the control surface, assert the renderer's rendered
   state matches `domain.get`. A unit test on the store will not catch this — the defect
   lives in the seam between the two write paths.

## Suggested acceptance

With the app open and visible: an agent calls `brand.create` + `domain.import-prompts`
over HTTP; the window reflects the new brand name and new queue count **without any
operator interaction** — no click, no refocus, no restart.

## Scope note

This is not the `rulings-open.md` model work and does not depend on it. It is a defect in
an existing shipped path.

---

# Addendum — a renderer state API (`ui.state`)

Added 2026-08-29 on David's prompt: *"can't we have state APIs so you know what is going on?"*

## The gap

ImageDrip already has good state APIs — `context.get`, `domain.get`, `runs.list`,
`run.chat-state`. An agent can read the whole domain at any time, and does.

**None of them reports what the operator is actually looking at.** They all read the same
authority the mutation wrote to, so they agree with each other by construction. The window
is the one surface with no API, and it is the surface the human approves from.

That is why this defect survived: nothing in the system could observe the disagreement.
It took a person noticing a screenshot looked wrong.

## Proposal

A read-only, ungated verb:

```
ui.state  ->  { brand: {name,id}, template: {name,id,importFormat},
                project: {name,id,outputDir},
                queue: { count, firstIds: [...] },
                header: { done, total, engineBadge },
                renderedAt: <iso8601> }
```

Shape mirrors `domain.get` deliberately, so the two can be diffed field-for-field.

## The one design constraint that makes or breaks it

**`ui.state` MUST be sourced in the renderer — from the props/state actually bound into
the components — and MUST NOT read the main-process store.**

If it reads the main store it will echo `domain.get`, agree with it always, and report
health during the exact failure it exists to detect. That is not a weak test, it is a
false one: it manufactures confidence rather than merely missing the problem. A verb that
cannot fail is not a check.

Implementation implication: the control surface handler for `ui.state` has to round-trip
to the renderer (IPC request → renderer replies with its own state) and time out if the
renderer does not answer. **A timeout is itself a meaningful result** — it means the
window is wedged, which is also worth knowing.

## What it unlocks

1. **Self-detecting drift.** Any agent can call `domain.get` and `ui.state` and compare.
   Disagreement is a defect, reported immediately rather than discovered by eye.
2. **A real acceptance test for the staleness fix**, executable without a human:
   write over HTTP → poll `ui.state` → assert it converges on `domain.get` within a
   bounded time, with no click, refocus or restart.
3. **A genuine pre-flight before `run.start`.** The gate on that verb assumes the operator
   saw the truth. Today nothing verifies that. With `ui.state`, an agent can refuse to
   propose a run while the window disagrees with the domain — the operator cannot approve
   something they were never shown.

Point 3 is the real prize. It converts the human-confirmation gate from an assumption
into something checkable.

## Not proposed

Not a screenshot API, and not a DOM dump. Structured values only — the fields a person
reads off the cockpit, in the shape `domain.get` already uses, so diffing is trivial.
