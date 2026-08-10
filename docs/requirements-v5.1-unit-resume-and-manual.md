---
doc: requirements
project: imagedrip
status: PROPOSED — analysis only, nothing built. For David's ruling.
created: 2026-08-10
purpose: re-sequence Phase 1 around three requirements David raised on 2026-08-10
supersedes: Phase 1 of requirements-v5-unattended-and-portable.md (§3). Phases 0, 2, 3 and 4 stand.
authority: docs/north-star.md — bearing ruled 2026-08-09 (unattended leads, distribution follows)
---

# v5.1 — the unit, the resume, and the manual path

**Status: proposed.** No production code was written in the pass that produced this. Phase 0.1
(`running` after a completed run) and 0.2 (the log file) are done and pushed; **0.3 is still open**
and turns out to be load-bearing for Item 1 — see §2.4.

David raised three things on 2026-08-10. Two of them are **largely already built** under other
names, and the single most useful result of this pass is saying which parts those are, so we do not
pay twice.

---

## 0 · The short version

| | Ask | What actually exists | What is genuinely new |
|---|---|---|---|
| **1** | Interrupt a run, do something else, come back and continue | The **queue** resumes today, by accident and correctly | The **run** does not — a new folder, a new manifest, and a de-dupe gate with no memory |
| **2** | A button for every automated step | **The mechanism is fully built** — `⚡ Initialise project` and a per-prompt `⚡ inject`, both through the proven `feed()` path | Only that the buttons are behind a mode switch and appear **on hover** |
| **3** | Select one thing and the whole configuration moves | A project **already** carries template + subject + prompt list + output folder, and switching it moves all four | The **brand** is the one axis that does not move — exactly the `Project.brandId` gap named in v5 §1.1 |

**None of the three needs a new writer on the ChatGPT webview, and none needs `NEVER_EXPOSED`
touched.** Item 2 in particular is renderer-only: `run.inject-primer` and `run.inject-prompt` are
already in `NEVER_EXPOSED` (`verb-policy.ts:77–79`) and stay there — they are buttons, not verbs.

---

## 1 · Item 3 — the unit (taken first, because the other two depend on what a run belongs to)

### 1.1 What is actually on disk

`ProjectRecord` (`src/main/domain-migrate.ts:30`) is `{ project, theme }`:

```
ProjectRecord
├── project.body        the SUBJECT text
├── project.templateId  → the recipe
├── project.outputDir   → where images land
└── theme.prompts[]     the prompt list
```

`activeTemplate()` (`domain-store.ts:123`) derives the active template **from the active project's
`templateId`**. So `project.switch` **already moves four of the five things** David listed: recipe,
primer subject, prompt list, output folder.

**The brand does not move.** `activeBrandId` is a separate top-level field on the document
(`domain-migrate.ts:47`), owned by nobody in particular.

### 1.2 Why it *feels* like nothing moves as a unit

The three dropdowns look like peers and have **three different meanings**:

| Control | What it actually does |
|---|---|
| Brand | Switches a **global** setting, independent of everything else |
| Template | **Edits the active project** — `switchTemplate` repoints `project.templateId` |
| Project | Switches the **whole unit** |

That is the incoherence. The template dropdown is not a switcher at all; it is a property editor
wearing a switcher's clothes. Change brand → one thing changes (true, and it is the *only* control
where that is true). Change template → you have silently modified the project you are looking at.

### 1.3 The unit already has a name, and it is `Project`

Two shapes were considered:

- **(a) Add `brandId` to `Project`.** The unit becomes brand + recipe + subject + prompts + folder.
  Selecting a project moves all five. Brand and template become **properties of the selected unit**,
  displayed and editable, not sibling switchers.
- **(b) Introduce a new container** ("Set" / "Job" / "Stack") that references all three.

**(a), decisively.** (b) adds a concept to learn, which is the Star's stated failure condition, and
it would leave `Project` still doing most of the job. (a) is also the fix v5 §1.1 already named, and
it is the **root cause of the `repo.attach` defect** — attach publishes unsourced records stamped
with whichever brand is *active*, because a project carries nothing to route with. Fixing this
unblocks v5 Phase 2.2 as a side effect.

**Open, and David's to name:** whether the selector keeps the word *Project*. It is accurate but
overloaded — the record holds a subject body *and* is the unit. "Set" or "Job" may read better on the
video. This is a label, not a model change, and can be decided last.

### 1.4 The migration — and a flaw in the one v5 proposed

v5 §2.1 proposed inferring `brandId` **from the active brand at upgrade time**. Checked against the
live store, that rule is wrong:

```
activeBrandId: appydave

smoothies              22 prompts,  9 harvested   — body is verbatim Beauty & Joy
12-days-of-claudmas     3 prompts,  3 harvested
probe-spring-nails-*   ×6, 12 prompts each, 0 harvested, output in /var/folders/…
```

Inferring from the active brand would stamp **every** project `appydave`, including the one project
whose brand is unambiguous from its own text. It would then be indistinguishable from a real choice.

