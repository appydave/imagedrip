---
doc: findings
project: imagedrip
status: FINDINGS — recovery + analysis only. Nothing built, no code or config changed.
created: 2026-08-19
purpose: recover the design thinking of 2026-08-05 → 2026-08-14 from the primary record, reconcile
  it against the code, and rank what remains
authority: docs/north-star.md — Star interviewed 2026-08-08, bearing ruled 2026-08-09,
  parity rule ruled 2026-08-10
method: four independent sweeps — Claude Code transcripts on Roamy, transcripts on the M4 Mini,
  the agent-first-architecture brain, and the repo itself — reconciled against each other
---

# What ImageDrip should become next

> **Read §0 first.** The brief that commissioned this document assumed the thinking had been lost.
> It had not. What follows corrects that premise before it builds on it.

---

## 0 · The headline

**The thinking was consolidated. It is sitting in this repo, and it stops at a question mark.**

The design discussion is `docs/ui-design-notes-jan.md` (what was *said*) and
`docs/research-imagedrip-architecture.md` (what is *true*) — 134 KB across the two, both committed
`3a701bd` on 2026-08-14. They are not fragments. The research file ends with **§8: seventeen
questions only David can rule**, split into blocking-the-model, blocking-the-folder-decision and
blocking-the-drift-strategy.

**Nothing has been committed since 2026-08-14.** No image has been generated since **2026-08-10**
(`~/Pictures/ImageDrip/shape-copilot-ux-review/2026-08-10-2054-…`), and the last log file is
`imagedrip-2026-08-11.log`. So the project is not stalled for want of analysis. It is stalled on
**rulings**, and on **three empirical checks that were prepared and then not run**.

Two things follow, and they point in opposite directions from "build the next feature":

1. ~~**The two commits of 2026-08-14 have never been exercised in the running app.**~~
   **✅ DONE 2026-08-19 — see §8.** Both were driven through the live control surface. `promptShape`
   persists, renders, and leaves the primer untouched. What still needs a human is the feed itself.
2. **Phase 0's checks can cancel or double whole phases**, and two of the three are still open. The
   research document says it plainly: *"prove the re-prime fires before modelling it."*

---

## 1 · What the sweep found, and the correction to the brief

Four sources were swept in parallel. Three returned; one is recorded as unknown in §6.

