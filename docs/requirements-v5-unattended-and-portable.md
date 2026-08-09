---
doc: requirements
project: imagedrip
status: PROPOSED — planning pass only, nothing built. For David's ratification.
created: 2026-08-09
purpose: map the codebase as it stands onto the North Star, and phase the distance between them
predecessor: requirements-v4-resident-chat.md (WP1–WP5 built and verified 2026-08-08)
authority: docs/north-star.md — ratified 2026-08-08, interviewed from David
supersedes_nothing: v2/v3/v4 remain the record of what was built and why
---

# v5 — Unattended, and Portable

**Status: proposed.** This document is a planning artifact. No production code was written in
the pass that produced it and no behaviour changed.

**What it is for.** v2, v3 and v4 each answered *"what should we build next?"* from inside the
product. The North Star was ratified after all three, on 2026-08-08, and it is the first document
that answers *"what is this for?"* from outside. This maps one onto the other: claim by claim,
what exists, what is believed to exist, and what the distance actually is.

---

## 0 · The Star, restated

> **Fill in a few fields — or just say it in chat — and get images in that style generated on
> repeat, unattended, into a folder for that run. Drivable by a person or an agent.**

Ratified by David, 2026-08-08. `docs/north-star.md`.

**The test, applied to everything below:**

> *Does it get more images of a given style out, with less of the operator touching it?*
> If it removes a manual step, widens what a run can express, or lets an agent do something a
> human had to do — it fits. **If it adds a control to learn, it does not.**

**The second filter, non-negotiable:** *nothing may fail silently.* A run that did not deliver
must never look like one that did. This repo has now paid for that rule three times — the `feed()`
post-condition, the truncated capability probe, and the dropped `result` frame.

**Its parent** (`~/dev/ad/brains/north-star/north-star.md`) sharpens two words in it:

- *"humans are **on** the loop (oversight, direction, judgment), not **in** it (manual
  execution)"* — this is what **unattended** means here. Not "no human". A human who is
  consulted, not employed.
- *"solo founders and small-team operators"*, *"scale without hiring"* — this is what
  **single-user, distributed widely** means. One operator per install, many installs, never
  multi-tenant.

---

## 1 · Gap analysis — claim by claim

Each claim is taken from the Star's own words. **BUILT** means exercised end to end.
**BELIEVED** means the code exists and has never been run in anger — those are counted
separately on purpose, because counting them together is how a plan inherits a fiction.

### 1.1 · "Three fields carry the whole thing — brand, style/template, project"

| | |
|---|---|
| **Built** | All three are first-class records. `src/shared/domain.ts` — `Brand`, `Template`, `Project`, composed style→recipe→subject by `compose()`. Template shipped in v3 WP1. Brand can be `(none)` (A1). Each locks during a run. Verified by `test/domain-compose.test.ts`. |
| **Gap — structural** | **`Project` carries no `brandId`.** The axes are declared orthogonal and are not actually linked. `src/shared/domain.ts:96` — a project knows its `templateId` and nothing about its brand. |
| **Why it matters beyond tidiness** | This is the *root cause* of the `repo.attach` defect, not a separate issue. Attach publishes every unsourced record stamped with whichever brand is **active**, because a project carries no information to route with (`docs/working-rules.md`, known gap). Fixing attach without `brandId` means inventing the routing information at publish time — which is the bug. |
| **Evidence of real use** | Thin. The live store holds 2 brands / 6 templates / 7 projects, and 4 templates + 4 projects are `chat:probe` litter from 2026-08-08. |

**Verdict against the test:** `brandId` is invisible to the operator and removes a whole class of
wrong-repo writes. **Fits** — it adds no control to learn.

### 1.2 · "The chat drives the fields. Typing into controls by hand is the fallback."

