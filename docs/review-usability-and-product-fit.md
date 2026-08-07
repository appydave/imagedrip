---
doc: review
project: imagedrip
status: assessment — 2026-08-07. No code was changed to produce this.
purpose: judge ImageDrip as a product — is it good, and what is missing — against how it is actually used
method: docs → Live UAT corpus → the real store on disk → the running cockpit → the live control surface
---

# ImageDrip — usability & product fit

## Verdict

**Qualified yes — a good engine inside a good cockpit, wrapped around a domain model the user has
quietly stopped using as designed.** It does the thing it was built for: a prompt list becomes named,
filed, provenanced images on a subscription instead of an API bill, and the cockpit is genuinely
well-made. But **neither of the two real runs ever finished**, and the Brand→Project layering the
entire left rail is organised around has inverted in practice — the recipe lives in Project.md, the
Brand contributes a line that actively contradicts the work, and the Template axis built to fix
exactly this has zero instances.

The product is not short of features. It is short of **truth about its own state** — folder names,
run outcomes, and a primer that says two opposite things — and every one of those is cheap to fix.

---

## What this is based on

Everything below traces to something observed on 2026-08-07, not read out of the source.

| Source | What it gave |
|---|---|
| **Live UAT corpus** — `~/Library/Application Support/imagedrip/live-uat/` | **The directory does not exist.** Zero snags, zero verdicts. See finding 4. |
| **The real store** — `domain.json` | 1 brand · **0 templates** · 1 project · 22 prompts (9 harvested / 13 queued) |
| **On-disk runs** — `~/Pictures/ImageDrip/smoothies/` | 2 run folders, 2 manifests, both `finishedAt: never` |
| **The running cockpit** | Screenshotted and driven; the rail walked top to bottom |
| **The live control surface** — `127.0.0.1:7180` | 31 verbs, `domain.compose-primer`, `runs.list`, `context.get`, all read-only calls |

> **The Live UAT corpus is empty.** It was built on 2026-08-03 specifically to capture the acceptance
> pass for v2 WP1–WP5, and in the days since — including at least one real session — not one flag has
> been raised. That is not a small thing: the highest-value input to this review was supposed to be
> that corpus, and it produced nothing. Finding 4 treats the emptiness itself as the finding.

---

## The two things that are actually wrong

Stated first because everything in the matrix is downstream of them.

### 1 · The primer contradicts itself, on every image, in every run

Verified live via `domain.compose-primer` — this is the exact text that would be posted:

```
Brand: Beauty & Joy — bright, natural, wholesome. Warm daylight, soft wooden
surfaces, fresh and clean.

Create a humorous superhero character based on a silly or unexpected animal,
illustrated in the spirit of classic Golden Age American comic books (1938–1955)
…
• Bold black ink outlines with dynamic line weight.
• Slightly off-register ink, halftone dots, subtle paper grain, and aged comic texture.
• High contrast lighting with bold shadows.
```

103 characters of nail-salon warmth sit at the top of 2,440 characters of Golden Age comic. The two
halves are describing incompatible images, and the Brand half goes first — the position a model
weights most.

**Why the user cannot avoid it:** the Brand select has no `(none)` option. Template does — the rail
literally reads `(none — primer is Brand + Project)` — but Brand is mandatory. There is one seeded
brand, no delete, and no per-project brand. The only escape is to blank the Brand body by hand, and
nothing on screen suggests you should.

**This is the single highest-frequency defect in the product.** It taxes every image ever generated.

### 2 · Neither real run finished, and one died silently

| Run | Mode | Result | Outcome recorded |
|---|---|---|---|
| `2026-07-28-1150-smoothies` | *(pre-mode)* | 7 of 10 harvested | **never finished** |
| `2026-08-03-1446-smoothies` | auto | **2 of 15** harvested | **never finished**, 1 pause: `stalled — no image in 240s` |

The second run's own manifest explains itself. Measured generation times across both runs:

