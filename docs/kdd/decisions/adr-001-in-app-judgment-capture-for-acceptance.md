---
adr_number: 1
title: "Capture acceptance judgments in the app, not in the conversation"
status: "accepted"
created: "2026-08-03"
decision_date: "2026-08-03"
story_reference: "ad-hoc — v2 Usability acceptance pass"
supersedes: ""
superseded_by: ""
sensitivity: normal
---

# ADR-001: Capture acceptance judgments in the app, not in the conversation

## Status

Accepted

## Context

v2 (WP1–WP5) was built, committed, typechecked and unit-tested, then deliberately **stopped**:
`working-rules.md` recorded it as *"awaiting David's in-app acceptance of WP1–WP5."* That
acceptance pass did not happen for days, and WP6/WP7 stayed blocked behind it.

The previous acceptance pass had produced the entire v2 requirements document — but only because
an agent transcribed a conversation in real time. Everything not transcribed was lost, and the
findings existed nowhere the code could reach.

Two forces:

1. **The labeller is the expensive part.** The person who knows what's wrong is the owner, and
   their judgment is a byproduct of work they were already doing (running a batch, looking at
   images). A control that adds a task for them gets abandoned.
2. **Two different judgments were being conflated.** "This control is confusing" (about the
   cockpit) and "this image is wrong" (about the primer that produced it) are different signals
   with different destinations.

## Decision

Build a **Live UAT capture layer** into the cockpit — gated, off by default — writing to an
**append-only JSONL sidecar** under `userData`, which a later session reads off disk and turns
into fixes in bulk.

Two records, deliberately in **two stores**, sharing one control:

| Record | Anchor | Feeds |
|---|---|---|
| `Snag` | a screen region (plain string) | the cockpit backlog — WP6/WP7 |
| `ImageVerdict` | `runId` + `promptId` | primer tuning (`Project.md`) |

`ImageVerdict` carries a **producer snapshot** — the exact primer as posted, read back from that
run's `manifest.json`, never recomposed from the current Brand/Project. Without a truthful
producer the corpus is a bug list; with it, it is a tuning signal traceable to a cause.

Full requirement: [`docs/live-uat.md`](../../live-uat.md).

## Alternatives Considered

- **Keep narrating findings into the conversation.** Rejected: it is what had already failed.
  Findings die when the session closes, and the acceptance pass had been blocked for days.
- **One store for both judgment types.** Rejected: merging a screen anchor with a data anchor
  destroys the cross-record correlation ("this primer keeps producing washed-out backgrounds")
  that is the entire point of a tuning loop.
- **A star rating or thumbs-only control.** Rejected: a scalar says *that* something is wrong;
  the free-text note says *why*, and only the why drives a fix. The note is the payload.
- **Build the inbox too** (list / resolve / reopen / bulk clear). Deferred, knowingly — the pile
  is drained by a session within the hour, so wallpaper is not yet a risk. **This is recorded
  debt**: if the layer outlives the first processing pass, the inbox has to be built.

## Consequences

**It worked.** The blocked acceptance pass completed in one sitting. The first corpus — 2 snags
and 8 image verdicts — plus the conversation it prompted produced 16 triaged findings across
five lanes, including one blocker (the run-entry chooser was invisible and the app therefore
unrunnable) that had survived every prior code review and unit-test pass.

**Trade-offs and things it revealed:**

- Capture is only as good as the app's own honesty. 4 of the first 8 verdicts were caused by one
  wrong caption ([[../learnings/render-real-identity-not-a-derived-guess]]) — the tool faithfully
  recorded four bug reports about a bug that did not exist.
- **Lane coverage is itself a signal.** The primer lane received **zero** records: every image
  verdict was about how the app *displayed* images, not whether they matched the brief. An empty
  lane is information — it says the loop it serves has not actually been exercised yet.
- The sidecar stays removable: no writes to `domain.json` or the run manifests, so the feedback
  channel cannot move the decision channel. Deleting `live-uat/` removes the feature and nothing
  else.

## Related

- Patterns: []
- Stories: v2 WP1–WP5 acceptance; WP6/WP7 unblocked as a result
- Requirement: [`docs/live-uat.md`](../../live-uat.md)
- Learnings surfaced by the first corpus:
  [[../learnings/native-view-paints-above-all-html]],
  [[../learnings/render-real-identity-not-a-derived-guess]]
