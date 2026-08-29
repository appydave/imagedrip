---
doc: audit
project: imagedrip
status: FINDINGS — audit only. Nothing was built, removed or changed.
created: 2026-08-29
part: 2 of 3
siblings:
  - audit-2026-08-29-docs-vs-reality.md
  - audit-2026-08-29-provider-decision-brief.md
authority: docs/north-star.md
purpose: score every shipped verb, panel, setting and surface against the North Star's own test
---

# Part 2 — Goal alignment

**The test, verbatim from `docs/north-star.md`:**

> **Does it get more images of a given style out, with less of the operator touching it?**
> If it removes a manual step, widens what a run can express, or lets an agent do something a
> human had to do — it fits. If it adds a control to learn, it does not.

**And its parity clause, ruled by David 2026-08-10, which this audit applies as written:**

> A control that performs a step the app already performs by itself is not a new thing to learn —
> it is the same step, made visible and checkable. The question to ask of a proposed control is:
> **does this let a person do something the machine already does, or something new?** The first is
> parity and it fits; the second is cockpit and it does not.

**⚠️ The precedence rule is still unruled.** `docs/rulings-open.md` **R10** exists because the two
halves of the test fire on the same feature and the Star says which wins for neither. Where a
score below turns on that, it is marked **[R10]** and both readings are given. **This audit does
not rule R10.** Six items are marked; if David rules R10 the "parity wins" way, four of them move
from *violates* to *serves*.

---

## What was inventoried, and what this did not establish

**Inventoried:** 34 published control-surface verbs, 19 never-exposed channels, 13 UI regions,
6 run-tuning fields, 4 npm dev scripts, 5 probes, and the persisted domain schema — all read from
source, each anchored to `file:line`.

**Three limits apply to every row and are not repeated:**