| | |
|---|---|
| **Built and verified** | The whole of v4. Control surface (35 verbs, loopback, bearer), MCP proxy, contained CLI in main (D2), the D1 human gate, and the `CHAT ｜ CONTEXT` tab with chat as the default half. Driven end to end in the real app on 2026-08-08 — a `text_delta` stream reaching React, a gated call held 34.8s and denied as `403`. `npm run chat:probe` 13/13. |
| **Gap — amnesia** | **The transcript does not persist.** It lives in the zustand store for the life of the window. A run's provenance survives in `manifest.json`; the conversation that *configured* that run does not survive a restart. (v4 §10 Q5, wp4 research §7 Q4 — both left open.) |
| **Gap — verb holes** | No verb edits ONE queued prompt (`docs/review-usability-and-product-fit.md`, matrix: *"Edit one queued prompt — ❌ not at all, ✏️ domain.json"*). So "change the third one to say X" cannot be done by talking, only by re-importing the list. |
| **Gap — the chat cannot see** | `harvest.thumb` returns one image as a data URL. The chat can read *that* an image landed, never look at it. Judging output stays a human-only loop. |
| **Not a gap** | The chat cannot write to the ChatGPT webview, and cannot reach `chat.send` itself. Both deliberate (`NEVER_EXPOSED`). |

**Verdict:** transcript persistence **fits** (it removes "tell it again what we were doing").
A single-prompt edit verb **fits**. Letting the chat see images is a larger question and is
deliberately left open in §5.

### 1.3 · "A run is the unit — generated on repeat, unattended, into a folder for that run"

This is where the Star and the code are furthest apart, and the reason is one line.

| | |
|---|---|
| **Built** | Run folders, `manifest.json` with the exact primer as posted, `RunRecorder`, per-image timings, re-primes, pauses, and `outcome` written on a real quit (A2). Cadence and stall budget derived from measured timings (`stall-budget.ts`). `feed()` verifies delivery (2026-08-07) — a missed click no longer looks like a slow generation. |
| **🔴 BROKEN — and it is not cosmetic** | **`running` never returns false after a run completes.** `BatchRunner.finishRun('complete')` (`src/main/batch-runner.ts:428–433`, `:543–547`) sets `phase = 'done'` and never sets `this.stopped = true`. `get running() { return !this.stopped }`. |
| **Blast radius** | **14 call sites** in `src/main/index.ts` gate on `runner?.running`. After a *successful* run, brand / template / project switching and saving, `theme.rename`, all three deletes and `repo.attach` are refused — with the message **"brand is locked while a run is live"** when no run is live. `/v1/health` also reports `running: true` forever, so a caller polling for completion never sees it finish. |
| **Why it is a headline** | It fails BOTH filters at once. It puts the operator in the way immediately after every success (the test), and it does so with a confident, specific, wrong message (the silent-failure rule) — the same species as the truncated probe. The handover called it "cosmetic"; it is not. |
| **Workaround today** | Press STOP, or restart. Neither is discoverable, because nothing says the app thinks a run is live. |
| **Gap — no subset** | `RunConfig` has five fields and none of them is a limit. `run.start` runs the whole queue; `run.inject-prompt` is `NEVER_EXPOSED`. "Run three of these" means narrowing the queue by hand (`docs/handover-2026-08-07-product-fixes.md`, item 3). |
| **Gap — walking away is not safe yet** | "Unattended" implies you leave. If a run pauses (rate-limit, stall, a failed `feed` post-condition) it waits indefinitely and nothing reaches the user — no notification, no log file. While the window is open there is a `⏸ PAUSED` chip; with the window behind an editor, or after a quit, there is nothing but the manifest. |
| **Gap — no forensic trail** | The logger writes to stdout only (`src/main/create-console.ts:75`). Background the dev server and it is lost entirely. After any failure there is nothing to read. |
| **Gap — dev only** | `dev:watch`'s own restart bypasses `before-quit`, so `outcome` is missing for every run interrupted by a hot reload. |