| Source | Result |
|---|---|
| **M4 Mini** transcripts (`100.82.235.39`) | **The design session lived here.** Session `a3bea582-3fe9-4a8a-8478-86cad2e82fa0`, 2026-08-14 02:31Z → 11:24Z. 119 project dirs / 13,056 transcripts swept; 163 mention ImageDrip, 94 in window |
| **Roamy** transcripts | Six substantive sessions, 2026-08-06 → 2026-08-11. **Nothing between 11 Aug 20:35 and today** — enumerated, not assumed (§6 #1) |
| **`agent-first-architecture` brain** | Carries ImageDrip as a case study — and is **nine days stale** on its central claim. See §3.4 |
| **The repo** | 48 commits since 2026-07-29; 33 published verbs; all handlers in the Electron **main** process |

### 1.1 The brief's premise was wrong in one way and right in another

**Wrong:** *"Its conclusions were never consolidated."* They were, thoroughly, the same day they were
reached. Both documents are committed and cross-linked, and `ui-design-notes-jan.md` carries a
banner telling the reader to go and read the research file next.

**Right, and this is the part that matters:** the *rulings* were never made, and a small number of
conclusions reached in the **final 75 minutes** of the M4 session (10:10Z–11:24Z) post-date the last
write to those documents. Those are transcript-only, and two of them **contradict what the committed
documents still say**. They are in §3.1.

---

## 2 · Timeline — what was decided, and when

Session dates are evidence. `M4` / `Roamy` marks which machine holds the transcript.

| Date | Where | What was decided | Standing today |
|---|---|---|---|
| 2026-08-03/04 | M4 `fd2e9cd6` | v3 decisions: `i-<brand>` repo naming, files on disk as source of truth, Template as a first-class axis | Template ✅ shipped. Repos ❌ never exercised |
| 2026-08-04 | M4 `32007c48` | **npm only** — pnpm 10+ blocks the postinstall that fetches Electron | ✅ pinned + KDD learning |
| 2026-08-05 | M4 `32007c48` | `repo.attach` publishes anything unsourced — **accepted as a known, visible defect** | ⚠️ still defective, still gated |
| 2026-08-06/07 | M4 `5944cb00` | *"The embedded ChatGPT can never be the operator — **not because of where it sits, but because it cannot see the app**"* → the resident-chat pattern | ✅ became v4 |
| 2026-08-06 | Roamy `cbcef959` | The control-surface plan **executed** here; the plan itself was authored elsewhere (§6 #2) | ✅ shipped `3fbe28a` |
| 2026-08-07 | Roamy `cbcef959` | **The control-seam ruling:** *"the HTTP control surface is the remote-control mechanism. CDP is a test tier. AppleScript is retired."* Plus **B1** do not widen the bind, and **B4** no renderer-state verbs — *"it is the failure the drivable skill exists to prevent: a harness that tests its own hook"* | ✅ holds |
| 2026-08-08 | Roamy `51bdcf64` (brains) | **North Star interviewed, then ratified.** A first *derived* pass was materially wrong and David said so. His own words include two clauses that outrank most of this backlog: *"maybe even have some interpolation variables"* and *"My agents should be able to control it. It will ultimately have API endpoints that are drivable for agents to control as well."* He also struck one line: *"drop 'free to run'"* | ✅ `docs/north-star.md` (`d4ded7d`) |
| 2026-08-09 | Roamy | **Bearing ruled:** unattended leads, distribution follows. *"Nobody is waiting"* for a second install | ✅ in the Star |
| 2026-08-09 | Roamy | v5 phased plan: Phase 0 stop lying → 1 walk away → 2 travel → 3 distribute → 4 feedback loop | Partly built |
| 2026-08-10 | Roamy | **Parity rule ruled:** *"every automated step is operable by hand, and every manual step is automatable… you cannot test what you cannot drive yourself"* | ✅ added to the Star |
| 2026-08-10 | Roamy | v5.1: Items 2 and 3 were **already built**; only Item 1 (resume) is genuinely new | ✅ Items 2, 3 shipped |
| **2026-08-11** | Roamy `2dba3c1e` + `3e436644` | **The agent-first ruling**, from the capability sweep, verbatim: *"So: not 'build a sidecar.' Reshape the verbs into capabilities, and move authorization beneath the adapter. The server is done."* **Three named gaps**, and **three fields named as missing from every contract: `previousValue`, `idempotencyKey`, `dryRun`** | ⚠️ **two of three gaps closed; the contract fields dropped** — see §3.3 |
| 2026-08-11 | Roamy | Authorization moves beneath every adapter; `chat.gate-decide` de-published; pickers de-catalogued | ✅ `3f274d3` |
| **2026-08-14** | **M4 `a3bea582`** | **The design session.** See §2.1 | Mostly **unruled** |

### 2.1 What 2026-08-14 actually settled

**Ruled and closed:**

- **Design 2 (the white) is dropped.** ImageDrip stays AppyDave-themed.
- **Terminology: "theme" → "flow"** (David). *Caveat found later: the word collides with the `▶ Run flow` button label.*
- **Template defines structure only** — never a fixed variation or supporting-image count.
- **Phase 0a was RUN, by hand, and returned NO.** ChatGPT Projects do **not** carry visual style
  across conversations. David's verdict verbatim: *"Projects do NOT carry the look. 2c stands —
  reference images are still needed."* And: *"'Point ImageDrip at a Project URL instead of
  `chatgpt.com/`' is dead as a drift fix."* What a Project *does* carry is the **task convention** —
  inside it a bare noun meant "make an image"; outside it meant "define this word".
- **`Template.promptShape` — decided and built the same evening.** David: **"I think that shape is
  right."** Shipped as `ede7b46`.

**Raised, analysed at length, and left unruled** — this is the backlog:

- **The domain model.** Candidate A (`Segment` below a reopenable `Run`) vs Candidate B (a `Job`
  above `Project`). A is recommended. §2.9 of the research doc is literally titled *"What Strand 1
  needs from David"*. **No ruling was made.**
- The folder layout (§4.5), images-in-git (reverses a 2026-08-04 decision), `i-shared`'s fate, the
  25 orphan harvests, global vs brand-scoped templates, the variation-count cardinality change,
  denylist → allowlist, and eight more. **Seventeen in total.**

---

## 3 · Reconciliation — decided vs discussed vs shipped

### 3.1 🔴 Two divergences where the transcript beats the committed document

Both come from the final 75 minutes of the M4 session, after the documents were last written.

**(a) `Template.preserve` was REJECTED. The committed document still recommends it.**

`docs/research-imagedrip-architecture.md` §5.5 calls re-baking an invariant block into every prompt
*"the fourth option, and on the evidence the strongest"*, and §8 Q7a lists adopting it as a live
ruling for David, framed as *"reversing a founding assumption"* (`domain.ts:243`).

**In the transcript, David rejected the framing and the assistant withdrew the ask:**

> David: *"I don't even know where the short prompts inherit this. They are not baked in… **the goal
> was never short prompts.** They're fine, but quite often we want complex prompts that are
> different. Because quite often what you're doing is **setting up the recipe of what a prompt looks
> like.**"*
>
> Assistant: *"It's a **code comment**, added 2026-08-04… I called it a 'founding assumption' and
> asked you to reverse it. That was me inflating a comment into a principle. **Withdraw the ask** —
> there's nothing to reverse."* And: *"This also kills my `Template.preserve` idea — yours does the
> same job better."*

**Correction: §8 Q7a is dead.** `Template.promptShape` — which shipped — does the same job better,
and it is not a reversal of anything. **Do not re-raise `preserve` as an open ruling.** One of the
seventeen questions is already answered, and the document does not know it.

**(b) Reference images: "unbuildable" and "proven" are both on the record, hours apart.**

Strand 4 reported, at ~03:44Z:

> *"**NO. There is no file-attach path of any kind. David's reference-image proposal is unbuildable
> against the harness as it stands today.**"* — `feed()` (`webview-harness.ts:255-287`) is text-only.

Later the same day, `probe-attach.cjs` **executed and passed**: `clipboard.writeImage()` through the
same `wc.paste()` that `feed()` already uses delivers a real `image/png` **file** to the composer as
trusted input, and the attachment chip survives a subsequent `selectAll` + text paste.

**Both are true and they are not in conflict** — Strand 4 described the harness *as it stands*; the
probe proved a path *can be built*, and cheaply. The document should say so in one place, because
read separately the first reads as a veto on work the second unblocked.

**⚠️ The probe's own limit, stated in its commit and worth carrying:** it establishes nothing about
ChatGPT. *"A stand-in that behaves as expected and a ChatGPT that does not are indistinguishable from
here."* The live half (`probe-attach-live.cjs`) has **not been run**.

### 3.2 Where a decision and the code disagree

| # | The claim | What the code says |
|---|---|---|
| 1 | `CLAUDE.md:47` — *"`repo.attach` is knowingly defective and **gated**"* | **Gated for exactly one of three caller classes.** `capability-guard.ts:217` — `if (principal.kind !== 'pane-agent') return;`. A human clicking is not gated (they have confirmed). The in-app pane is *hard denied*. **Every other external agent — terminal Claude Code via `.mcp.json`, Codex via `.codex/config.toml`, `curl` — raises no confirmation at all.** The only thing between them and the verb is a CONFIRM-FIRST banner in the tool description. This is true of **every** `GATED_VERBS` entry, `run.start` included. The code is candid about why; a reader of `CLAUDE.md` alone would conclude something stronger than what is enforced |
| 2 | v5 §1.6 — *"35 verbs"*, quoted as evidence for the Star's best-served claim | **33.** `3f274d3` de-catalogued the two native folder pickers |
| 3 | `docs/README.md:16` — *"Current work is v2 (Usability); WP6 and WP7 not started"* | v3, v4 and most of v5 have shipped since. The index carries `status: current` while being the stalest file in `docs/` |
| 4 | `ede7b46` — the template shapes **every** prompt | `verb-policy.ts:322` — `template.save`'s **agent-facing description omits `promptShape`**. The Zod schema accepts it, so the JSON Schema exposes it; the prose an agent reads to decide *when* to call the verb never mentions the newest and most significant field it can write |
| 5 | v5.1 §1.4 — `brandId` starts UNSET, never inferred | ✅ Held. 3 of 10 projects carry a `brandId`; 7 are correctly `(none)` |

### 3.3 The 2026-08-11 agent-first ruling — two thirds built, and no document tracked the rest

Recovered from the Roamy transcript, not from any document. The capability sweep of 2026-08-11
named **three gaps**, and David ruled on the conclusion. Their status today:

| Gap named 2026-08-11 | Status |
|---|---|
| *"Authorization sits inside `control-surface.ts`"* — breaks silently at the second adapter; fix is one `executeCapability(principal, capability, input)` in main | ✅ **BUILT** — `capability-guard.ts`, `3f274d3`, the same day |
| *"Two verbs cannot work headlessly"* | ✅ **BUILT** — both pickers de-catalogued, `3f274d3` |
| *"Verbs are **CRUD-shaped, not intention-shaped**"* | ❌ **NOT BUILT, and never re-raised** |
| *"Missing from every contract: `previousValue`, `idempotencyKey`, `dryRun`"* | ❌ **NOT BUILT.** One preview verb exists in a surface of 33 |

**This matters for how §5 is read.** Two items I would otherwise have proposed fresh — dry-run
coverage and the reversibility/idempotency fields — were **decided nine days ago** and simply
dropped between the sweep and the v5.1 re-plan. They are not new ideas; they are unfinished ones.

The CRUD-vs-intention gap is `capability-model.md` §2 exactly: *"a capability should be something a
competent user would ask the application to accomplish — not a function that happens to exist in the
source."* ImageDrip's surface is `domain.save-project` / `template.save` / `brand.switch` — the
second column of the brain's own example. **It is not on any phase plan.** Naming it here rather
than ranking it: it is a refactor of a working surface, it fails the Star's throughput test on its
face, and it is David's call whether the agent-first bet is worth that. *(The same transcript
records him framing agent-first as a **"graded bet"**, with **"recipes come later"** — which reads
as a deliberate go-slow, not an oversight.)*

---

### 3.4 Where the brain and the primary record disagree — the brain loses

`~/dev/ad/brains/agent-first-architecture/` names ImageDrip *"the sharpest test — the verified
**inverted** case, with no external control surface of any kind"* (`INDEX.md:171-174`), and
`external-control-surface-pattern.md` §2.4 records the surface as **"verified absent"**: no `bin`,
no server, no MCP, *"~46 Electron IPC channels that terminate inside its own window."*

**That reading is dated 2026-08-06 and was overtaken two days later.** Verified first-hand today:

- `src/main/control-surface.ts` — loopback HTTP on `127.0.0.1:7180`, bearer token, `control.json` at mode `0600`
- `scripts/imagedrip-mcp.mjs` — a stdio MCP proxy holding **zero policy**
- **33 published verbs**, pinned by `test/verb-policy.test.ts:311-331`

**ImageDrip is no longer the inverted case. It is the brain's most advanced consumer**, and ahead of
the brain on three counts:

1. **The physical-location audit — applied, and better than the reference implementation.** The
   brain's own worked failure is Open Design's `od export --format pdf`: in the catalog, unable to
   run headlessly, because rasterization lives in the Electron window (KYB-409). ImageDrip hit the
   same class with its two `dialog.showOpenDialog` pickers and resolved it **the other way**, citing
   Open Design by name: *"**The rule is not 'warn about it' — it is 'do not catalogue it.'** A verb
   list is a promise; a promise with a footnote saying it cannot be kept is still a broken promise"*
   (`verb-policy.ts:150-171`).
2. **Authorization beneath every adapter.** `capability-guard.ts` exists precisely because the checks
   had grown inside `control-surface.ts` — the brain's own "WRONG" diagram, found in life. Its
   header quotes the brain back at itself.
3. **The confirmation-channel hole — found, closed, and pinned.** `chat.gate-decide` was published
   for three days. It is now in `NEVER_EXPOSED` (`verb-policy.ts:125`) and asserted absent by
   `test/verb-policy.test.ts:336`.

**Two internal inconsistencies inside the brain, worth fixing there rather than here:**
`evidence-base.md` §7 says *"no first consumer has been designed against this brain yet"* while
`field-notes.md` — same brain, same day — says ImageDrip's *"implementation is ahead of this brain"*.
And `INDEX.md:119` states the safety vocabulary as five classes including a `requires-confirmation`
that **does not exist** in `agent-safety.md` §1.

---

## 4 · Capability analysis

Applying `capability-model.md` §2 (granularity), `agent-safety.md` §1 (classification) and §4
(preview → confirm → execute), and the physical-location audit.

### 4.1 The location audit — already clean

**Every handler lives in the Electron main process**, registration and implementation both
(`src/main/index.ts:496-953`; every implementation a `src/main/*.ts` module). There is **no
renderer-implemented verb** and no CLI that implements a verb of its own; `src/preload/index.ts` is
a pure typed bridge with zero logic.

**So no proposed capability below is blocked by where it lives.** That is unusual and worth stating
plainly — it is the single most common way an Electron app's external surface turns out to be a
promise it cannot keep, and ImageDrip does not have the problem.

**What external drivability actually depends on:** the app **running** (everything), a **signed-in
ChatGPT** (only `run.start` / `run.resume`), and the **same machine** (loopback bind; widening it was
ruled out, SSH port-forward is the sanctioned remote path). *Checked now: `control.json` is absent
and nothing listens on 7180 — the app is down. That establishes only that.*

### 4.2 What exists today

| Class | Count | Notes |
|---|---|---|
| Published verbs (agent + UI) | **33** | One registry, one set of Zod schemas, one set of run-state locks, shared by every caller |
| `NEVER_EXPOSED` (UI only) | **18** | 6 webview writers · 2 dial-in injects · 3 chat controls · `chat.gate-decide` · 4 push channels · 2 native pickers |
| Gated (confirm-first) | **9** | Enforced for the in-app pane only — see §3.2 #1 |
| Engine-required | 2 | `run.start`, `run.resume`. `run.stop`/`run.pause` deliberately **not** — *"a guard that can trap the user inside the failure is worse than no guard"* |
| **Preview / dry-run verbs** | **1** | `domain.compose-primer`. That is the whole of it |
| MCP tool annotations | **0** | `readOnlyHint` / `destructiveHint` / `idempotentHint` all absent, so `domain.get` and `project.delete` look identical to any client safety layer |

**Reverse-parity gap, found in passing:** `theme.rename`, `brand.delete`, `template.delete` and
`project.delete` have **no preload bridge at all** — agent-only by design (`ipc.ts:38-46`). That is
the parity rule running the *other* way: four capabilities a person cannot perform in the UI. The
Star's clause is symmetric — *"every manual step is automatable"* **and** *"every automated step is
operable by hand"* — so this is a real, if small, breach of a rule ruled nine days ago.

### 4.3 What is needed

Granularity per `capability-model.md` §2 — *"something a competent user would ask the application to
accomplish"*, not a function that happens to exist. Classes per `agent-safety.md` §1: `read-only` ·
`reversible-write` · `destructive` · `external-side-effect` · `idempotent` ·
`requires-elevated-permission`.

| Capability | Class | Preview / dry-run form | Process | Provenance |
|---|---|---|---|---|
| **`run.reseat`** — runner opens a fresh conversation, re-posts the primer, records the boundary, keeps the run record **open** | `reversible-write` + `requires-engine` | `context.get` already reports primed state; the preview is "which segment would open, into which folder" | main (runner-mediated; a raw `harness.new-conversation` would breach v4 §4) | **Proposed 2026-08-14, unruled** |
| **`run.start { limit: N }`** — feed the first N queued prompts | existing verb, one field | the existing gate | main | **Decided 2026-08-09** (v5 §3 Phase 1.1), unbuilt |
| **`prompt.update`** — edit one queued prompt by id | `reversible-write` | returns prior text (reversible only because you kept it) | main | **Decided 2026-08-09** (Phase 1.5), unbuilt |
| **`run.reopen`** — continue an existing run id, appending to its folder and manifest | `reversible-write` | — | main | **Decided 2026-08-10** (v5.1 Item 1), unbuilt |
| **Persist `seen` per run** | correctness precondition, not a verb | — | main | **Decided 2026-08-10** (v5.1 §2.3), unbuilt — 🔴 see §5 |
| **`repo.import`** + **`project.publish` / `template.publish`** — split the defective `repo.attach` into import-only plus explicit per-record publish | `import` = `reversible-write`; `publish` = **`external-side-effect`** (writes into a directory outside the app) | **Mandatory.** §4 names preview as first-class for exactly this class; today the one verb that writes into a foreign repo has none | main | **Agreed 2026-08-05**, unblocked by `brandId` 2026-08-10, unbuilt |
| **End-of-run signal** — native notification on complete / paused / stalled, with the reason | `read-only` (emits) | — | main | **Decided 2026-08-09** (Phase 1.3), unbuilt |
| **`Segment` record** below a reopenable `Run` | a record, not a verb — **no operator-visible control** | — | main | **Proposed 2026-08-14, unruled** — the load-bearing choice |
| **`dryRun` on the destructive verbs** — `repo.attach`, `project.delete`, `run.start` | — | *"Would remove: 17 prompts · 3 run folders"*; **answerable in advance, never a `--yes` that suppresses the question** | main | **Decided 2026-08-11**, unbuilt (§3.3) |
| **`previousValue` on every `reversible-write`** | — | *the* thing that makes reversibility real — `agent-safety.md` §1: reversible *"is a property of the operation plus what you kept"* | main | **Decided 2026-08-11**, unbuilt |
| **`idempotencyKey` on meaningful-effect verbs** | — | returns the original result on retry | main | **Decided 2026-08-11**, unbuilt |
| **Intention-shaped verbs** — replace CRUD verbs with what a user asks for | — | — | main | **Named 2026-08-11**, unbuilt, unranked — see §3.3 |
| **MCP tool annotations** | — | — | `scripts/imagedrip-mcp.mjs` projection | Noted 2026-08-14 as a "small honesty bug"; **unruled** |
| **Preload bridges for the four agent-only verbs** | — | — | preload + renderer | **New from this pass** (parity rule, ruled 2026-08-10) |

---

## 5 · The ranked recommendation

Ranked by what unblocks the most — not by effort, and not by how much airtime it got.
**`[D]` = decided one to two weeks ago and simply unbuilt. `[R]` = analysed but never ruled.
`[N]` = new from this pass.**

### 1 · ~~Launch the app and exercise `promptShape`~~ — ✅ **DONE 2026-08-19** `[N]`

Done, as far as it can go without a live feed. **§8 records exactly what was and was not
established.** The headline: the app runs, the surface answers, `promptShape` persists and renders,
and `/v1/health` reports `running: false` — which is Phase 0.1's acceptance criterion, the one
`5f80eca` recorded as *"NOT yet proven in the app"*, proven.

**What is left of this item needs David at the screen:** one Dial-in feed, to see a shaped prompt
actually reach ChatGPT and land as an image. That is the half no agent may do.

### 2 · Run Phase 0c — the chunk-size experiment `[D, prepared 2026-08-14]`

**One afternoon, ~72 images, and it is the highest-leverage unbuilt thing in the repo.**

- The **chunk-boundary re-prime has never fired in production** — `reprimes: []` on all three real
  manifests. Phase 3's entire Segment model assumes a mechanism with **zero production evidence**.
  The research doc's own instruction: *"prove the re-prime fires before modelling it."*
- It simultaneously settles whether drift is **within**- or **between**-conversation. Those are
  **opposite strategies**, not the same problem, and 6–8 vs 18 are both folklore — neither has ever
  been measured.
- `docs/phase-0-checks/prompts-24-drift.txt` is written and shuffled, with six confusable pairs
  planted far apart to control the subject-difference confound that made the baseline weak evidence.

**Run 0b-live in the same sitting** (`probe-attach-live.cjs`) — it is the only thing standing between
the reference-image path and a decision, and it re-pins `composerAttachment`, which is ⚠️ unverified
for an image chip.

### 3 · Rule the three blocking model questions `[R]`

They cost minutes, and everything structural waits on them:

1. **Ratify or reject Candidate A** — a `Segment` below a **reopenable** `Run`.
2. **Name the segment.** *Not* "flow" — it collides with the `▶ Run flow` button label, which is the
   exact one-word-two-jobs failure `Template` was extracted to fix. `Leg`, `Pass`, `Session` are free.
3. **Is `Theme` retired or renamed?** It is a vestigial `{name, prompts[]}` wrapper used only to
   mint run ids.

**§6.3 of the research doc removes the usual reason to wait:** the `Segment` record is correct
whether or not reference images work — only its *boundary behaviour* changes. Ratifying it is not
blocked on Phase 0.

### 4 · Item 1 — resume — starting with persisted `seen` `[D, 2026-08-10]`

🔴 **This is not a missing feature; it is an unsafe one.** The de-dupe gate deciding which image
belongs to which prompt is an **in-memory** set (`batch-runner.ts:77`). Stop a run, quit, come back
tomorrow, continue into that conversation — and the gate has no memory of any image already in it. A
re-fired `src` from yesterday gets harvested and filed under today's prompt: **a wrong image under a
right filename, with a manifest asserting it.** That is this repo's named cardinal sin, reached by
the very feature being requested.

**Order:** Phase 0.3 (`outcome` survives a `dev:watch` restart — still open) → persist `seen` per run
→ `run.reopen`. In that order, because 0.3 is what makes an interrupted run readable at all.

### 5 · `run.reseat` — the parity fix and the model change are one piece of work `[R]`

The strongest signal in the research document: **a model gap and a parity gap named the same missing
thing.** Strand 1 called it a Segment boundary; Strand 2 called it `run.reseat`. Same operation from
opposite ends.

The discriminator that makes it safe, and worth reusing: *"does the caller reach `harness.*`
directly, or does it ask the single owner to perform one of its own steps?"* `run.start` **already**
causes `newConversation()` and is on the allow list — **there is no coherent reading of v4 §4 under
which `run.start` is safe and a mediated `run.reseat` is not.** Mediation is a *positive* argument:
the runner owns cadence and the rate-limit guard, so it can enforce a floor a raw verb could not.

It also pays immediately: if `reseat()` keeps the run record **open**, two conversations land in one
folder with a boundary marker — which is the thing David actually asked for.

### 6 · Fix `repo.attach` — it is the one verb holding the whole "travel" story `[D, 2026-08-05]`

Until it is fixed, **all of `repo-store.ts` is dead code in production**. Verified today: `repoRoot`
is `null` on all 3 brands, `sourcePath` is `null` on all 10 projects. v3 WP2 — *"files on disk are
the source of truth"* — is **BELIEVED, not BUILT**, four months of intent and zero exercise.

`Project.brandId` landed 2026-08-10 and unblocked the agreed fix (import-only + explicit per-record
publish). This is the item where the safety brain has most to say and the repo has least: publishing
into a foreign directory is `external-side-effect`, the class the brain says can *never* be silently
retried and *must* carry a preview — and today it has neither.

### 7 · Finish the 2026-08-11 contract work `[D, 2026-08-11]`

`previousValue`, `idempotencyKey` and `dryRun` were named as missing from **every** contract on
2026-08-11; the other two gaps from that ruling shipped the same day and these were dropped. They
are cheap, they are the `agent-safety.md` §8 gate's own rows, and `dryRun` on `repo.attach` is a
prerequisite of item 6 rather than a nicety — you cannot preview a publish that has no preview form.

**Not** ranked here: reshaping CRUD verbs into intention-shaped ones. Real, named the same day,
and a refactor of a working surface that fails the Star's throughput test on its face. §3.3.

### 8 · The honesty batch — an hour, no design required `[N]`

Small, and every one of them is the repo's own rule applied to itself:

- **`CLAUDE.md:47` overstates the gate.** Say what is enforced: *gated for the in-app pane; advisory
  for every other agent client.* Both `.mcp.json` and `.codex/config.toml` configure exactly the
  client for which it is advisory.
- **`verb-policy.ts:322`** — add `promptShape` to `template.save`'s description. An agent currently
  cannot learn from the surface that the app's newest capability exists.
- **`docs/README.md:16`** — three versions stale, marked `status: current`.
- **v5 §1.6** — 35 → 33 verbs.
- **Delete §8 Q7a** (`Template.preserve`). It was ruled on 2026-08-14 and the document does not know.
- **Add the four missing preload bridges**, or record the exemption. The parity rule is symmetric.

### Deliberately not next

- **Distribution (Phase 3).** The Star names it and the bearing defers it: *"nobody is waiting."*
  Re-ask the day a name appears — that is the one input that re-orders this list.
- **Candidate B (a `Job` above `Project`).** Rejected twice. Take it only when *"the same subjects
  through a different template"* arrives from real work rather than from analysis.
- **`Template.preserve`.** Ruled out 2026-08-14 — see §3.1(a).
- **Widening the control-surface bind, an image API, multi-tenancy, a `RunConfig` settings panel.**

---

## 6 · Not recovered — reported as unknown, not as absence

**A sweep that finds nothing proves the search missed it, never that the discussion did not happen.**

| # | What | Status |
|---|---|---|
| 1 | **2026-08-14 on Roamy** | **Confirmed absent, not unknown.** Every `*.jsonl` in the ImageDrip project dir was enumerated by real in-transcript time (21 files, none between 11 Aug 20:35 and today), and all project dirs swept for ImageDrip mentions. The design session was on the M4 |
| 2 | **2026-08-03 → 08-05 on Roamy** — the whole v3 template / brand-repo vocabulary | **Gap, M4-shaped.** The v4 plan *authoring* is also absent here: `585d9a5` and `3fbe28a` landed before the first local transcript of that day. Roamy holds the **execution**, not the design |
| 3 | Discussions in **Codex, Open Design, or ChatGPT itself** | Not swept. Jan works in Open Design and the design session reviewed *his* artifacts — if he recorded rationale there, it is outside everything checked |
| 4 | The **other three machines** (M2, mac-mini-jan, mac-mini-mary) | Not swept |
| 5 | Whether **`~/dev/image-projects/` should exist on Roamy** | It **does not exist here**. The M4 has five `i-*` dirs, 7 files, six `ji*` jump aliases, no git. The research doc's §4.5 layout is marked `[exists]` on the strength of an **M4-only check**, while Roamy is the declared source of truth for media. **Which machine is right is unresolved** |
| 6 | Whether **ChatGPT summarises or truncates a long conversation** — and so whether lime/lemon was a compression artefact | Hypothesis, not finding. The page 403s |
| 7 | The **live paste probe** and the **chunk experiment** | Prepared, never run. §5 item 2 |
| 8 | Whether the **packaged app can spawn its MCP proxy from inside `app.asar`** | Never tested. `npm run package` has never been run |
| 9 | Whether the app has **genuinely not run since 08-11** | Inferred from the absence of a log file after `imagedrip-2026-08-11.log` and `domain.json` last written 08-11 20:33. The log tee shipped 08-09, so the gap is meaningful — **but a launch that failed before the logger initialised would look identical** |

**Two closed by this pass, both previously listed as unanswerable:**

- **The `appydave-image-projects` GitHub org exists.** Created **2026-08-14T02:21Z** — six minutes
  before the design session opened. It is **completely empty**: 0 public, 0 private, 0 owned-private
  repos. The estate was staked out and never used. *(The earlier note that "an absent org and an
  empty org look identical from here" no longer applies — this was queried directly.)*
- **`~/dev/image-projects/` does not exist on Roamy.** See #4.

### Two attributions that are inferred, not proven

- **The North Star interview session.** `d4ded7d` names `session_01Q52kiMarM7r3yYoxt2eMz7`, which
  resolves to **no local UUID**. `51bdcf64` was identified as the authoring session by **content and
  timing** — strong, but inferred. Cite it that way.
- **Chat as the default tab** (2026-08-08, `23dd822`). The agent asked which tab David wanted, **he
  never answered in prose**, and it shipped Chat-default under the Star's authority. It inverted the
  drafted spec. It may well be right; it is not on the record as a ruling.

### Method note — the tools, and one deviation from the read-only brief

**`sesh:session-recall` ran and was inadequate** — it missed five of six substantive Roamy sessions,
including the North Star interview, because David rarely types "imagedrip" while sitting *inside* the
ImageDrip repo, so the term scores only at the weakest tier. **`sesh:session-archaeology` could not
run at all**: it requires the `Workflow` tool, which is not available inside a subagent. The sweep
fell back to direct enumeration plus whole-corpus grep with in-transcript timestamps. Worth fixing in
the skills, not here — a recall that misses the highest-value session in the window is a recall you
would have trusted.

**A red herring I introduced:** I passed the sweep four session ids from this machine's registry
(`imagedrip-swag`, `imagedrip-orc`, and two others). Those are **Remote Control ids in a different id
space** and appear nowhere on disk. Resolved by name, `imagedrip-orc` and `imagedrip-swag` are
**28–30 July** — a Swagger/Chaperone build program, not this discussion.

The M4 sweep was briefed read-only. It **created one file on the M4** — `/tmp/x_id_hits.txt`, via a
shell redirect — and self-disclosed it immediately; every subsequent command was read-only. Nothing
under `~/dev` or `~/.claude` was touched, and the file is still there because deleting it is also a
write. Recorded here rather than quietly dropped, because a report that hides its own scope breach
is exactly the kind of thing this repo refuses everywhere else.

---

## 7 · Verified in the running app — 2026-08-19

The app was started (`npm run dev:clean`) for the first time since 2026-08-11 and driven through the
loopback control surface. **Nothing was fed to ChatGPT**; `run.start`, `run.pause`, `run.resume`,
`run.stop` and `prompts.clear` were not called.

### Established

| # | Claim | Evidence |
|---|---|---|
| 1 | Typecheck clean, **462/462 tests pass** | `npm run typecheck`, `npm test` |
| 2 | The app boots and publishes its surface | `control.json` written at **mode 0600**, port 7180, 64-hex token |
| 3 | **Phase 0.1 is proven in the app** — the acceptance criterion `5f80eca` said was *"NOT yet proven"* | `GET /v1/health` → `{"ok":true,"version":"0.1.0","running":false}` |
| 4 | Auth is enforced | unauthenticated `POST /v1/call/domain.get` → **401** |
| 5 | **The published surface is 33 verbs**, not the 35 the v5 doc quotes | `GET /v1/verbs` |
| 6 | `context.get` answers with live state and engine readiness | returned active brand/template/project/mode + `engine:{ready:true}` |
| 7 | **`Template.promptShape` persists through the surface** | `template.save` → on disk verbatim, incl. the `\nScene: {prompt}` newline |
| 8 | **The shape renders exactly as designed** | `renderPrompt()` run against the live store: each of 3 queue rows → recipe + `Scene: <the queue line>` |
| 9 | **The primer is unchanged by the shape** — the back-compat property | `domain.compose-primer` returns brand + template body, no shape |
| 10 | **`Project.brandId` travels** (Item 3, `82d9dde`) | new project came back carrying `brandId: copilot` |
| 11 | **Phase 0.2 is live** — a forensic trail exists | `logs/imagedrip-2026-08-19.log` captured the whole session, including `control surface listening` |
| 12 | **Phase 1 (1e) holds** — both unguarded preload paths are gone | `src/preload/index.ts:126` carries only a comment |
| 13 | `renderPrompt`'s three rules are unit-covered | `test/domain-compose.test.ts:221-271` |

### Not established — and two need a human, not more work

- **No image has been generated.** The feed path, the harvest gate, the manifest's `outcome:'open'`
  write and the run-completes-truthfully fix **all require a real `run.start`**, which is David's to
  press. Everything above is the configuration half.
- **`reprimes: []` still stands** — now on **five** manifests, not three. And the mechanical reason
  is established: default `chunkSize` is **18**, the boundary fires on `harvested % chunkSize === 0`,
  and **the longest run ever queued 15 prompts**. The re-prime has never been *reachable*.

### Two things found in passing

- **`domain.get`'s `templates[]` is a switcher list — `{id, name}` only.** Reading it to check a
  field returns nothing and looks exactly like the field being unset. The active template's full
  record is at `result.template`; **there is no verb that returns a non-active template's fields**.
  An agent asked *"does template X have a shape?"* cannot answer it for any template but the active
  one. Named, not fixed — it is a surface gap, and surface changes wait on R16.
- **`subject` is the first three words of the prompt.** `"a woman and a cat"` → subject `"a woman
  and"`. Harmless with a `{prompt}` shape; **a `{subject}` shape would render that verbatim.**
  Pre-existing (`parsePromptList`), and the same weakness the research doc names for lime/lemon.

### Left in the store, for David to clear

A project and template both named **`Verify PromptShape 0819`**, carrying the comic-page shape and a
3-prompt queue, and left **active** so it is visible on opening the app. Its output dir
`~/Pictures/ImageDrip/verify-promptshape-0819/` was created and git-initialised, and holds no images.
Say the word and I will delete all three.

---

## 8 · The one-line version

**The thinking is not lost — it is in `docs/research-imagedrip-architecture.md`, and it is waiting
on rulings and on one afternoon of measurement. The app has now been started and the two unexercised
commits check out (§7). What is left that unblocks the most is not code: it is
[`rulings-open.md`](rulings-open.md) — fifteen decisions, one sitting — and
[`phase-0-checks/RUNBOOK.md`](phase-0-checks/RUNBOOK.md), which proves whether the re-prime fires
at all.**