**Proposed instead: `brandId` is optional and starts UNSET.** This matches the pattern the codebase
already holds itself to twice — `templateId` undefined means "no template", and `activeBrand`
*refuses to substitute* `brands[0]` because *"a wrong brand is worse than a missing one — a missing
one is visible in the card as `(none)`"* (`domain-store.ts:105–115`). Guessing here would break the
rule that file already states. An unset unit shows `(none)` and takes a brand the first time one is
chosen for it.

**Blast radius is small and cheap right now:** 6 of the 8 projects and 5 of the 7 templates are
`chat:probe` litter pointing at temp folders. The migration is at its cheapest before that changes.
*(This document does not propose deleting any of it — the litter is David's to clear.)*

---

## 2 · Item 1 — interrupt and resume

### 2.1 What already works, and is not an illusion

`markHarvested` persists `status: 'harvested'` to `domain.json` per image, and `startInner()`
re-snapshots `getQueue()` filtered to `status === 'queued'`. So **stopping and restarting already
continues from where it left off, prompt-wise.** Going off to run a different project and coming
back works too: the queue is per-`ProjectRecord`, so it is still sitting there.

That half is real. It is not a lucky accident either — it falls out of harvest being persisted
per-image rather than at the end.

### 2.2 What is an illusion

**A "run" is not resumable — only the queue is.** `recorder.start()` mints a fresh
`YYYY-MM-DD-HHmm-<theme>` run id on every start, so continuing after a stop writes a **second run
folder with a second manifest**, and nothing on disk connects them.

This is already visible in David's own output, before anyone asked for resume:

| Folder | Outcome | Harvested |
|---|---|---|
| `smoothies/2026-07-28-1150-smoothies` | *(none)* | 7/10 |
| `smoothies/2026-08-03-1446-smoothies` | *(none)* | 2/15 |
| `12-days-of-claudmas/2026-08-07-2103-…` | *(none)* | 0/3 |
| `12-days-of-claudmas/2026-08-07-2133-…` | complete | 3/3 |

Nine smoothie images across two folders, described by two partial manifests, three of the four
carrying no outcome at all. "Come back to the original run" has nothing to come back **to**.

### 2.3 🔴 The correctness hazard — resume is not merely missing, it is unsafe

The de-dupe gate that decides which image belongs to which prompt is `seen`, an **in-memory** set
(`batch-runner.ts:77`). It is cleared on a `fresh` entry and kept on `continue` — but only for the
life of the process.

The code says why it exists, in its own words: *"On 'continue' the chat still holds earlier images
(hand-made or prior runs) whose srcs can re-fire — the seen set (incl. WP4 passive learning) is what
stops mis-attribution."*

So: **stop a run, quit the app, come back tomorrow, and continue into that conversation — and the
gate has no memory of any image already in it.** A re-fired src from yesterday can be harvested and
filed under today's prompt. That is a wrong image under a right filename, with a manifest that
asserts it: a run that did not deliver looking exactly like one that did. It is the rule this repo
holds itself to, broken by the very feature being asked for.

**Persisting `seen` per run is therefore a prerequisite of resume, not a refinement of it.**

### 2.4 The other three things a resume has to carry

| | State | Note |
|---|---|---|
| Run id / folder / manifest | ❌ new one every start | Needs the recorder to be able to **reopen** an existing run rather than only mint one |
| The conversation | ⚠️ conditional | `entry: 'continue'` uses whatever the single webview is currently on. Go and run a different project in between and that is a different conversation. Returning to the original chat would need a new harness capability (navigate to a stored conversation) — **flagged, not proposed**, since it touches the webview |
| `outcome` on the manifest | ❌ often absent | 3 of 4 real manifests have none. **This is v5 Phase 0.3**, still open, and it is what makes an interrupted run unreadable |
| Timings / cadence / stall budget | ✅ reset per run, deliberately | Correct as-is — a resumed run re-learns |

Phase 0.1's `completeRun()` does not obstruct any of this; it clears the same state `stop()` does,
and `seen` is untouched by both, as intended.

### 2.5 What Item 1 therefore is

1. **0.3 first** (already open) — an interrupted run must leave a truthful `outcome`.
2. **Persist `seen` per run** — the safety precondition (§2.3).
3. **Reopen a run** — `run.start` can continue an existing run id, appending to its folder and
   manifest, instead of always opening a new one.
4. **Open question for David:** returning to the *original conversation* after running something
   else. Everything above works with a re-prime into a fresh chat. Navigating the webview back to a
   stored conversation is a new capability on the one surface this repo guards hardest, so it is
   named here and not assumed.

---

## 3 · Item 2 — a button for every automated step

### 3.1 It is built. All of it.

| Step | Button | Where |
|---|---|---|
| Post the primer and submit it | **`⚡ Initialise project`** | `App.tsx:251–258` |
| Feed ONE queued prompt and harvest its image | **`⚡ inject`**, per row | `App.tsx:2329–2337` |

Both go through `injectPrimer()` / `injectOne(promptId)` (`batch-runner.ts:294`, `:313`) and
therefore through the **same proven `feed()` path** the Auto loop uses — clipboard → click → paste →
Enter, with the same delivery verification, the same `awaiting` + `seen` gate, the same harvest, into
a real dial-in run record. This is not a parallel mechanism; WP4 built it as the manual complement.

**So the requirement "every automated step must also be a button a person presses" is already
satisfied in mechanism.** Nothing needs to be written that touches the webview.

### 3.2 What is actually wrong — it cannot be demonstrated

Two presentation faults, and for a video they are fatal:

1. **The per-prompt button is `hidden … group-hover:inline-block`** (`App.tsx:2334`). It replaces the
   row number **on hover**. On camera, a control that only exists where the cursor is does not read
   as a control at all — the audience sees a number turn into a button and back.
2. **Both buttons are behind the Dial-in / Auto mode switch.** In Auto mode the per-row button is not
   rendered and `⚡ Initialise project` is replaced by `▶ Run theme…`. The manual path is a *mode you
   must already know about*, not a visible alternative.

There is also a third, milder one: today's **Copy primer** / **Copy prompt** cards (`App.tsx:1008`,
`:1014`) leave the paste and the Enter to the human — so the rail currently shows the *half*-manual
path prominently and hides the *fully* manual one.

