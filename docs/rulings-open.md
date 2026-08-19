---
doc: rulings
project: imagedrip
status: OPEN — awaiting David. Every row is a decision; none of them is mine to make.
created: 2026-08-19
purpose: turn §8 of research-imagedrip-architecture.md into one sheet that can be ruled in a
  single sitting without opening another file
source: docs/research-imagedrip-architecture.md §8, minus three questions that are no longer open
authority: docs/north-star.md
---

# Open rulings — the whole list, in one place

**How to use this.** Every row is self-contained: the question in plain words, what it blocks, a
recommendation, the one reason that carries it, and what would change my mind. **You do not need to
open another file to rule any of these.** Write your answer next to it, or say it out loud and let
an agent write it — the ruling matters, the format does not.

**Ordered by what unblocks the most**, not by the order they were raised.

**Three of §8's questions are gone, not carried:**

| Was | Why it is not here |
|---|---|
| **Q7a — adopt `Template.preserve`?** | **You rejected it on 2026-08-14.** *"The goal was never short prompts… quite often what you're doing is setting up the recipe of what a prompt looks like."* The ask was withdrawn in the same conversation — *"I called it a founding assumption and asked you to reverse it. That was me inflating a comment into a principle."* `Template.promptShape` shipped instead and does the job better |
| **Q9 — test whether ChatGPT Projects carry the look?** | **Ran 2026-08-14. Answer: NO.** A Project carries the *task convention* (inside it a bare noun meant "make an image") but **not the look**. Pointing ImageDrip at a Project URL is dead as a drift fix |
| **Q16 — guard or delete the two unguarded preload paths?** | **Done.** Both bridges deleted in Phase 1 (`3a701bd`). Verified on this machine 2026-08-19 — `src/preload/index.ts:126` now carries only a comment saying they are deliberately not bridged |

---

## Tier 1 — the model. Everything structural waits on these three.

### R1 · Does a `Run` gain a `Segment` beneath it, and become reopenable?

**Plain words.** Today a "run" is one press of Run. Stop it and start again and you get a *second*
folder with a *second* manifest, and nothing on disk says they belong together. The proposal is:
one **Run** = one deliverable = one folder, which can be **reopened** and continued; and inside it,
one **Segment** per ChatGPT conversation, each recording the primer as actually posted.

**Blocks.** R2, R3, resume, `run.reseat`, the folder layout, and every UI question about what a
"runs" list shows. This is the load-bearing choice — nine other rows assume an answer.

**Recommendation: ratify it.**

**The one reason.** Your own output already shows the problem, before anyone asked for resume: nine
smoothie images sit across **two** folders described by **two** partial manifests, and three of the
five manifests on disk carry no `outcome` at all. *"Come back to the original run"* currently has
nothing to come back to. A Segment record adds **no operator-visible control** — it is a record, not
a screen — so it costs nothing against the Star's test.

**What would change it.** If you want *"the same twelve subjects through a different template"* to be
one deliverable, this shape cannot express it and a `Job` container above `Project` can. That case
has been rejected twice for adding a fourth axis to a three-chip product — but it is a real
capability, and if it turns up in actual work rather than in analysis, reopen it.

---

### R2 · What is the segment called?

**Plain words.** You ruled *"theme" → "flow"*. But you also floated `▶ Run flow` as the button
label. If a "flow" is both the button and the conversation-segment, one word does two jobs.

**Blocks.** R1's implementation, every doc written after it, and the UI.

**Recommendation: keep `▶ Run` for the button, and give the segment a different word.** `Leg`,
`Pass` and `Session` are all free. My pick is **`Leg`** — a run has legs, they happen in order, and
nothing else in the product uses it.

**The one reason.** This is the exact failure `Template` was extracted to fix: one word carrying two
meanings, discovered late. It costs a sentence now and a refactor later.

**What would change it.** If "flow" is load-bearing for how you'll talk about this on video, keep it
for the segment and rename the button instead. Either split works; both-the-same does not.

---

### R3 · Is `Theme` retired, or renamed?

**Plain words.** `Theme` is a `{name, prompts[]}` wrapper, exactly one per project, and its name is
used for **nothing** except minting the run-id string. It is not a concept; it is a leftover.

**Blocks.** R1's data shape, and the vocabulary in every doc.

**Recommendation: retire it.** The queue belongs to the project; the run-id takes the project's name.

**The one reason.** Renaming it to "flow" would preserve a concept that carries no information —
and would burn the word you need for R2.

**What would change it.** If you want one project to hold several named prompt-lists you switch
between, `Theme` is the thing that would become that. Nobody has asked for it.

---

## Tier 2 — the drift strategy. One is already turnkey.

### R4 · Run the chunk-size experiment?

**Plain words.** Does the look drift *within* one conversation, or *between* conversations? These
need **opposite** fixes, and nobody has measured which one you have.

**Blocks.** R1's confidence, the whole reference-image question (R5), and Phase 3.