1. **This lists what is registered, not what is used.** Nothing here establishes that a verb has
   ever been called or a control ever clicked. Where first-party runtime evidence *does* exist
   (manifests, JSONL sidecars, the output repo's git log) it is cited explicitly and separately.
2. **Where a surface logs nothing on success and has no test, a broken one and an unused one are
   the same observation.** Those rows are marked **[opaque]** rather than scored on evidence.
   `src/main/capability-guard.ts:273` skips the audit line for any non-gated call that succeeds,
   so most reads leave no trace at all by design.
3. **Scores are judgements against a written test, not measurements.** They are arguable. The
   *evidence* columns are not.

---

## Headline

| | |
|---|---|
| Surfaces scored | **72** |
| **Serves** the Star | 38 (53%) |
| **Neutral** | 16 (22%) |
| **Violates** — adds a control to learn | 18 (25%), of which **6 are [R10]-dependent** |
| **Exist only because of the embedded ChatGPT panel** | **31 (43%)** |

**The single finding.** Of the 18 surfaces that sit furthest from the Star, **11 exist only to
manage the embedded panel** — the two clocks, the entry-mode choice, the re-prime promise, the
sign-in state machine, the z-order workarounds, the paste-it-yourself card. They are not design
mistakes. Every one was added to survive a specific, documented failure of driving a browser by
hand. **They are the panel's cost, expressed as cockpit.** Deprecating the panel (Part 3) deletes
more distance from the North Star than any feature this project could add.

---

## The ranked table

Ordered by distance from the Star — worst first. **P** = exists only because of the panel.

### Violates — adds a control to learn

| # | Surface | P | Anchor | Why it violates | Evidence |
|---|---|---|---|---|---|
| 1 | **`repo.attach`** | | `verb-policy.ts:222`, `:330` | Produces no image, and is *knowingly defective*: it publishes every unsourced project and template into the repo you point at, stamped with whichever brand is active. The operator must understand a blast radius no confirm can describe | The repo says so itself — `verb-policy.ts:247-267`; `CLAUDE.md`: *"Do not un-gate it"* |
| 2 | **The Live UAT layer** — `uat.snag`, `uat.verdict`, `uat.counts`, `uat.reveal`, the ⚑ top-bar toggle, per-region ⚑ buttons, harvested-tile multi-select | | `verb-policy.ts:355-358`; `FlagButton.tsx`; `live-uat-store.ts`; `App.tsx` `region=` on 13 regions | A whole second mode whose output is notes *about the app*. It is meta-work: it produces zero images and every part of it is a control to learn | `snags.jsonl`: **4 records, last written 2026-08-07**. **No `verdicts.jsonl` exists** — `uat.verdict` has never written. **[opaque]** — never-called and called-but-failing are indistinguishable here |
| 3 | **The re-prime promise** — "⚠ after ~18 images the run re-primes a fresh chat" | **P** | `App.tsx:616`, `chunkSize={18}` hard-coded at `App.tsx:312` | Tells the operator a behaviour will happen, so they reason about it and plan around it. It has **never happened** | **0 re-primes across all 11 manifests on disk.** Default `chunkSize` is 18 (`batch-runner.ts:63`); the longest run ever queued 15. The boundary has never been *reachable*. This is `rulings-open.md` R4's finding, re-verified today on a doubled sample |
| 4 | **The two clocks** — Stall Budget + Cadence, and the operator vocabulary they require | **P** | `stall-budget.ts`, `cadence.ts`, `two-clocks.md` | Two independent timers on two different statistics, which the operator must understand to interpret a pause. `two-clocks.md` is 100 lines of explainer for a thing that only exists to imitate a human at a keyboard | 12 of 12 pauses ever recorded are one of these two firing. Under a hosted API neither concept survives: no cadence is needed (no ToS mitigation), and the stall budget collapses to an HTTP timeout |
| 5 | **The 5 run-tuning fields** — `chunkSize`, `cadenceBaseMs`, `cadenceJitterMs`, `primerSettleMs`, `loadSettleMs` | **P** | `ipc.ts:286-306`, defaults `batch-runner.ts:61-72` | Five numbers whose only job is to make browser automation behave. `primerSettleMs: 9000` and `loadSettleMs: 4000` are literally "wait for a web page" | **Mitigated:** not exposed in the UI — `App.tsx` displays `chunkSize` but offers no editor. They are reachable only programmatically. **[opaque]** — nothing records whether any caller has ever set one |
| 6 | **The entry-mode choice** — `▶ Run` asks `continue` vs `fresh` | **P** | `App.tsx:538`, `:555`; `ipc.ts:295` | A decision at the moment of running, about conversation state. The operator must hold "is my dial-in still in effect?" in their head | Exists because Auto used to destroy Dial-in (WP5, `b87597c`). A real fix to a real bug — and a control the Star would not have asked for |
| 7 | **`theme.rename`** | | `verb-policy.ts:338` | A verb for a concept `rulings-open.md` **R3** recommends retiring: `Theme` is a `{name, prompts[]}` wrapper, one per project, used for nothing but minting a run-id string | R3, unruled. The verb's own description admits the trap: *"rename it to what is actually being generated **before** starting a run, not after"* — a control with a hidden ordering requirement |
| 8 | **Dial-in ⇄ Auto as a persisted mode** | **P** | `App.tsx:234-253`, `store.ts` | **[R10]** A mode is, in David's own words, *"a cursor position that lasts longer."* The app **defaults to Auto**, which *hides* the per-row ⚡ inject buttons — so the default state conceals its own parity controls | `rulings-open.md` **R15** recommends rendering them disabled instead. **[R10] parity reading:** Dial-in *is* the manual equivalent the parity rule protects, so the mode fits and only the hiding violates |
| 9 | **The "COPY OUT" card (step 4)** — *"to paste into ChatGPT by hand"* | **P** | `App.tsx:1072` | **[R10]** A whole card teaching the operator to do the app's job manually | **[R10] parity reading:** this is the purest parity affordance in the product — the manual equivalent of the automatic step, exactly what *"you cannot test what you cannot drive yourself"* asks for. Under an API it becomes meaningless |
| 10 | **The ChatGPT column's resize handle and bounds-sync dependency list** | **P** | `useResizable.tsx`, `App.tsx:127-159` | A draggable panel the operator must position, backed by an effect whose dependency array must be kept complete or *"the overlaid ChatGPT view drifts out of alignment"* (`App.tsx:157-159`) | A comment in shipped code warning a future editor that forgetting a dependency silently misaligns a native view. Zero tests touch the renderer |
| 11 | **`Popover` and `Modal` — the z-order workarounds** | **P** | `Popover.tsx`; `App.tsx:608`, `:1289` | **[R10]** Two components that exist solely because *"a native view paints above ALL HTML"* — no `z-index` reaches a `WebContentsView` | KDD learning `native-view-paints-above-all-html.md`, severity **high**. `App.tsx:1289`: *"It renders through `Modal`. That component hides the ChatGPT [view]"*. Not operator-facing cost, but permanent structural cost |
| 12 | **The engine sign-in state machine** — `ready` / `signed-out` / `detached` / `indeterminate`, plus every hint string | **P** | `engine-readiness.ts:42-60` | Four states the operator (and every agent) must interpret, guarding a precondition no software can satisfy: *"a human opens the app on this machine and logs in by hand"* | `engine-readiness.ts:4-6`. `CLAUDE.md`: *"no agent can do this"*. **`indeterminate` explicitly conflates a timeout with selectors that no longer match** (`:49-50`) |
| 13 | **`run.chat-state`** | **P** | `verb-policy.ts:352` | Exposes conversation-priming state so a caller can decide whether to continue or start fresh — a question that only exists because the engine is a chat | Its own description warns it *"reports the RUNNER's view, not the browser's"* — two truths about one thing, and the caller must know which they hold |
| 14 | **The rate-limit guard's 15-minute blind backoff** | **P** | `rate-limit-guard.ts:23` | A 15-minute stall the operator cannot shorten, triggered by scraping a banner out of a page | **[opaque]** — **0 rate-limit pauses across all 11 manifests.** Never fired in production. `rate-limit-guard.test.ts` (6 tests) proves the mechanism, not the detector |
| 15 | **The Context｜Chat tab switch** | | `App.tsx:416` | **[R10]** A tab. The Star says *"the chat drives the fields"* — so hiding the chat behind a tab makes the primary interface the secondary one | **[R10] serves reading:** the chat pane itself is the Star's *"or just say it in chat"* clause shipping. Only the tab that hides it is the friction |
| 16 | **`domain.reset-run`** | | `verb-policy.ts:315` | Destructive re-queue of a whole theme, confirm-first. Housekeeping, produces no image | Borderline; listed for completeness |
| 17 | **The single-instance lock's silent surrender** | **P** | `CLAUDE.md`; `scripts/dev-stop.mjs` | The operator must know that `npm run dev` against a running app *silently* serves a build they stopped editing an hour ago | KDD `one-persist-partition-one-process.md`, severity **high**. Mitigated by `dev:clean`, which is itself a thing to know |
| 18 | **The 5 probes** — `probe-a/b/c`, `probe-attach`, `probe-attach-live`, plus `measure-drift` | **P** | `probe/` | A maintenance ritual the operator inherits: *"every selector lives in one file… `probe-c.cjs` re-pins it"* | Correct and honest tooling (`README.md` calls it *"expected upkeep, not a defect"*) — and it is upkeep that exists **only** because the engine is someone else's web page |

### Serves the Star

Grouped; all 38 anchored in `src/main/verb-policy.ts` unless noted.

| Group | Surfaces | Why it serves |
|---|---|---|
| **The three fields** (13) | `brand.create/switch/delete`, `template.create/switch/save/delete`, `project.create/switch/delete`, `domain.save-brand`, `domain.save-project`, and the BRAND/TEMPLATE/PROJECT cards (`App.tsx:1542`, `:1724`, `:1933`) | This *is* the Star: brand = the look, template = the artifact kind, project = the subject. Three chips, three axes, separated on purpose |
| **`template.promptShape`** | `verb-policy.ts:329` | Widens what a run can express without adding an operator step — the recipe wraps every prompt automatically. The clearest "widens what a run can express" in the product |
| **Bulk prompt intake** (2) | `domain.import-prompts` (`:308`), the QUEUED lane (`App.tsx:2259`) | Removes the largest manual step there is. Two formats, three modes, harvested rows always survive |
| **The run as the unit** (4) | `run.start/stop/pause/resume` | "A run is the unit. Images land in a project folder belonging to that run" |
| **Provenance** (4) | `runs.list`, `runs.manifest`, `runs.reveal`, `project.reveal-output-dir` | *"Come back to a folder full of images"* — and a folder that explains itself months later |
| **Agent drivability** (the whole surface) | 34 verbs on loopback, `scripts/imagedrip-mcp.mjs`, `.mcp.json`, `.codex/config.toml`, `context.get`, `domain.get`, `run.status` | *"Agents are first-class operators, not an afterthought — ultimately through API endpoints they can drive directly."* This is the Star quoted almost verbatim, and it shipped |
| **`domain.compose-primer`** | `:314` | Read-only preview of exactly what would be posted. Lets an operator or agent check before spending a run |
| **The in-app chat pane** | `chat-session.ts`, `chat-gate.ts`, the Chat tab | *"Fill in a few fields — **or just say it in chat**"* |
| **The capability guard** | `capability-guard.ts` | Invisible to the operator, identical rules for every caller. Safety that adds nothing to learn is the only kind the Star permits |
| **Scoped writes + git-committed harvests** | `file-author.ts`, `image-harvest.ts:46` | Images cannot escape the output root, and every harvest is committed. Silent-failure insurance, no operator cost |
| **`harvest.thumb`** | `:354` | Lets an agent see what was produced **[opaque]** — no log line, no test |

### Neutral

`brand.delete` / `template.delete` / `project.delete` (housekeeping with real guards — `template.delete` refuses 422 while a project points at it), `run.status`, `uat.counts`, `uat.reveal`, `domain.get`, the HARVESTED lane and its arrow-key viewer, the run-control top bar, the output-dir editor, the D1 confirm modal, `dev` / `dev:watch` / `dev:stop` / `dev:clean`, `typecheck`, `test`.

---

## The panel-only inventory — what becomes moot

**31 of 72 surfaces (43%) exist only because the engine is an embedded browser.** This is the list
Part 3's staged plan works through; it is reproduced there as the deprecation checklist with file
paths.

| Category | Count | Items |
|---|---|---|
| Pacing & timing | 7 | Stall Budget, Cadence, the 5 tuning fields |
| Conversation state | 5 | re-prime / `chunkSize`, entry mode (`continue`/`fresh`), `run.chat-state`, primer re-post, Dial-in mode |
| Session & identity | 5 | engine readiness (4 states), sign-in precondition, UA override, `persist:` partition, single-instance lock |
| DOM coupling | 5 | `chatgpt-selectors.ts`, completion detection, harvest de-dupe (`seen` set + `awaiting` gate), refusal marker, rate-limit banner scrape |
| Compositing workarounds | 4 | `Popover`, `Modal`-hides-panel, bounds-sync effect, resize handle |
| Manual fallbacks | 2 | COPY OUT card, per-row ⚡ inject |
| Tooling | 3 | 5 probes, `measure-drift.cjs`, `probe/pages/` |

**What this does not establish:** that all 31 disappear cleanly. Several have *analogues* under a
hosted API — a stall budget becomes a request timeout, the rate-limit guard becomes HTTP 429
handling, harvest de-dupe becomes a `taskId`. The claim is that the **operator-facing concept**
goes away, not that zero code replaces it.

---

## Three alignment findings that are not scores

### AF-1 · The app promises a behaviour that has never occurred

`App.tsx:616` tells the operator *"⚠ after ~18 images the run re-primes a fresh chat from the SAVED
[primer]"*. Across **all 11 run manifests on this machine, `reprimes` is `[]`. Every time.** The
default `chunkSize` is 18 and the longest run ever queued 15 prompts, so the boundary has never
been reachable.

This is the repo's own hardest rule pointed at itself: *"a control that quietly disappears is worse
than none, because it is believed."* Here it is a *warning* that quietly never fires — believed,
planned around, and never true. The anti-drift story the whole architecture rests on has **zero
production evidence, in either direction.**

**What this does not establish:** that re-priming would not work. It has never been tested in
production because it has never been reachable. `docs/phase-0-checks/RUNBOOK.md` exists to settle
exactly this and has not been run.

### AF-2 · The queue has no terminal failure state, so "not attempted" and "failed" are the same row

`PromptStatus = 'queued' | 'harvested' | 'refused'` (`src/shared/domain.ts:38`) — and the file's own
comment (`:26-33`) records that **nothing writes `refused` to the live queue**; a refused prompt
stays `queued` and is retried. The manifest recorder sets only `harvested` (`run-manifest.ts:120`)
or `refused` (`:141`).

Consequence, measured: across 11 manifests, **47 prompt rows resolve to exactly two states — 34
`queued`, 13 `harvested`, 0 `refused`.** A prompt that was fed, stalled for 390 seconds and
abandoned is recorded identically to one the operator never got to.

**This is the North Star's "nothing may fail silently" clause failing in the data model, not in the
UI.** It is also why no honest success rate can be computed from the manifests alone: the 34
`queued` rows conflate *the operator stopped* with *the image never came*.

> **✅ FIXED 2026-08-29.** `PromptStatus` gained `failed`, and `RunPromptRecord` gained `attempts`
> and `failure` (`{kind: 'refused' | 'stalled' | 'feed-failed', detail, at}`). The runner now
> records an attempt before every feed and a failure on all three paths; `RunRecorder.finish()`
> sweeps any row still `queued` with `attempts > 0` into `failed`. From here on:
> `queued`+0 attempts = never reached · `failed` = fed, no image · `harvested` = delivered, and
> `total − harvested − refused − failed` is the never-reached count.
>
> **`failed` is deliberately NOT written to the live queue.** `batch-runner.ts:185` feeds only
> `status === 'queued'`, so writing it into `domain.json` would silently drop those prompts from
> every future run — the same bug class this state exists to expose. Retry-on-failure is unchanged.
>
> **What this does NOT fix:** a run that is PAUSED when the app quits still never reaches
> `finish()`, so the sweep does not run and the rows stay `queued`. That is the separate open
> defect in [spec-paused-run-manifest-never-closed.md](spec-paused-run-manifest-never-closed.md),
> whose mechanism is explicitly not yet established — and it is the case **3 of the 11 manifests on
> disk are actually in**. Until it is fixed, the ambiguity is closed for stopped and completed runs
> and still open for abandoned ones.
>
> Covered by `test/prompt-failure.test.ts` (9 tests), each verified to fail when the behaviour is
> removed.

### AF-3 · The most recent real work was finished by hand, inside the app's own output folder

First-party, today, from the output project's own git history — the strongest single alignment
signal in this audit:

`~/Pictures/ImageDrip/agent-office-s06-plates/` contains five runs from **2026-08-29**. Their
manifests record **9 prompt rows and 1 harvest**. The run folder holds **five PNGs**. The git log
of that repo contains exactly **one** `harvest …` commit and **one** `provenance …` commit; `git
status` reports the other four PNGs as **untracked** — `FileAuthor` always commits what it writes,
so those four did not come from ImageDrip.

**The operator generated one plate through the app and the other three by hand**, saving them into
the folder the app had made. Three of the five runs are still `outcome: open` with no `finishedAt`,
each carrying a `stalled — no image in 390s`/`576s` pause.

Against the Star's test — *more images out, less operator touching* — this is the answer in its
plainest form on the most recent day of use.

**What this does not establish:** *why* each run stalled. `engine-readiness.ts:49-50` records that
the app cannot distinguish "ChatGPT was slow" from "the selectors no longer match", and this audit
did not drive the app to find out. It also does not establish that the four untracked files came
from ChatGPT at all — only that ImageDrip did not write them.

---

### AF-4 · The parity rule is violated in one direction: three destructive verbs are automatable but not hand-operable

David's parity ruling, 2026-08-10, quoted in `docs/north-star.md`:

> **Parity: every automated step is operable by hand, and every manual step is automatable.**
> …a step with no manual equivalent is a step nobody can check. This is a testability rule before
> it is a UX one.

Of the 34 published verbs, **five are not bridged into the renderer** — `src/preload/index.ts`
exposes 49 `IPC.*` constants and none of these, and the preload API type does not declare them:

| Verb | Gated | Human at the window | Chat pane | MCP / Codex / curl |
|---|:--:|:--:|:--:|:--:|
| `brand.delete` | ✓ | **✗ cannot** | ✓ (confirm) | ✓ **no confirm** |
| `template.delete` | ✓ | **✗ cannot** | ✓ (confirm) | ✓ **no confirm** |
| `project.delete` | ✓ | **✗ cannot** | ✓ (confirm) | ✓ **no confirm** |
| `theme.rename` | – | **✗ cannot** | ✓ | ✓ |
| `context.get` | – | **✗ cannot** | ✓ | ✓ |

Corroborated independently: `grep -ni "delete\|forget" src/renderer/src/App.tsx` finds **no delete
affordance in the UI at all** — only `window.removeEventListener` and prose. (`run.status` is also
unbridged, but legitimately: the renderer consumes the `run:status-push` channel instead.)

So the effective policy today is: **a terminal agent may silently delete a project and its entire
prompt queue — `project.delete`'s own description says *"there is no undo inside the app"*
(`verb-policy.ts:336`) — while the person who owns it cannot delete it from the app.** That is
parity failing in the direction the rule was written to prevent: an automated step with no manual
equivalent, and therefore no way for a human to check it.

`theme.rename` compounds it. The theme name is slugged into **every future run folder**
(`verb-policy.ts:339`), and an operator who wants their batches named correctly must ask an agent
to do it.

**What this does not establish:** whether it is deliberate. No doc, commit message or code comment
found in this pass explains it, and `git log` records no decision to withhold deletes from the UI.
Absence of a rationale is consistent with an oversight but does not prove one — ask David before
building the buttons.

---

## Summary

**The product is well aligned with its Star where it is about images, and misaligned exactly where
it is about the browser.** The three-axis model, bulk import, `promptShape`, the run-as-unit,
provenance and the 34-verb agent surface are the Star shipping — 38 surfaces, more than half the
inventory, and several of them (`promptShape`, the control surface) are the Star quoted almost
word for word.

Of the 18 surfaces that violate the test, **11 are panel management** and 6 more turn on a ruling
David has not made (**R10**). Strip the panel and the cockpit gets smaller without a single feature
being cut — which is the rarest kind of simplification available to a product, and the reason Part 3
matters beyond its cost argument.

**Three things should be ruled regardless of the provider decision**, because they are the Star's
own "nothing may fail silently" and parity clauses, and none of them depends on which engine
generates the image:

1. **AF-2** — the queue needs a terminal failure state. Today a run that delivered nothing and a run
   nobody started look the same on disk.
2. **AF-1** — either make the re-prime reachable (`rulings-open.md` R4's runbook) or stop promising
   it in the UI. A warning that has never fired is believed.
3. **AF-4** — three destructive verbs are agent-only. Either give the human the buttons, or record
   why not. Right now a curl call can delete a project and its queue with no confirmation and no
   undo, and its owner cannot.

**R10 should be ruled too**, since six scores here hang on it and every future control proposal will
re-open the same argument.
