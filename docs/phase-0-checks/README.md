---
doc: phase-0-checks
project: imagedrip
status: PREPARED — awaiting David. Nothing here is a result until §Results says so.
created: 2026-08-14
purpose: three checks that can invalidate Phases 2 and 3 before they are built
pairs_with: ../research-imagedrip-architecture.md
---

# Phase 0 — three checks, no code

**Why this exists.** Three of the decisions downstream rest on things nobody has ever
observed. Two of them are an afternoon of *testing*, not building, and either can cancel
or double a phase. **Do these before Phase 2 and Phase 3.**

| Check | Question | If YES | If NO |
|---|---|---|---|
| **0a** | Do ChatGPT **Projects** carry the *look* across separate conversations? | **Phase 2c is cancelled** — the platform does the carrying | 2c stands; reference images are the mechanism |
| **0b** | Does ChatGPT's composer accept a **pasted image**? | Reference images are ~10 lines on a verified pipeline | 2c needs CDP `DOM.setFileInputFiles` — **roughly doubles** |
| **0c** | Does the **chunk-boundary re-prime** actually fire, and what does drift look like? | Phase 3's Segment model has ground to stand on | Phase 3a is modelling something that has never happened |

**Everything in Phase 3 assumes the re-prime works.** It has never run: `reprimes: []` on
all three real manifests. **0c proves the mechanism before anything is built on it.**

---

## 0a · Does a ChatGPT Project carry the look? — 15 minutes, by hand

**No code. No probe.** This is the highest-leverage check in the set because a YES deletes
work rather than creating it.

**Background:** ChatGPT Projects are documented to give *"project-only memory"* — chats can
reference other conversations within the same project. Whether that carries **visual style**
is nowhere documented. That gap is the whole question.

### Protocol

1. In ChatGPT, create a project — call it `imagedrip-drift-test`.
2. **Inside the project**, open chat **A**. Post a primer with a distinctive, specific look.
   Use a real one — the Beauty & Joy brand body from ImageDrip is ideal, because a vague
   primer makes a NO uninformative.
3. In chat A, generate **`lime`**. Keep it.
4. **Inside the same project**, open a **new chat B**. **Post no primer at all.**
5. In chat B, generate **`lemon`** — nothing else, no style words.
6. Compare. Then repeat 4–5 **outside** the project as a control.

### Reading it

| Observation | Means |
|---|---|
| B is on-style without a primer, and the control is not | **YES** — Projects carry the look. Cancel 2c, and consider driving a project URL instead of `chatgpt.com/` |
| B is off-style, control also off-style | **NO** — Projects carry text context, not visual style |
| B is on-style **and so is the control** | **Inconclusive** — your primer was not distinctive enough, or account-level memory is doing it. Turn ChatGPT memory OFF and redo |

> **The control arm is not optional.** Without it, ChatGPT's account-level *memory* and a
> project's memory are indistinguishable, and you would credit the wrong mechanism.

**Record:** the two images, the control image, and which row above you landed on.

---

## 0b · Does the composer accept a pasted image? — two probes

`feed()` is `clipboard.writeText` → `wc.paste()`. The only text-specific line is the
clipboard write. So: does `clipboard.writeImage()` + the **same** paste land an image?

### Local half — automated, no login

```bash
npx electron probe/probe-attach.cjs
# or, more realistically, against a real 2MB harvest:
npx electron probe/probe-attach.cjs ~/Pictures/ImageDrip/smoothies/2026-08-03-0943-smoothies/kangaroo.png
```

Answers: does a paste fire, does its DataTransfer carry an `image/*` **file**, is it
`isTrusted`, and — **the hazard** — does `feed()`'s `selectAll()` destroy an attachment
added by an earlier image paste? Order matters, and getting it wrong loses data silently.

### Live half — interactive, needs your account

**Quit ImageDrip first** — this shares the `persist:imagedrip-chatgpt` partition, and two
processes on one partition is asking for trouble.

```bash
npx electron probe/probe-attach-live.cjs \
  ~/Pictures/ImageDrip/smoothies/2026-08-03-0943-smoothies/kangaroo.png
# add --submit to also test the post-condition (sends ONE message to your account)
```

