# ImageDrip UI — design notes (David × Jan)

**Status:** live capture, in progress. Nothing here is a decision unless marked as one.
**Started:** 2026-08-14
**Purpose:** a running record of the ImageDrip UI conversation between David and Jan, based on
designs Jan is producing in Open Design. Structured by decision, not by chronology.

**Reading rule:** the source is unedited speech-to-text with two unlabelled voices. Where
attribution is uncertain it is marked `⚠ voice unclear`. Where a screenshot and something said
aloud disagree, the conflict is stated rather than resolved.

**The filter:** [docs/north-star.md](north-star.md) — *"does it get more images of a given style
out, with less of the operator touching it?"* Applied as a lens, not a veto. Tensions are logged
once in [§7](#7-north-star-tensions), not re-argued per item.

> ### ⚠️ Read this next: [`research-imagedrip-architecture.md`](research-imagedrip-architecture.md)
>
> The architecture this session opened has since been researched against the actual code, and **it
> changes the shape of three of the four problems recorded below.** Most importantly:
>
> - **§5.4 is wrong about the app.** The per-row "send this prompt" button **exists and shipped on
>   2026-08-10.** Jan's Design 1 **drops** it. The parity gap is a regression in the mock.
> - **§5.3's multi-conversation problem is already solved in behaviour** — the app re-primes into a
>   fresh ChatGPT conversation every 18 images to fight drift. What is missing is the *record*, not
>   the mechanism. (It has also never actually fired.)
> - **§5.1's 350-template scale problem does not exist today** — templates are already global in the
>   schema. Jan's brand-scoped list would *create* the problem, not solve it.
> - **§5.2's variation problem** has a half-built home already sketched in the repo, plus a second
>   half nobody named that is not cheap.
>
> **This file remains the record of what was said. The research file is the record of what is true.**
> Where they disagree, the research file wins on fact and this file wins on intent.

---

## 1. Naming — settled

**Ruled by David:** **Design 1 is the cream**, **Design 2 is the white**. David noted this may not
be Jan's own numbering.

**Confirmed by Jan:** Design 2 is **only a colour change**, not a layout change. *"It's just the
colour thing that changes."*

**Ruled by David — Design 2 is out.** Neither proposed theme is right, because ImageDrip's current
theme *is* AppyDave and stays AppyDave. Jan's rationale for the white — *"more like the template or
the usual colour that most builders are using"* — was heard and set aside. Everything below
therefore concerns **Design 1's structure**, wearing the AppyDave skin.

> This closes the open question from the first capture: D1 and D2 were the same layout in two
> palettes, and the palette question is now decided.

---

## 2. Screenshot inventory

All frames live in this session's image cache:

`/Users/davidcruwys/.claude/image-cache/a3bea582-3fe9-4a8a-8478-86cad2e82fa0/`

> ⚠ **This path is ephemeral** — a per-session cache, not durable. If these frames matter beyond
> today they need copying into the repo (e.g. `docs/design/screenshots/`). Not done; awaiting David.

| Ref | File | What it shows |
|---|---|---|
| **D1-full** | `5.png` | Design 1 at rest — chip row, chat pane, queue 18, harvest 8 (placeholders) |
| **D1-brand** | `12.png` | BRAND popover — *brands on disk* |
| **D1-template** | `14.png` | TEMPLATE popover — *templates on disk* |
| **D1-project** | `15.png` | PROJECT popover — *projects on disk* |
| **D1-editor** | `16.png` | Full-width `Project.md` editor with right rail |
| **D1-run8** | `20.png` | Mid-run — chips locked, harvest 8 of 18 |
| **D1-run14** | `21.png` | Harvest grid at 14 |
| **D1-copyout** | `22.png` | COPY OUT popover |
| **D1-runs** | `23.png` | RUNS history panel, including a failed run |
| **D2-full** | `2.png`, `3.png` | Design 2 (white) — same layout, dropped |
| **D2-header** | `27.png` | Design 2 header strip — the chip row + copy out + Runs |
| **BASE** | `4.png`, `6.png`, `7.png` | The app as it exists today |
| **CTX-folders** | `10.png` | *Not a design.* Terminal output from a separate session on image/video project folders — see §6.1 |

---

## 3. Jan's design philosophy

In his own framing: the current ImageDrip is **overwhelming**, and the specific culprit is **text
volume** — long explanatory paragraphs sitting permanently on screen. The redesign keeps the core
intact but makes it **collectible / one-at-a-time**: you don't confront brand, template and project
simultaneously. You open one, deal with it, close it, open the next.

That philosophy is visible in the base app: `4.png` and `6.png` show three numbered accordion
sections, each with its own multi-sentence explainer, all stacked in a narrow left rail. Design 1
replaces all of it with one chip row.

**Where this lands against the Star:** it is squarely pro-Star — fewer permanent controls, less to
read. Noted, not argued.

---

## 4. Design 1 — the walkthrough

### 4.1 The chip row and its popovers — **agreed shape, details open**

The three axes become three horizontal chips in the header: `BRAND Joy Juice × TEMPLATE
character-sheet × PROJECT smoothies → 18 prompts ready`, plus the readout `primer = brand ×
template × project` / `posted once per chat · 4 prompts since`.

Clicking a chip opens a small popover listing what is **on disk** for that axis. All three follow
one pattern:

| Popover | Header | Entries | Extras |
|---|---|---|---|
| `12.png` | `BRAND  brands on disk` | Joy Juice `current`, Beauty & Joy `open`, Studio Neutral `open` | `(none)` struck through — *"drop this axis"* · `+ New brand…` |
| `14.png` | `TEMPLATE  templates on disk` | character-sheet `current`, storyboard `open`, infographic `open` | `(none)` — *"drop this axis"* · `+ New template…` |
| `15.png` | `PROJECT  projects on disk` | smoothies `current`, protein-bars `open`, kombucha `open` | `+ New project…` (no `(none)` option) |

Every popover carries the same footer: **"Choosing one opens its editor over the full width."**

Two things worth naming because they are design decisions hiding in a footer:

- **`(none) — drop this axis`** exists on Brand and Template but **not** on Project. Consistent with
  the base app, where `TEMPLATE` is struck through when unset and the primer becomes Brand +
  Project. Not discussed aloud. **Open:** is Project deliberately mandatory?
- **"files on disk are the source of truth"** — repeated in the editor rail (`16.png`). The app
  reads a folder; it does not own a database. This is inherited from the base app's `repo — files
  on disk are the source of truth` field.

### 4.2 The full-width editor — **agreed**

`16.png`. Choosing any axis item opens its editor across the whole window, replacing the three-pane
working area.

- **Header:** `PROJECT smoothies` · `switch…` · `saved ✓` · `Save` · `Done`.
- **Body (left, dominant):** `Project.md` — *"the subject — what you tune, every run"* — one large
  free-text area holding the subject prose.
- **Right rail, three blocks:**
  - **WHAT THIS BECOMES** — a live preview of the assembled primer, rendered as markdown sections
    (`# Brand — Joy Juice`, palette, camera, then `# Template — character-sheet`). This is the
    primer made visible before it is posted.
  - **SWITCH** — *"Other projects on disk — files are the source of truth"* · `switch…` · `+ new`.
  - **OUTPUT FOLDER** — `/Users/janreyes/Pictures/ImageDrip/smoothies` · `change…` · `reveal`, with
    the note **"every run lands in its own dated subfolder here."**

Jan's framing of the coach-mark on this screen: *"this is the width the old rail never had — the
fullscreen escape hatch is now the normal path."* i.e. in the base app, editing a long body meant
escaping to fullscreen; here fullscreen **is** the edit mode.

### 4.3 Run behaviour and batch size — **Jan proposes, not ruled**

Jan: a run should produce **six to eight images at a time**, not the whole queue, *"so it doesn't
drift with a brand that we choose or a template that we have."* Run again for another six to eight.
Repeat until the target (18) is met.

Evidence: `20.png` harvest 8, `21.png` harvest 14, `5.png` harvest 8 of 18.

Jan flagged the mock is loose about counts (*"it just passed the 18 images, but this is just a
mock-up"*). **Open:** is 6–8 a fixed cap, a default, or operator-set? Nobody said.

**Also visible in `20.png` and not discussed:** during a run the chips render **dashed with a lock
glyph** and the readout changes from `posted once per chat · 4 prompts since` to **`posted — locked
for this run`**. That matches the base app's *"locks during runs"* labelling on Brand and Template.

### 4.4 `copy out` — **agreed as placement, contested as sufficiency**

`22.png`. A popover with three items:

- `Copy primer` — *the whole sentence*
- `Copy next prompt` — *#5*
- `Copy list-prompt ask` — *built-in*

Footer: **"Typing into ChatGPT by hand is the fallback, not the design — so it lives here, not as
step 4."** — a direct quote of the North Star's own wording, so this is Jan designing to the Star.

**David's objection (see §5.4):** the placement is right, the coverage is not. Copy-out gives you
the *text*; it does not give you the *step*.

### 4.5 `Runs` — **exists, purpose only half-agreed**

`23.png`. A panel headed `RUNS smoothies`, one row per run: a large target number, the project name,
a date, and delivered/target.

```
 6  smoothies   12 Aug 2026   6/6
 6  smoothies   12 Aug 2026   6/6
 6  smoothies   12 Aug 2026   6/6
18  smoothies   12 Aug 2026  17/18
 9  smoothies   11 Aug 2026   9/9 · dial-in
24  smoothies   09 Aug 2026   6/24   ← dark red
     "Stopped after 6. 18 of 24 images were never delivered."
```

Footer: *"Each run lands in its own dated folder under /Users/janreyes/Pictures/ImageDrip/smoothies."*

**Jan:** it is the history of automation runs — did you get all six, or did an 18-target run finish
at 17 and leave one missing.

**David asked twice what clicking a row does** and got no functional answer; the exchange settled on
*"okay, it's a log."*

**Open:** is a run row clickable, and to what — the folder, the images, the conversation, a resume?

> The failed row is the North Star's *"nothing may fail silently"* rule rendered as UI, and it does
> it well: the run that under-delivered is the loudest thing on the panel. Worth keeping whatever
> else changes.

---

## 5. The unresolved architecture — David's four problems

This is the substance of the session. None of it is settled; all of it is upstream of the UI.

### 5.1 Global vs brand-scoped templates — **open, explicitly parked**

**Jan's design** scopes templates to the selected brand: pick Joy Juice, and the template list is
Joy Juice's templates.

**David's objection is a scale argument, then a concept argument:**

- Scale: 50 brands × 3 templates = 350. *"If I clicked on Joy Juice and in front of me I saw 350
  templates, that would be a problem. If I clicked on Joy Juice and I only saw three templates,
  that would be okay."* — so brand scoping is right as a **filter**.
- Concept: *"a character sheet is not tied to a brand. A character sheet is its own individual
  concept"* — a **global template**.
- Crossover: a global template with per-brand customisation on top.

**Jan conceded** he had not considered the global view, and reasoned aloud that a character sheet
isn't brand-specific while an infographic might be.

**David parked it himself:** *"my gut feeling is that I should not be thinking about it here, but it
is important for us to think about it."* Recorded as parked, not solved.

### 5.2 The missing level — template customisation and variations — **problem agreed, solution not**

The sharpest thread in the session.

**The setup.** The primer is Brand × Template × Project. David's question: **where does template
customisation live?** Is what you tune in the Project actually a customisation *of the template*, or
do templates need their own custom instructions?

**The worked example.** A Joy Juice smoothie needs a card that is none of character-sheet /
storyboard / infographic. David names it a **product detail card** (or a poster): mango smoothie,
strawberry smoothie, durian smoothie, each with a **primary image plus N variations**.

**Why N has nowhere to live:**

- **Put it in the template** → you lock every card to that number. But *"certain drinks you can't
  even find three variations of them"* — one ingredient yields two, another yields seven.
- **Put it in the project** → wrong scope. The project *"might not be about the display card. It
  might be about the menu as a whole. It might be about the characters in the videos that are
  talking about Joy Juice."*

**David's conclusion:** *"there's a relationship hierarchy of data that we're missing."*

**Jan agreed and proposed the shape:** the template defines the **usable structure** of the design;
it must **not** fix the number of variations or supporting images. There should be **a
customisation layer between project and template**.

**The formulation both landed on** ⚠ *voice unclear on who said it last, but neither disputed it*:
a template like *product detail card* is designed as **one main design plus 0..N variations**, where
N is data captured **per instance**, not per template — and *that* is the data with no home today.

**Status: the gap is agreed, the fix is not designed.** No UI was drawn for it.

### 5.3 Drift, conversations, and what a "run" actually is — **open, and the biggest hole**

**Terminology, ruled by David:** the word **"theme" should become "flow"**. *"I want to change that
word theme to flow."* The `▶ Run theme` button is therefore `▶ Run flow`, pending the rest of the
naming below.

**Two kinds of drift, named by David:**

1. **Drift within a conversation** — successive images creep toward each other. His example: two
   images came back near-identical because ChatGPT stopped distinguishing limes from lemons.
2. **Drift from a new conversation** — a fresh ChatGPT conversation has no reference to what came
   before, so even the same primer produces a different look.

*"They're both the same problem."*

**Jan's answer to (2):** re-share in the second conversation what was shared in the first — the
design, the style, the expected output. **Jan then immediately doubted his own answer**: *"even when
we shared the same knowledge from the first conversation, I think the second conversation still have
a different approach to it."* This is a real, unresolved disagreement-with-self and is preserved as
such.

**David's answer to (2):** the new conversation needs the primer **plus one or two reference images**
from the previous flow.

**The two flows David walked through:**

> **Flow A — manual, then automatic, then manual repair.**
> Prime the conversation. Manually fire single prompts — mango, then berry — each dropping out of
> the queue (18 → 17 → 16). Then `run the flow`, capped at six; harvest reaches 8. Notice the last
> two look too similar. **Talk directly into ChatGPT** to correct it. Harvest the corrections —
> *"and that can be a little bit of a problem, because they're not in the queue. So how does that
> work? I have no idea."* Then resume the flow for the remaining ten.
>
> **Flow B — abandon and re-seat.**
> When in-conversation drift control stops working, start a new ChatGPT conversation. Prime it *and*
> seed it with reference images from the previous flow.

David's own caveat, verbatim in spirit: *"I don't know how practical what I just said is in the real
world."* Recorded as a scenario to design against, **not** as a requirement.

**The vocabulary question this exposes — unanswered:**

- Does a **flow** correspond one-to-one with a **ChatGPT conversation**? David floated yes, then
  withdrew: *"I'm not sure."*
- Is a **run** the conversation, or the list of images being collected?
- If two, three or four conversations all serve the same use case, **the images must not scatter
  across folders.** *"You don't want to have to go into multiple folders to find images that are
  actually the same project."*

**What David says the app cannot currently represent** — his own list:

1. that a run producing images for one style-of-usage is **one data structure**;
2. that **two or more ChatGPT conversations** may have produced those images;
3. that a conversation can be **paused mid-way** for manual reshaping and drift control;
4. that a second conversation may need **primers plus reference images from other systems**;
5. that work can be **manual for a while and then flow-run**.

*"I need an information hierarchy, a bit of a schema, because I don't think we have enough
relational shape in our application at the moment."*

**This is the largest open item in the document.** It is a data-model question, not a UI question,
and the UI cannot be finished ahead of it.

### 5.4 Manual-step parity — **a named gap, David is firm**

Prompted by `27.png` (the Design 2 header strip, but the point is layout-general).

David accepts the three chips are the right buttons for brand/template/project. His objection is
what is **missing**:

- The queued items **are prompts**. There is **no button that sends one across**.
- **No button to take a prompt, paste it into ChatGPT, and press Enter.**
- Of the `copy out` menu: *"I feel like part of that is okay but wrong."* — right idea, wrong
  coverage. It hands you text; it does not perform the step.

**His definition, worth quoting because it is the standard being applied:**

> *"Manual step is a system in which you are pretending to be the computer, and anything the
> computer can do, there is a manual step capability."*

Putting `greens, tall glass` into the conversation **is a step the computer performs**, therefore it
must have a hand-operable equivalent, and it doesn't. This is the North Star's parity rule
(ruled 2026-08-10) applied to a specific missing control — so it is **parity, not cockpit**, and the
Star's test explicitly permits it.

**Implication (not an action):** the queue rows likely need a per-row "send this one" affordance,
and `copy out` is not a substitute for it.

---

## 6. Two threads David flagged for later

### 6.1 Where image files live — **separate conversation, already in progress**

David pointed at another live session rather than re-deciding here:

```
Session name:  open-design-workflow
Session ID:    c88b926d-1cd2-455b-80ed-212db78e5321
cwd:           /Users/davidcruwys/dev/ad/brains
```

`10.png` is a screenshot of that session's output. What it establishes:

- **`~/dev/video-projects/`** is the working model: a container (not a repo) holding **7 live
  private repos** (`v-appydave`, `v-aitldr`, `v-voz`, `v-kiros`, `v-supportsignal`,
  `v-beauty-and-joy`, `v-shared`) under GitHub org `appydave-video-projects`, plus
  `video-asset-tools/`, `published/`, a registry JSON, a dashboard, and `sync-all.sh` /
  `status-all.sh`. Jump aliases `jv*`, in `locations.json`.
- **`~/dev/image-projects/`** is *"a shell, nothing more"* — 7 empty directories (`i-aitldr`,
  `i-appydave`, `i-beauty-and-joy`, `i-challenge-dv`, `i-joy-juice`, `i-shared`, `i-voz`), **zero
  files anywhere**, no `.git`, no jump alias, not in `locations.json`. Created 4 Aug 2026 and
  untouched since — *"ten days old and completely inert."*
- **`design-projects`** (new) has container docs and a `jdes*` alias but one real folder.

**Why it matters here:** Design 1's editor hard-codes output to
`/Users/janreyes/Pictures/ImageDrip/smoothies` with dated subfolders per run. That is a *Pictures*
path, and it is unrelated to the `~/dev/image-projects/` structure being designed in the other
session. **These two need reconciling; neither is wrong yet.** Flagged, not resolved.

### 6.2 Agentic control surface — **research David wants refreshed, not a design item**

David described the pattern he has already researched in the second brain, for applications where
a chatbot drives the application:

- Build the app with a **control surface**: everything doable in the UI is exposed as **CQRS**
  (command / query separation).
- Put an interface over it — *"maybe a RESTful API"* — so anything the UI can do, the API can do.
- Hook a chatbot to that. **External** to the app if via API endpoints; **internal** if calling the
  command/query functions directly.

**He says this is already the pattern ImageDrip uses**, and asks that the **latest research be
found** rather than relying on the existing brain entry.

*Not actioned. Logged as a request.* Relevant repo doc that may already cover it:
`docs/plan-imagedrip-control-surface.md`.

### 6.3 Export an image project — **idea, undesigned**

Jan: after all images are generated, there should be **one place to save them all to the computer** —
the last step after a run completes.

David extended it: an **export of the image project**, which should also cope with images being
spread across multiple locations. Named use case: generate a character sheet in ImageDrip, then take
it into an **animation tool outside ImageDrip**.

No UI drawn. Directly coupled to §5.3 (if one project spans several conversations and folders,
export is what reunites them).

---

## 7. North Star tensions

Logged once, not re-argued.

- **The coach-mark tour** (`01/09 … 09/09`, with `states`) now reads as **Jan's Open Design
  annotation layer**, not a proposed product feature — he uses it to narrate each state (*"Pick
  smoothies. Choosing an item opens its editor over the full width"*). If that is right, the earlier
  "a tour is a thing to learn" tension is void. **Still unconfirmed by Jan directly.**
- **`Runs` is new capability, not parity** — nothing in today's app does it. It sits on the cockpit
  side of the Star's test. Counterweight: the failed-run row is the clearest expression of *"nothing
  may fail silently"* in either design, which is the repo's own hardest rule. Noted; David has not
  ruled.
- **§5.4 manual-step parity is explicitly Star-compliant** — a control that performs a step the app
  already performs is parity, and the Star permits it by name. No tension.
- **§5.2's customisation layer is the one to watch.** A layer between project and template is, by
  construction, another thing to configure. It is justified by data the system genuinely cannot
  express — but it is the item most likely to become cockpit if designed carelessly.

---

## 8. Open questions

**Status against [`research-imagedrip-architecture.md`](research-imagedrip-architecture.md):**

| # | Then | Now |
|---|---|---|
| 1 | Data model / what is a run vs flow vs conversation | **Answered** — research §2.3–§2.4. Run = the collected set and its folder; a new `Segment` = one conversation. Needs David's ratification, and the word "flow" collides with the button label |
| 2 | Where variation-count data lives | **Half answered** — research §2.6. `Prompt.variables` is already sketched; the one-prompt-many-images cardinality change is not, and is not cheap |
| 3 | Global vs brand-scoped templates | **Answered on fact** — research §2.7. Already global. Still David's to rule |
| 4 | Manual-step affordance on queue rows | **Dissolved** — it exists and shipped. Research §3.4 |
| 5 | Reconcile the output path | **Answered** — research §4.5–§4.6. Option B's shape, Option A's dated run folder as the leaf |
| 6 | Is 6–8 a cap, default, or operator control? | **Reframed** — research §5.1, §5.4. It is already `RunConfig.chunkSize`, defaulting to 18. Both numbers are folklore; §5.4 gives the experiment |
| 7 | Does a `Runs` row do anything when clicked? | **Still open** — a UI question the research does not touch |
| 8 | Is Project deliberately mandatory? | **Still open** |
| 9 | Coach mark: product or annotation? | **Still open** — needs Jan |
| 10 | How far does `theme` → `flow` propagate? | **Answered with a caveat** — research §2.3 recommends retiring `Theme` entirely and *not* reusing "flow" for the segment |

Ordered by how much they block.

1. **The data model / information hierarchy (§5.3).** What is a run, what is a flow, what is a
   conversation, and how do many conversations roll up into one deliverable set of images? Blocks
   the rest.
2. **Where does variation-count data live (§5.2)?** Agreed it belongs neither in the template nor
   the project. No home proposed.
3. **Global vs brand-scoped templates (§5.1).** Parked by David, unresolved.
4. **Manual-step affordance on queue rows (§5.4).** Agreed missing; not designed.
5. **Reconcile the output path (§6.1)** — `~/Pictures/ImageDrip/<project>/<dated-run>/` in the
   design vs `~/dev/image-projects/i-<brand>/` in the other session.
6. **Is the 6–8 per-run batch a cap, default, or operator control (§4.3)?**
7. **Does a `Runs` row do anything when clicked (§4.5)?**
8. **Is Project deliberately mandatory** while Brand and Template offer `(none) — drop this axis`
   (§4.1)?
9. **Is the 9-step coach mark product or annotation (§7)?**
10. **Rename `theme` → `flow` — how far does it propagate?** Button label is clear; whether `run`
    survives as a separate concept depends on (1).

---

## 9. Decisions log

| # | Item | Decision | Who |
|---|---|---|---|
| 1 | Design naming | Design 1 = cream, Design 2 = white | David |
| 2 | Design 2 | Colour-only variant; **dropped** — ImageDrip stays AppyDave-themed | David (Jan confirmed it was colour-only) |
| 3 | Context area | Three-section accordion → **one horizontal chip row** with popovers | Jan proposed, David did not contest |
| 4 | Editing an axis | Choosing an axis item opens its **editor over the full width**; fullscreen becomes the normal path, not an escape hatch | Jan |
| 5 | Chat pane | Chat gets the **whole left column**; context moves up into the header | Jan |
| 6 | Source of truth | **Files on disk**, per axis — carried over from the base app | Jan (consistent with base) |
| 7 | Terminology | **"theme" → "flow"** | David |
| 8 | Template scope | Template must define **structure only**, never a fixed variation or supporting-image count | Jan, agreed by David |
| 9 | Manual parity | Every step the computer performs must have a hand-operable equivalent; today's queue has none | David |

---

## Appendix — source material

- Screenshots: see §2.
- North Star: [docs/north-star.md](north-star.md) — ratified 2026-08-08, bearing ruled 2026-08-09,
  parity rule ruled 2026-08-10.
- Related in-repo: `docs/plan-imagedrip-control-surface.md`, `docs/ux-and-workflow.md`,
  `docs/two-clocks.md`.
- Related out-of-repo: session `c88b926d-1cd2-455b-80ed-212db78e5321` (`open-design-workflow`,
  cwd `~/dev/ad/brains`) — image/video/design project folder strategy.
