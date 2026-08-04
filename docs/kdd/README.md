---
doc: kdd-index
project: imagedrip
status: current
created: 2026-08-03
purpose: the knowledge-driven-development record — what we learned the expensive way, and what we decided
---

# ImageDrip KDD

**Learnings** are problem-and-fix records. When the same learning recurs across 3+ sessions it
earns promotion to a **pattern** (none yet — promotion needs recurrence, not enthusiasm).
**Decisions** are ADRs.

Curated by [Lisa](https://github.com/appydave) (`appydave:lisa`). Capture one item at a time,
reconcile before writing, never mint a duplicate — bump the existing entry instead.

---

## Learnings

| Learning | Category | Severity | The one-line version |
|---|---|---|---|
| [Electron's default UA is bot-refused](learnings/electron-default-user-agent-is-bot-refused.md) | ai-integration | critical | `Electron/` in the UA → the shell loads and the cookie authenticates while every `/backend-api/*` call is refused. Looks exactly like a working login with missing data. |
| [A native view paints above ALL HTML](learnings/native-view-paints-above-all-html.md) | frontend | high | No `z-index` reaches a `WebContentsView`. Don't fight the compositor — keep anything that *opens* out of its column. |
| [One `persist:` partition, one process](learnings/one-persist-partition-one-process.md) | infrastructure | high | Two instances can't share a Chromium profile's LevelDB locks. Recurring `quota_database` errors are contention, not noise. |
| [Render real identity, not a derived guess](learnings/render-real-identity-not-a-derived-guess.md) | frontend | medium | A caption that re-derives a filename will drift from the file — and be believed over it. It manufactured four wrong bug reports. |
| [Verify the legacy before porting it](learnings/verify-the-legacy-before-porting-it.md) | process | medium | A remembered "sophisticated pacing engine" was 12 lines and *less* capable than what it would have replaced. Read the source before scoping the port. |

## Decisions

| ADR | Status | Decision |
|---|---|---|
| [ADR-001 — In-app judgment capture for acceptance](decisions/adr-001-in-app-judgment-capture-for-acceptance.md) | accepted | Capture acceptance judgments **in the app**, in an append-only sidecar a later session reads off disk — not narrated into a conversation that ends. |

## Patterns

None yet. A learning is promoted at **3 recurrences**, with human approval — see
`appydave:lisa` → `references/promotion.md`.

---

## Reading this before work, not after

A KDD only pays off if reading is wired into the workflow. Two checkpoints worth honouring on
this project:

- **Before touching the ChatGPT panel or any floating UI** — read the two frontend learnings.
  Both describe failures that are silent and look like something else.
- **Before debugging "the embedded site is logged in but empty"** — read the user-agent learning
  first. Two wrong diagnoses were burned reasoning from symptoms before it was measured.