Answers three things, and the third is the one that bites:

1. Does ChatGPT turn a pasted image into an attachment?
2. Does `CHATGPT_SELECTORS.composerAttachment` **match** the chip? That selector is marked
   ⚠️ UNVERIFIED and was written for the *"Pasted text"* chip, never for an image. If it
   misses, the probe dumps candidate elements so it can be re-pinned in one pass.
3. **The inversion.** `feed()`'s submit post-condition requires `!hasAttachment` after
   Enter. If a chip lingers or the selector over-matches, **every attached feed reports
   "Enter did not submit it" on a message that was actually sent** — absence looking like
   failure, which is the exact bug `feed()`'s verification exists to prevent. Fix this
   before building any attach path.

### Reading it

- **Image lands + chip matched + post-condition holds** → 2c is small. Proceed.
- **Image lands, selector missed** → re-pin `composerAttachment` first. Cheap, but it is a
  prerequisite, not a follow-up.
- **Image does not land at all** → mechanism (b) is out. 2c needs CDP
  `DOM.setFileInputFiles` via `webContents.debugger` — a new selector, a preload channel,
  and an open question about invariant #1. **Roughly doubles.**

---

## 0c · Does the re-prime fire, and what does drift look like? — ~3h of quota

**The mechanism at the centre of the whole drift plan has never executed in production.**
Prove it, and measure drift in the same pass.

### Setup

1. Import `prompts-24-drift.txt` (format: **lines**). **Do not sort or regenerate it** —
   the order is shuffled on purpose and must be identical across arms.
2. One brand, one template, one project. Keep them fixed for every arm.

### Arms

| Arm | `chunkSize` | Boundaries | Why |
|---|---|---|---|
| **1** (run FIRST) | **6** | after 6, 12, 18 | The only arm guaranteed to cross a boundary. **If the re-prime is broken, you find out here, in the cheapest cell.** |
| 2 | 18 | after 18 | One boundary, long chunks |
| 3 | 24 (or default) | none | Control — pure intra-conversation |

`chunkSize` is already a `RunConfig` field, so **no code change is needed to run this.**

**Three replicate runs per arm before believing anything** — generation is stochastic and
n=1 shows a "trend" either way. That is ~216 images and **will** collide with ChatGPT's
undocumented image ceiling; budget for pauses, and treat a rate-limit pause as data, not
failure. If quota forces a cut, **run arm 1 three times before running arm 2 once** —
proving the re-prime fires matters more than comparing arms.

### Measure

```bash
npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/<project>/<run-folder>
# or every run at once:
npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/<project>/*
```

Reports **`D_prev`** (collapse) and **`D_first`** (wander) per image, marks chunk
boundaries from the manifest's `reprimes`, and flags within-chunk trends and boundary
jumps. Uses Electron's own `nativeImage` — **no new dependency**.

### Reading it

| Signature | Means |
|---|---|
| `D_prev` **falls** within each chunk and **jumps** at boundaries | Intra-conversation collapse is real. Smaller chunks help. **Jan's 6–8 is vindicated** |
| `D_prev` **flat**, no boundary jump | Position-in-conversation is not driving drift. **6-vs-18 is a non-question**; look elsewhere (2a/2b) |
| Large jump at boundaries, flat within | Cross-conversation drift dominates. **Re-priming more often makes it WORSE.** Reference images (2c) become the whole answer |
| `reprimes` still `[]` after arm 1 | **The re-prime did not fire. Stop.** Phase 3 is built on it |

> **This is what settles David's *"they're both the same problem."*** If drift is
> within-conversation, re-priming more often helps. If it is between-conversation,
> re-priming more often hurts. **The two signatures are visibly different**, and which one
> appears decides the strategy.

### A baseline already exists

`measure-drift.cjs` was run against the three existing run folders on 2026-08-14, before
any new work — see §Results.

---

## Results

**Nothing below is filled in until the check has actually been run.** An empty row means
*not done*, never *nothing found* — those two look identical on disk, and telling them
apart is the point of writing it this way.

### 0a — ChatGPT Projects