**Recommendation: yes — and it is now a runbook, not a project.** `docs/phase-0-checks/RUNBOOK.md`.
One sitting, three arms, one command each.

**The one reason.** **The chunk-boundary re-prime has never fired. Not once.** `reprimes: []` on all
five manifests on disk — and now the mechanical reason is known: the default `chunkSize` is **18**,
and your longest run ever queued **15** prompts (of which 9 harvested). The boundary has never been
*reachable*, so the anti-drift mechanism the Segment model is built on has zero production evidence.
Arm 1 at `chunkSize: 6` over 24 prompts forces three boundaries and settles it.

**What would change it.** Nothing short of you deciding drift is not a real problem for the work you
actually ship. If that is the call, say so — it deletes R5 as well, and that is a big saving.

---

### R5 · Authorise a reference-image paste path?

**Plain words.** At a conversation boundary, paste one or two images from the previous conversation
so the new chat can *see* the look rather than read a description of it. It touches the one surface
this repo guards hardest.

**Blocks.** Nothing else — but it is the largest single piece of drift work on the table.

**Recommendation: authorise it *in principle*, and hold the build until R4 reports.**

**The one reason.** The Electron half is **proven**: `clipboard.writeImage()` through the same
`wc.paste()` that `feed()` already uses delivers a real `image/png` file to the composer as trusted
input, and the attachment chip survives a subsequent select-all. What is **not** proven is anything
about ChatGPT — the live probe has never run, and *"a stand-in that behaves as expected and a ChatGPT
that does not are indistinguishable from here."* The live probe is in the same runbook as R4.

**What would change it.** If R4 shows drift is **intra**-conversation, reference images at the
boundary fix the wrong problem and this drops down the list — the fix would be per-prompt, not
per-boundary. That is precisely why R4 comes first.

---

## Tier 3 — the estate. Where files live.

### R6 · Ratify the folder layout?

**Plain words.** `~/dev/image-projects/` (a container, not a repo) → `i-<brand>/` (**the git repo
boundary**) → `templates/` + `projects/<project>/` → `runs/` + `exports/`. Project folders lose their
date prefix; run folders keep theirs. Image filenames gain the queue index.

**Blocks.** R7, R8, R9, the `repo.attach` fix, and export.

**Recommendation: ratify it.** It confirms Option B's shape and keeps Option A's dated run folder as
the leaf.

**The one reason.** Most of it is already written — `repo-store.ts` writes exactly this layout, and
`index.ts:319` already refuses to `git init` inside a brand repo. **The gap is binding, not design.**
One detail earns its place on its own: `<nn>-<subject-slug>.png` fixes a live silent failure — today
two queue rows with the same subject in one run produce **one file** while the manifest claims both
were harvested.

**What would change it.** If image projects should live beside video projects under a different root
than `~/dev/`, the container moves and everything below it still holds.

**⚠️ One thing to know before ruling.** `~/dev/image-projects/` **exists on the M4 with five `i-*`
directories, and does not exist on Roamy at all** — and Roamy is your declared source of truth for
media. The layout was checked on the M4 only. **Which machine is right is itself part of this ruling.**

---

### R7 · Do generated images go in git?

**Plain words.** This **reverses your own decision of 2026-08-04**, which said yes.

**Blocks.** R6's `.gitignore`, and how big the estate gets.

**Recommendation: no — ignore `runs/**/*.png`.**

**The one reason, measured on your disk today:** `smoothies` holds **9** images and a **7.2 MB**
`.git`; `12-days-of-claudmas` holds **3** images and a **5.0 MB** `.git`. That is roughly 12 MB of
history for 12 pictures, and it grows with every run forever. The manifest already records
provenance; git adds nothing a manifest does not.

**What would change it.** If a client ever needs to receive a project *with* its images by cloning
one repo, the answer flips — but that is distribution, which the bearing says is not next.

---

### R8 · `i-shared` — resurrect it, or not?

**Plain words.** A shared repo for templates that belong to no single brand. Created and deleted on
2026-08-14. Two of your own decisions disagree about it ten days apart.

**Blocks.** R6's completeness, and where a universal template lives.

**Recommendation: do not resurrect it.** Put shared templates in `~/dev/media-shared/templates/`.

**The one reason.** Templates are **already global** in the schema — a top-level array, unscoped. A
shared *repo* solves a scoping problem the code does not have, and adds a second place to look for
the same object.

**What would change it.** If R11 goes the other way and templates become brand-scoped, a shared repo
becomes the only home for a universal template and this flips.

---

### R9 · What happens to the 29 orphaned harvests?

**Plain words.** `<userData>/harvest/` holds **29 files, 76 MB**, unattributable to any run — and
they are currently load-bearing as a thumbnail fallback.

**Blocks.** Nothing structural. It is a deletion, and deletions are yours.

**Recommendation: keep them until R4 is done, then delete.**

**The one reason.** They are the only image corpus that exists outside a run folder, and the drift
metric has never been calibrated against a case you actually called drift. After R4 you will have a
controlled corpus and these stop being the only evidence.