**Verdict:** the `running` fix, `RunConfig.limit`, a log file and an end-of-run signal all
**fit** — every one of them is less operator touching, not more. None adds a control to learn.

### 1.4 · "It costs nothing per image"

| | |
|---|---|
| **Built and honoured** | The engine is the embedded ChatGPT session. No image API exists anywhere in the codebase, and the six webview writers are `NEVER_EXPOSED` so no agent can reach them. |
| **Nuance worth stating** | The *chat* does cost tokens — on the user's own Claude subscription, never billed by the app (v4 §3, deliberate). The pane now shows the running cost per conversation. "Costs nothing" is a claim about images, and it holds. |
| **Residual risk, named not solved** | The ToS mitigation is human-paced feeding with a live STOP. D1 makes `run.start` human-approved **from the pane**. From any other client it stays advisory — an autonomous agent on the control surface can still start a run without a human. That is D1 as decided (and is what keeps `chat:probe` headless); it is recorded here as a known residual, not reopened. |

### 1.5 · "Single-user, distributed widely" — clients, Mary, Jan, David

**This is the largest gap between the code and the Star, and almost none of it is built.**

| Requirement | State | Evidence |
|---|---|---|
| `npm install` works off David's machine | ❌ **No** | `@appydave/core` is a `file:` path dep and is **unpublished** (`npm view` → 404). `~/dev/ad/apps/appydave-foundation/` must exist as a sibling. `docs/specs/installability-spec.md` C4 open since 2026-07-19. |
| A packaged app exists | ❌ **Never produced** | No `dist/`. `npm run package` has never been run. `electron-builder.yml` is configured (dmg, arm64) and unexercised. |
| The packaged app can find its MCP proxy | ⚠️ **Untested** | `mcpServerPath = join(app.getAppPath(), 'scripts', 'imagedrip-mcp.mjs')` — packaged, that is a path **inside `app.asar`**, spawned as a child process. `scripts/` is not excluded so it would be bundled. Whether `ELECTRON_RUN_AS_NODE` resolves a script inside an asar has **not been checked**. |
| Config travels between people | ❌ **Never exercised** | `~/dev/image-projects/i-*` **does not exist on this machine**. Zero records in the live store carry a `sourcePath` or `repoRoot`. v3 WP2 — "files on disk are the source of truth" — is **BELIEVED, not BUILT**. |
| The recipient can use the chat | ⚠️ Conditional | Requires them to have Claude Code installed and authenticated. Documented, inherent to v4 §3's topology choice. |
| The recipient can run a batch | ⚠️ Manual, inherent | ChatGPT sign-in is per-machine and human-only. Correctly documented; not a defect. |
| Updates reach them | ⚠️ Wired, unexercised | `electron-updater` is configured against `github/appydave/imagedrip`; never published to. |

**Verdict:** distribution is a real phase of work, not a task. It also **fails the test as
written** — it produces no additional image for David. It is justified by the Star's *"What this
means in practice"* section and by the parent Star's ICP, not by the throughput test. It is
sequenced accordingly in §3.

### 1.6 · "Agents are first-class operators, ultimately through API endpoints they can drive directly"

| | |
|---|---|
| **Built and proven** | This is the strongest-served claim in the whole Star. The control surface is exactly that API: 35 verbs mirrored from the live IPC registry, JSON-Schema'd from the same Zod schemas the UI is held to, with `gated` / `requiresEngine` policy published alongside. `chat:probe` demonstrates an agent driving it headlessly, checking every claim against the surface rather than against what the agent said. |
| **Scope, by decision** | Loopback only. Widening the bind was ruled out (`docs/handover-2026-08-07-product-fixes.md`, "Ruled out"); SSH port-forward is the sanctioned remote path. "Directly" is satisfied on-machine. |
| **Gap** | An agent cannot ask *"is this image any good?"* — see §1.2. And a *second* agent cannot drive the pane's chat (correct: `chat.*` is `NEVER_EXPOSED`). |