```
run 1:  76s  57s  70s  93s  76s  90s  116s
run 2:  Mimikyu 300s   ← then: "stalled — no image in 240s"
```

**The stall cap fired below the observed generation time.** Normal images take 57–116s; one took
300s; the cap is 240s. The run paused correctly, told nobody, and 13 prompts have sat queued for four
days. `finishedAt` is unset on both runs, so the app's own history cannot distinguish "finished" from
"abandoned" — `runs.list` reports `outcome: undefined` for 100% of runs that have ever happened.

The user guide says *"walk away."* The evidence says you cannot: a stall is silent, and resuming
requires a human who is already looking at the window.

---

## The usability matrix

Every job actually done, where it can be done, what it costs, and whether you'd find it unaided.

**Steps** = discrete user actions (click / type / paste), not screens. **Discoverable** = would a
competent user find it without being told.

### Setup and authoring

| Job | UI | Chat (v4 WP1, live) | File on disk | Steps (UI) | Discoverable |
|---|---|---|---|---|---|
| Create a project | ✅ `＋ new` on Project card | ✅ `project.create` | — | 3 | ✅ yes |
| Set / change output folder | ✅ `change…` → native picker | ✅ `domain.save-project` (no picker needed) | — | 3 | ✅ yes |
| Author the recipe | ⚠️ **into Project.md, wrongly** | ✅ `template.create` + `.save` | — | 2 | ❌ **no** |
| Create a Template | ✅ `＋ new` on Template card | ✅ `template.create` | — | 3 | ⚠️ present, unused |
| Point project at a template | ✅ dropdown | ✅ `template.switch` | — | 2 | ✅ yes |
| Choose "no brand" | ❌ **not at all** | ⚠️ only by blanking the body | ✏️ edit `domain.json` | — | ❌ **no** |
| Edit Brand body | ✅ textarea, autosaves | ✅ `domain.save-brand` | — | 1 | ✅ yes |
| Attach a brand repo | ✅ `attach a brand repo…` | ✅ `repo.attach` | — | 3 | ⚠️ unexplained |
| Rename the theme | ❌ **not at all** | ❌ **no verb** | ✏️ edit `domain.json` | — | ❌ **no** |
| Delete a brand / project / template | ❌ **not at all** | ❌ **no verb** | ✏️ edit `domain.json` | — | ❌ **no** |

### Getting prompts in

| Job | UI | Chat | File | Steps (UI) | Discoverable |
|---|---|---|---|---|---|
| Import a list | ✅ `＋ import` | ✅ `domain.import-prompts` | — | 4 | ✅ yes |
| **Generate the list, then queue it** | ⚠️ **7 steps, leaves the app** | ✅ **one sentence** | — | **7** | ⚠️ helper is findable, loop is not |
| Edit one queued prompt | ❌ **not at all** | ❌ **no verb** | ✏️ `domain.json` | — | ❌ **no** |
| Re-queue everything | ✅ `↺ Reset` | ✅ `domain.reset-run` *(gated)* | — | 2 | ✅ yes |

The 7-step version, as the rail actually presents it: set count → set subject → **Copy list prompt**
→ click into ChatGPT → paste → send → select the reply → copy → `＋ import` → paste → choose Add.
The chat does the same job in one turn, verified end to end — it reads Brand and Template for the
house style, generates, and calls `domain.import-prompts` itself.

### Running and watching

| Job | UI | Chat | File | Steps (UI) | Discoverable |
|---|---|---|---|---|---|
| Dial in one image | ✅ `⚡ Initialise` + `⚡ inject` | 🔒 **never** — webview is off-limits | — | 3 | ⚠️ `⚡` is hover-only |
| Start a batch | ✅ `▶ Run theme…` | ⚠️ gated, confirm-first | — | 2 | ✅ yes |
| **Know a run stalled** | ❌ **only if watching** | ⚠️ `context.get` if asked | 📄 manifest `pauses[]` | — | ❌ **no** |
| Resume after a stall | ✅ `▶ Resume` | ⚠️ gated | — | 1 | ⚠️ if you saw it |
| Tune cadence / chunk / settle | ❌ **not at all** | ✅ **`run.start` takes the full `RunConfig`** | — | — | ❌ **no** |
| Stop | ✅ `■ STOP` + `Cmd+Shift+.` | ⚠️ gated | — | 1 | ✅ yes |