**What would change it.** If any of them are images you care about, they are unattributable — nothing
will tell you which run made them. Rescue anything you want *before* the delete, not after.

---

## Tier 4 — needed, but nothing waits on them.

### R10 · Amend the Star's test with a precedence rule?

**Plain words.** The test says *"more images, less touching"* **and** *"if it adds a control to
learn, it does not fit."* Both halves fire on the same feature and the Star says which wins for
neither.

**Recommendation: yes — state that the parity clause wins when a control performs a step the app
already performs.** That is the reading you already ruled on 2026-08-10; it is just not written as a
precedence rule.

**The one reason.** Without it, every UI proposal re-litigates the same argument, and the argument
has already been settled once in your own words: *"you cannot test what you cannot drive yourself."*

**What would change it.** If you would rather judge case by case, leave it — but expect the argument
to return with each new control.

---

### R11 · Global templates, or brand-scoped?

**Plain words.** You parked this yourself.

**Recommendation: leave them global; use brand tone as the override channel.**

**The one reason.** They are already global, it is already shipped, and it is free. **The
350-template scale problem is created by the brand-scoped mock, not solved by it.**

**What would change it.** A real brand whose templates must never be visible to another brand.

---

### R12 · One prompt → many images?

**Plain words.** A product card for `mango` needs one main image plus N variations, and N differs
per subject. Today one prompt means one image.

**Recommendation: not yet — and not until R1 is ruled.**

**The one reason.** It changes the harvest gate, which is the mechanism that decides which image
belongs to which prompt. That gate is *already* the subject of a known correctness hazard around
resume. Changing it twice, in two directions, before either is settled is how you get a wrong image
under a right filename.

**What would change it.** A real workload that needs it. Say which one, and it moves.

---

### R13 · Invert `isExposed()` from a denylist to an allowlist?

**Plain words.** Today any new `imagedrip:*` channel is agent-facing the moment it is registered
unless someone remembers to deny it. Exposure is **opt-out**.

**Recommendation: yes, but it is no longer urgent — and say so honestly.**

**The one reason.** The denylist has already leaked exactly one verb, and it was the worst possible
one: `chat.gate-decide`, the channel that **answers the human confirmation dialog**, was published
for three days and sat in the constrained agent's own allow-list. It is now denied *and* the whole
published set is pinned by a test that fails when it changes — so the accident cannot repeat
silently. An allowlist would make it structurally impossible rather than test-caught.

**What would change it.** Nothing much. This is a "when convenient", and the pinning test already
buys most of the safety.

---

### R14 · Re-base Jan's mock on the current build?

**Plain words.** The mock was drawn against a version of the app you had not used since 2026-08-11,
and it **drops a control that shipped on 08-10** — the per-row `⚡ inject` button.

**Recommendation: yes, before more design time goes into it.**

**The one reason.** Three of the four problems the design session raised were already solved in the
code. Without a re-base, the next session re-solves them again.

**What would change it.** Nothing — this one is just a message to Jan.

---

### R15 · Show mode-conditional controls disabled rather than absent?

**Plain words.** The manual `⚡ inject` buttons render only in Dial-in mode, and the app **defaults to
Auto**. So the app's default state hides its own parity controls.

**Recommendation: yes — render them disabled, with a reason.**

**The one reason.** *"A mode is a cursor position that lasts longer."* This is the same defect as the
hover-only button you already ruled against on 2026-08-10, and it is why the parity gap keeps being
rediscovered by people looking at the running app.

**What would change it.** If the disabled controls make Auto mode look cluttered on video, a single
"show manual steps" toggle does the same job.

---

## Addendum — one ruling that is not in §8

**Flagged separately because it did not come from the research document.** Recovered from the
2026-08-11 transcript, where you ruled the agent-first conclusion: *"not 'build a sidecar.' Reshape
the verbs into capabilities, and move authorization beneath the adapter. The server is done."*

Two of the three gaps named that day shipped the same day. **The third never did, and no document
tracked it:**

### R16 · Reshape CRUD verbs into intention-shaped ones?

**Plain words.** The surface is `domain.save-project`, `template.save`, `brand.switch` — shaped like
the database. Intention-shaped would be *"start a new look for this brand"*, *"queue this list"*.
The same ruling named three fields missing from **every** contract: `previousValue`,
`idempotencyKey`, `dryRun`.

**Recommendation: do the three fields; leave the reshaping alone for now.**

**The one reason.** The fields are cheap and one of them is a prerequisite for fixing `repo.attach`
safely — you cannot preview a publish that has no preview form, and today **one verb out of 33 has a
dry-run**. The reshaping is a refactor of a working surface that produces no additional image, and
you already framed agent-first as a *"graded bet"* with *"recipes come later"* — which reads as a
deliberate go-slow, not an oversight.

**What would change it.** A second real agent client that finds the CRUD shape hard to drive. There
is one client today.