### 1.7 · "Flexible for prompt shapes not invented yet — interpolation variables the named example"

| | |
|---|---|
| **Built** | Nothing. `Prompt` has `{ id, subject, text, status, file? }` and no variables. `Template` has no prompt shape. The only substitution in the codebase is `renderListPrompt()` (`src/shared/domain.ts:238`), wired solely to the LIST PROMPT helper card — which the usability review recommends **retiring**. |
| **The evidence it is needed** | The first real workload. `docs/handover-2026-08-07-product-fixes.md`: *"every prompt block repeats the same six field labels and only values differ."* Twelve blocks, six repeated labels each. |
| **The shape already sketched** | Shape on `Template.promptShape`, values on `Prompt.variables`, resolved at feed time (same handover, item 2). |
| **Deliberately deferred once** | *"one batch proves duplication; a second, non-thumbnail template proves the shape."* That second batch has still not happened. |

**Verdict:** **fits, strongly.** It is the Star's own named example, and it is pure
less-touching: twelve near-identical blocks collapse to one shape plus twelve value sets.

---

## 2 · What is BUILT vs what is BELIEVED

Stated plainly, because the difference decides what a plan may assume.

**Built and exercised end to end**
- The run loop: prime → drip → detect → harvest → route → re-prime, with verified feed delivery
- Run manifests and provenance, including `outcome` on a real quit
- The control surface + MCP proxy + `chat:probe` (13/13, repeatedly)
- The contained CLI, the D1 gate and the chat pane (driven in the app 2026-08-08)
- Template as a first-class axis (v3 WP1)

**Believed — code exists, never run in anger**
- **v3 WP2: brand repos as the source of truth.** No repo exists; no record has a `sourcePath`.
  The read-on-activate / write-on-save path, `repo-store.ts`, and the `_template/` scaffolds have
  never round-tripped against a real repository.
- **`repo.attach`** — known-defective, gated, hard-denied to the pane, and correspondingly unused.
- **Packaging and auto-update** — configured, never produced.
- **The gate's 120s timeout path** — unit-tested (`test/chat-gate.test.ts`), never observed in the app.

**Dark**
- **Live UAT verdicts.** 4 snags on disk, `verdicts.jsonl` **does not exist**. The snag half works;
  the image-judgment half — the tuning signal ADR-001 was built for — has produced nothing. The
  loop that decides whether output is getting better is not running.

---

## 3 · The phased plan

Ordered by dependency, then by the test. Each phase states what it unblocks and how it is proven.

### Phase 0 — Stop lying (debt; blocks everything after a run)

The app must be truthful about its own state before anything is built on top of it.

- **0.1 `running` returns false when a run completes.** Set `stopped` on the `done` path, or
  derive `running` from `phase`. Audit all 14 gates.
- **0.2 A log file.** Tee the existing logger to `<userData>/logs/imagedrip-<date>.log`, capped
  and rotated. No new UI.
- **0.3 `dev:watch` restart writes `outcome`.** Or, if that is not reachable, persist run state
  incrementally so a killed process leaves a truthful record.

**Acceptance**
- Start a 2-prompt run, let it complete, then call `domain.save-brand` — it succeeds.
  `GET /v1/health` reports `running: false`. A regression test asserts
  `runner.running === false` after the queue empties.
- After any run, `<userData>/logs/` holds a file containing that run's lifecycle lines.
- A `dev:watch` reload during a run leaves a manifest with an `outcome`.

### Phase 1 — Make a run something you can walk away from (North Star core)

- **1.1 `RunConfig.limit`** — run the first N queued prompts. A sixth field on a shape that
  already takes five; no new write path to the webview.
- **1.2 Interpolation variables** — `Template.promptShape` + `Prompt.variables`, resolved at feed
  time. Import gains a keyed format. The composed primer is unchanged for prompts with no
  variables (back-compat proven by test, as v3 WP1 did).