### Reviewing and provenance

| Job | UI | Chat | File | Steps (UI) | Discoverable |
|---|---|---|---|---|---|
| See harvested images | ✅ HARVESTED grid, S/M/L | ⚠️ `harvest.thumb` one at a time | 📁 run folder | 0 | ✅ yes |
| Judge an image | ✅ hover 👍/👎 — **needs ⚑ UAT on** | ✅ `uat.verdict` | — | 3 | ❌ **no** (see finding 4) |
| Find a previous run | ⚠️ **RUNS is section 5, below the fold** | ✅ `runs.list` — one call | 📁 folder names | ~5 | ⚠️ requires scrolling |
| "What produced this image?" | ⚠️ open run → read primer | ✅ `runs.manifest` — one call | 📄 `manifest.json` | ~6 | ⚠️ |
| Know whether a run completed | ❌ **`outcome` is never written** | ❌ same gap | 📄 also absent | — | ❌ **no** |
| Copy Project.md back to source | ❌ not built | ❌ no verb | — | — | n/a |

---

## Ranked gaps — by how often they bite

| # | Gap | How often it bites | Cost today | Surface that should own it |
|---|---|---|---|---|
| **1** | **Brand cannot be "none", so a contradictory brand rides every primer** | **Every image, every run** | Unquantifiable — degrades output, invisibly | **UI.** A `(none)` option in the Brand select, exactly as Template already has. |
| **2** | **A stall is silent, and the cap is below real generation time** | **1 of 2 runs so far (50%)** | 13 prompts idle for 4 days | **Neither** — derive the cap from measured timings (`stall-budget.ts` already learns), and notify. |
| **3** | **`outcome` never written — no run can be told finished from abandoned** | Every run, forever | Provenance is permanently ambiguous | **Neither** — a main-process fix. |
| **4** | **Live UAT is off by default and has never been turned on** | Every session | The whole feedback loop is dark | **Neither** — change the default. More UI is not the problem. |
| **5** | **Theme name unchangeable → every run folder is misnamed** | Every run | `2026-08-03-1446-**smoothies**` holds Pokémon | **Chat** — needs one verb; a rename control is a poor use of rail space. |
| **6** | **Generate-a-list-and-queue-it is a 7-step round trip** | Every new batch | 7 steps → 1 sentence | **Chat.** Already proven working. |
| **7** | **The Template axis is unused; the recipe sits in Project.md** | Every project | Recipe can't be reused across subjects | **Chat** — "move my project body into a template" is 4 verbs it already has. |
| **8** | **`RunConfig` has no UI** (cadence, chunk, settle) | When tuning | Untunable without editing source | **Chat.** `run.start` already accepts all five fields. **Build no UI for this.** |
| **9** | **Run history is section 5, below the fold** | Whenever provenance is wanted | ~5 steps vs 1 chat call | **Chat** — and see "redundancy" below. |
| **10** | **No delete for brand / project / template** | Slowly, accumulating | Store only grows | **Chat** — a verb, gated. |
| **11** | **Docs claim WP6 is unbuilt; the panel is resizable (S/M/L + drag)** | Every reader | Misleads humans and agents | **Neither** — a doc edit. |

---

## What the chat operator changes — including what it makes redundant

WP1 is live and it genuinely moves the calculus. The rule that falls out of the matrix:

> **Anything that is a *value* belongs to the chat. Anything that is a *state you must see* belongs
> to the UI.**