### 3.3 ⚠️ This is the first ask that argues with the North Star's own test — surfacing, not resolving

The test is: *does it get more images of a given style out, with less of the operator touching it?*
**A button is more touching, not less.** Read literally, Item 2 fails the Star's test, and the Star
says *"if it adds a control to learn, it does not fit."*

Two defences, both real, neither one mine to accept:

- **The demo constraint is a genuine requirement.** ImageDrip has to be shown, and the story is
  *"systematise, not automate."* A product that can only be demonstrated as autopilot cannot be
  demonstrated the way David intends to sell it. That is a product requirement, not a feature whim.
- **A fully manual mode is the SAFEST mode this app has.** The whole ToS mitigation is human-paced
  feeding, one prompt at a time, with a live STOP (`verb-policy.ts:60–64`). One-prompt-per-press *is*
  that mitigation, driven by an actual human. Making it prominent strengthens the account-safety
  story rather than weakening it.

A third framing worth putting on the table: making the manual path **visible** is not the same as
making it the default. The buttons already exist; this is about whether they are discoverable. Under
that reading nothing new is added to learn, and the tension mostly dissolves — but that is a reading,
and David should be the one to take it.

**This document does not rule on it.** It is recorded because a plan that quietly overrode the Star's
own test would be worse than one that argued with it in the open.

---

## 4 · Recommended order

**2 → 3 → 1**, with 0.3 folded in beside 2.

| # | Work | Why here |
|---|---|---|
| **First** | **Item 2** — surface the manual path | Smallest by a wide margin: CSS, a conditional and some labels. No model change, no migration, no webview change. It unblocks the video, which is the only item with an external deadline shape. Doing it first also means everything after it can be demonstrated as it lands. |
| **alongside** | **0.3** — an interrupted run writes an `outcome` | Already-open Phase 0 debt, small, and a hard prerequisite for Item 1. Doing it next to Item 2 keeps Item 1 clean. |
| **Second** | **Item 3** — `Project.brandId` and the unit | Must precede Item 1: "resume *the run*" has no stable meaning until what a run belongs to is settled. It is also cheapest **now**, while 6 of 8 projects are disposable litter — every real project created before this lands is one more record needing a real answer. Unblocks v5 Phase 2.2 (`repo.attach`) for free. |
| **Third** | **Item 1** — interrupt and resume | The largest, and the only one with a correctness hazard (§2.3) rather than a gap. Built on a settled unit and a truthful manifest, it is a contained job; built before them, it is a moving target. |

**Where I disagree, in one sentence:** David ranks Item 3 as mattering most and I agree it is the
most *important*, but I have still put Item 2 first because it is hours rather than days and clears
the only deadline-shaped constraint in the set — if that reasoning does not hold, Item 3 first costs
nothing to reorder.

**What is NOT in this plan, deliberately:** the v5 Phase 1 items it supersedes — `RunConfig.limit`,
interpolation variables, the end-of-run notification, retiring the LIST PROMPT card, `prompt.update`.
They remain valid and unbuilt. `limit` in particular is now *more* motivated, because "run three of
these" and "stop and come back" are the same user story from two directions — but it should follow
Item 1 rather than precede it.

---

## 5 · Open questions this pass did not guess

1. **Item 2's tension with the Star's test** (§3.3) — David's to rule, not this document's.
2. **Does the selector keep the word "Project"?** (§1.3) A label, decidable last.
3. **Should resume return to the ORIGINAL ChatGPT conversation** (§2.4), which needs a new webview
   navigation capability — or is a re-prime into a fresh chat sufficient?
4. **Which project should be active**, and what becomes of the probe litter. Still unanswered from
   2026-08-09; the app is down and `Probe Spring Nails 08:14:21` is active with an output folder in
   `/var/folders/…`. Untouched on purpose.