- **1.3 End-of-run signal** — a native notification on `complete` / `paused` / `stalled`, and the
  reason. This is what makes "walk away" safe rather than optimistic.
- **1.4 Retire the LIST PROMPT card** — three controls and a preview box serving a workflow the
  chat obsoleted. The review calls it *"the clearest win in the rail."*
- **1.5 `prompt.update`** — edit one queued prompt by id. Closes the last "only by editing
  `domain.json`" row in the usability matrix.

**Acceptance**
- `run.start { limit: 3 }` against a 12-prompt queue harvests exactly 3 and leaves 9 queued.
- A template with a 6-field shape plus 12 value sets produces 12 manifests whose posted prompts
  are byte-identical to the 12 hand-written blocks from the 12-days batch.
- A run that pauses raises a notification naming the reason; a completed run raises one naming
  the count and the folder.
- The LIST PROMPT card is gone and no test or doc references it.
- "Change prompt 3 to say X" works from the chat, and `domain.get` shows only that prompt changed.

### Phase 2 — Make the configuration travel (prerequisite for Phase 3)

- **2.1 `Project.brandId`** — with a migration that infers it from the active brand at upgrade
  time and records that it was inferred.
- **2.2 `repo.attach` → import-only + explicit per-record publish.** The agreed fix from
  2026-08-05, now unblocked by 2.1. Deletes `PANE_DENIED_VERBS` when it lands.
- **2.3 Exercise the repo path for real** — create one brand repo, attach it, round-trip a
  template and a project, `git init` with `**/runs/**/*.png` ignored (working-rules, measured:
  ~4 MB all-in per image).

**Acceptance**
- Attaching a repo with a foreign project unsourced writes **nothing** for that project.
- Publishing a project writes exactly `projects/<id>/` in the repo its brand points at, and a
  project belonging to another brand is refused with a message naming both brands.