Cadence, chunk size, a rename, a template body, twelve prompts — values. A stalled run, a queue
depth, nine thumbnails — state.

**Three UI surfaces get weaker, and one should go:**

- **`LIST PROMPT` card — retire it.** It exists solely to hand you a string to paste into ChatGPT so
  you can paste the reply back. The chat does the whole loop in one turn. This is three controls
  (count, subject, copy) plus a preview box, occupying a third of section 4, serving a workflow the
  chat obsoletes. **Retiring it is the clearest win in the rail.**
- **`Copy primer` / `Copy prompt` — keep, demote.** These are *not* replaced by the chat (the chat
  must never type into the webview — §4). They are replaced by `⚡ Initialise project` and `⚡ inject`,
  which already do the same job without the clipboard. Keep as the manual fallback; they no longer
  deserve equal billing in a numbered section.
- **`RUNS` list — keep, stop growing it.** One call answers "what produced this?" better than
  scrolling. Don't invest in a richer run browser; invest in the verb.

**And one place where more UI is right:** the stall. No chat sentence fixes not-knowing. A run that
pauses must say so where the user already is.

**One caution.** The chat is a second way in, not a second source of truth — every verb goes through
the same handler and inherits the same run-state locks. But it also means the discoverability
problems above become *invisible* rather than fixed: a user who never learns the Template axis exists
is no better off if the chat quietly uses it for them. The chat should say what it did.

---

## Fix now vs known debt

### Fix now — small, and each removes a recurring tax

1. **`(none)` in the Brand select.** Mirrors Template. Kills gap 1 outright. *Est. one afternoon.*
2. **Derive the stall cap from observed timings, and notify on pause.** The learning already exists in
   `stall-budget.ts`; the 240s constant is what fired below a real 300s generation. Gap 2.
3. **Write `outcome` on every run terminal path.** Gap 3 — provenance is the product's durable
   promise, and it is currently silent on the one question that matters.
4. **Default Live UAT on.** Gap 4. It was built to capture an acceptance pass that still hasn't
   happened; off-by-default is why.
5. **Retire the `LIST PROMPT` card** once the chat pane lands (WP4) — not before.
6. **Correct `user-guide.md § Known limits`** — the ChatGPT panel is resizable; it is listed as not.

### Known debt — leave it

| Item | Why it can wait |
|---|---|
| Delete for brand / project / template | Annoying, not blocking; one project exists |
| Project copy-back | Modelled, never wired; no evidence it is missed |
| Per-prompt reference images | Declared and deferred since v1; still no demand |
| Account switcher (rest of WP6) | The panel width — the loud half — is done |
| Packaging / signed `.app` | Single user, runs from source |
| Live UAT inbox | Correct call *until* the corpus is non-empty. Revisit once fix 4 lands |
| Other providers (DZINE / Higgsfield) | The model allows them; nothing is asking for them |

---

## The one that isn't a bug

The cockpit itself is good, and the review should say so plainly. The numbered rail
(**1 BRAND → 2 TEMPLATE → 3 PROJECT → PRIMER**) teaches the model on sight; the struck-through
`~~TEMPLATE~~` in the composition chip is an honest, wordless statement that the current primer skips
it; the `peek` affordances answer "what exactly lands on my clipboard"; and the footer sentence —
*"We track only Queued and Harvested — generating lives in ChatGPT"* — resolves the single most
likely confusion in the product in one line. The design pass that `working-rules.md` still lists as
WP7-unbuilt has largely happened.

The gap is not craft. It is that a well-built cockpit is currently reporting a project called
Smoothies, in a folder called smoothies, full of Golden Age comic Pokémon — and every one of those
labels is the app faithfully showing state that nothing lets the user correct.

---

**Reviewed:** 2026-08-07 · no source changed · app driven against the live store
(Beauty & Joy / Smoothies / 22 prompts) · control surface read-only throughout · no run started.