- **Status:** ⬜ not run
- **Outcome:**
- **Control arm behaved as:**
- **Decision it drives (cancel 2c / keep 2c):**

### 0b — composer image paste

- **Local probe:** ✅ **RUN 2026-08-14 — PASSED.** Observed, with the generated 64×64 PNG:

  ```
  0. clipboard formats after writeImage(): ["image/png"]
  1. paste fired: true
  2. DataTransfer kinds: ["file"] · types: ["image/png"]
     file count: 1 · file type: image/png · file size: 289
  3. paste isTrusted: true
  4. chip survived selectAll + text paste: 1 chip(s) before → 1 after
     composer text after: "a lime, tall glass"
  ```

  So: **`clipboard.writeImage()` + the same `wc.paste()` `feed()` already uses delivers an
  `image/png` FILE to the page, as trusted input** — invariant #1 holds for images exactly
  as it does for text. **And the `selectAll` hazard did not bite**: an attachment chip
  outside the contenteditable survived a subsequent `selectAll` + text paste, and the text
  still landed. That is the image-first-then-text order a boundary reseat would use.

  **Re-run against a real harvest — also passed**, which closes the size question:

  ```
  image under test: kangaroo.png (1402×1122, 1727471B)
  DataTransfer kinds: ["file"] · types: ["image/png"] · file size: 1955196
  RESULT → image lands as a FILE: YES · trusted: true · chip survives selectAll: YES
  ```

  One detail worth carrying forward: **the clipboard round-trip re-encodes the PNG and it
  grows ~13%** (1,727,471 B on disk → 1,955,196 B delivered). Harmless against ChatGPT's
  documented 20 MB-per-image ceiling, but it means the bytes uploaded are not the bytes on
  disk, so any size budgeting should use the delivered figure.

  **What it does NOT establish:** anything about ChatGPT. The page is a stand-in built to
  behave the way we believe ChatGPT behaves — **a stand-in that behaves as expected and a
  ChatGPT that does not are indistinguishable from here.**

- **Live probe:** ⬜ not run · chip appeared: — · `composerAttachment` matched: — · post-condition held: —
- **If the selector missed, the re-pinned value:**
- **Decision it drives (2c small / 2c doubles):** *pending the live probe.* The Electron
  half of mechanism (b) is now proven, so the remaining risk is entirely ChatGPT-side.

### 0c — re-prime + drift

- **Arm 1 (chunkSize 6):** ⬜ not run · `reprimes` non-empty: — · runs completed: —
- **Arm 2 (chunkSize 18):** ⬜ not run
- **Arm 3 (control):** ⬜ not run
- **Signature observed:**
- **Decision it drives:**

#### Baseline — existing runs, measured 2026-08-14 (before any Phase 1+ work)

Ran on the only real data that exists. **This is a baseline, not an arm** — it was not
controlled, the arms were not varied, and n=1.

| Run | Images | `reprimes` | `D_prev` first-half → last-half | Reading |
|---|---|---|---|---|
| `2026-08-03-0943-smoothies` | 12 (Australian animals) | `[]` | 0.259 → 0.261 | **Flat.** No collapse trend across 12 images in one conversation |
| `2026-08-03-1233-smoothies` | 3 (Filipino heroes) | `[]` | — | Too few to say anything |
| `2026-08-05-1245-smoothies` | 3 | `[]` | — | Too few |

**What this baseline does NOT establish**, and the caveats matter more than the number:

- **The subjects are wildly different** — kangaroo vs kookaburra vs platypus. `D_prev` is
  dominated by *subject* difference, not *style* drift, which is precisely the confound
  `prompts-24-drift.txt` is shuffled to control. **A flat reading here is weak evidence.**
- **No run crossed a boundary**, so this says nothing at all about cross-conversation drift.
- **The metric is not your eye.** It has never been calibrated against a case David
  actually called drift. If the numbers and the images disagree, the images win.
- 12 images is well short of the 18 where the code expects to re-prime.

Taken at its weakest, which is how it should be taken: **there is no evidence of
intra-conversation collapse in the only long run that exists** — and no evidence against
it either, because the design could not have detected style drift under that much subject
variation.