- Delete `domain.json`, re-attach the repo, and the brand / template / project / queue come back.
  (v3 WP2's own acceptance criterion, finally executed.)

### Phase 3 — Distribution (Star, but not throughput)

- **3.1 Resolve `@appydave/core`** — publish it, or vendor it into the package. Lands in
  `appydave-foundation` / `appytron`, not here.
- **3.2 Produce and verify a package** — `npm run package`, then **install the dmg on a machine
  that has never built this repo** and prove: it launches, `control.json` is written, the chat
  spawns its MCP proxy **from inside the asar**, and `chat:probe` passes against it.
- **3.3 First-run experience** — the app currently seeds "Beauty & Joy" / "Smoothies" demo data
  that *"looks exactly like David's real data"*. A recipient's first launch must be honest about
  being empty, and must say the two things they have to do themselves (sign in to ChatGPT;
  install Claude Code if they want the chat).

**Acceptance**
- A second machine (or a fresh account) installs the dmg and reaches a signed-in ChatGPT panel
  with no terminal, no checkout and no `npm`.
- On that machine, `chat:probe` passes 13/13 against the packaged app.
- First launch shows no fabricated brand or project.

### Phase 4 — Close the feedback loop

- **4.1 Make an image verdict cost one gesture** and prove the corpus grows. The capture layer is
  built and on by default; in five days it has produced zero verdicts, so the defect is the cost
  of the gesture or its placement, not the absence of a feature. Diagnose before building.
- **4.2 Transcript persistence** — sidecar under `userData`, written **incrementally** (never at
  quit — `dev:watch` bypasses it). Global, not per project, per the WP4 decision.

**Acceptance**
- After one judging session, `verdicts.jsonl` exists and every record carries a truthful producer
  snapshot read from that run's manifest.
- Quit mid-conversation, reopen, and the transcript is there.

---

## 4 · Explicitly out of scope

- **Reopening D1 or D2.** The per-client human gate and Read+MCP-no-Bash are decided and built.
- **Weakening `NEVER_EXPOSED`,** adding a `ui.state` verb, or any second writer on the ChatGPT
  webview, by any path.
- **Widening the control-surface bind** beyond loopback. SSH port-forward is the remote story.
- **An image API.** The founding constraint is unchanged.
- **Multi-tenancy, accounts, sync.** "Single-user, distributed widely" means many installs, not
  a shared service.
- **A `RunConfig` settings panel.** `run.start` already takes every field; values belong to the
  chat (usability review, A8 — *"build no UI for this"*).
- **A CLI adapter over several coding agents** (v4 §10 Q2). Single-user says Claude Code only;
  revisit if distribution reaches someone who has a different one.
- **`library.json` / keyword index (v3 WP4) and brand-repo scaffolding (v3 WP5).** Real, and
  behind everything above.

---

## 5 · Open questions — not guessed

1. ~~**The bearing.**~~ **ANSWERED 2026-08-09** — §6's proposal was ruled by David and is now the
   Star's bearing. Unattended leads; distribution follows.
2. **Should the chat be able to SEE harvested images?** It would let an agent close the judgment
   loop — the one part of the system still entirely human. It also means shipping image data into
   a model on every run, and it is the first thing in this plan that would put per-token cost on
   the critical path of a *run* rather than of a conversation. Not guessed.
3. ~~**Who is the second install actually for?**~~ **ANSWERED 2026-08-09 — nobody, yet.** David:
   *"being installed by other people is not needed just yet."* No real person is waiting, so
   Phase 3 does not jump the queue and its shape stays undecided until someone does. The two
   shapes remain as recorded: staff take a `.dmg` from a link; a client takes signing,
   notarization and a first launch that does not seed David's demo data. **Re-ask this question
   the day a name appears** — it is the one input that re-orders the plan.
4. **Does a run belong to a project, or to a template+subject pair?** Interpolation variables
   make "the same twelve subjects through a different template" a natural request, and today that
   means a new project. This may be the next modelling error, in the way Project-doing-two-jobs
   was the last one.
5. **Is the demo seed data wanted at all?** It has already cost one false bug report
   (*"a fresh Electron profile looks exactly like David's real data"*).
6. **Does `--resume` survive an app restart** (v4 §10 Q6), which decides whether transcript
   persistence in 4.2 restores a *conversation* or only a *log of one*.

---

## 6 · The bearing — RULED 2026-08-09

> **Ratified by David on 2026-08-09, together with question 3.** The proposal below stands as
> written and is now `bearing:` in `docs/north-star.md`. The "what would change my mind" clause at
> the foot of this section was tested and did **not** fire: there is no client on a deadline,
> because there is no second install at all yet.

### The record of how it was proposed

The Star's frontmatter carries `status: open` and flags `bearing:` as derived. Its own Open §1
says it is the line most likely to be wrong. The current bearing reads:

> *Finish the chat seat so the three fields can be driven by talking, then make it something
> another person can install and run on their own machine.*

**Its first clause is now done.** v4 WP4 shipped on 2026-08-08 and was driven in the app.

**Proposed replacement:**

> **Make a run something you can start and walk away from — then make the whole configuration
> travel, so a second person can run it on their own machine.**

**Why this and not something else.** Measured against the Star's own test, the largest remaining
distance is not distribution — it is that the *unattended* claim in the guiding sentence is not
yet true. A completed run leaves the app believing it is still running; a run cannot be limited to
a subset; a paused run tells nobody; and a failure leaves no trail to read. Every one of those
puts the operator back in the loop precisely when the Star says they should be able to leave.
Distribution is real and is named in the Star, but it produces no additional image for the person
the product currently serves, so it follows rather than leads.

**What would change my mind:** if the second install is for a *client* on a deadline, Phase 3
outranks Phase 1 regardless of the throughput test — a shipped-to-nobody product is not
throughput either. That is question 3 above, and it is David's to answer.
