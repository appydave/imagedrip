---
doc: review
project: imagedrip
status: assessment — 2026-08-07. No code was changed to produce this. Amended the same day once
  A1–A9 landed — closures are marked inline, and two findings that overstated what was missing are
  corrected under "Corrections to this review". The original wording is preserved above each.
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

> **✅ Closed 2026-08-07 (A1).** The Brand select now offers `(none — primer is Template + Project)`,
> and Brand is nullable end to end: `activeBrandId: string | null`, `brand: Brand | null`,
> `switchBrand(id: string | null)`. `compose()` drops the layer through the same `filter(Boolean)`
> that already made an empty Template invisible, so the other two layers are byte-identical to what
> they would be alone — pinned in `test/domain-compose.test.ts`.
>
> One thing this section did not spot, and it mattered more than the missing option: the select was
> also **`disabled={brands.length < 2}`**. With a single seeded brand it was inert, so adding
> `(none)` alone would have left it just as unreachable. The disable is gone. Deletes landed too
> (A7), so the seeded demo brand can now be removed outright rather than merely deselected.
> Per-project brand remains deliberately unbuilt — see *Known debt*.

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

> **✅ Closed 2026-08-07 (A3b + A2), with two corrections.**
>
> **The 240s was the BOOTSTRAP, not the derived cap.** `computeStallMs()` already derives from
> measured timings; run 2 had no *valid* samples to derive from, because its only prior timing was
> Dragonite's `0s` — a mis-attributed DOM `src` that `MIN_PLAUSIBLE_MS` correctly discards. So the
> budget was still `BOOTSTRAP_STALL_MS` when the 300s image was generating. That constant now clears
> the observed worst case with the same headroom the derived cap uses; the derivation is untouched.
>
> **"A stall is silent" is half wrong.** The top bar already renders `⏸ PAUSED` with `status.note`
> beside it. What was actually missing is that the runner is in-memory, so a pause left no trace once
> the app closed — the same root as the unwritten `outcome`, and closed by the same fix (A2).

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

> **Status, 2026-08-07 (second pass).** Gaps 1–5 and 7–11 are now **closed**; the `Status` column
> says how. Two entries below were **wrong as first written** and are corrected in place — see
> [Corrections](#corrections-to-this-review). Gap 6 is the only one still open, and it waits on the
> in-app chat pane (v4 WP4).

| # | Gap | How often it bites | Cost today | Surface that should own it | Status |
|---|---|---|---|---|---|
| **1** | **Brand cannot be "none", so a contradictory brand rides every primer** | **Every image, every run** | Unquantifiable — degrades output, invisibly | **UI.** A `(none)` option in the Brand select, exactly as Template already has. | ✅ **A1** — Brand mirrors Template: nullable id, nullable record, `(none)` in the select, and the select is no longer disabled below two brands (which is what trapped a fresh install). |
| **2** | **A stall is silent, and the BOOTSTRAP cap is below real generation time** | **1 of 2 runs so far (50%)** | 13 prompts idle for 4 days | **Neither** — raise the bootstrap floor; the derivation already learns. | ✅ **A3b** — `BOOTSTRAP_STALL_MS` was 240s and now clears the observed 300s worst case. *Corrected: the derived cap was never the defect — see below.* |
| **3** | **`outcome` never written — no run can be told finished from abandoned** | Every run, forever | Provenance is permanently ambiguous | **Neither** — a main-process fix. | ✅ **A2** — `before-quit` now closes the open run record and waits (bounded) for the manifest write. |
| **4** | **Live UAT is off by default and has never been turned on** | Every session | The whole feedback loop is dark | **Neither** — change the default. More UI is not the problem. | ✅ **A4** — default flipped to on; an explicit *off* still wins. |
| **5** | **Theme name unchangeable → every run folder is misnamed** | Every run | `2026-08-03-1446-**smoothies**` holds Pokémon | **Chat** — needs one verb; a rename control is a poor use of rail space. | ✅ **A5** — `theme.rename`, verb-only. |
| **6** | **Generate-a-list-and-queue-it is a 7-step round trip** | Every new batch | 7 steps → 1 sentence | **Chat.** Already proven working. | ⏳ open — works over the control surface today; collapses to one turn when the in-app chat pane lands (v4 WP4). |
| **7** | **The Template axis is unused; the recipe sits in Project.md** | Every project | Recipe can't be reused across subjects | **Chat** — "move my project body into a template" is 4 verbs it already has. | ✅ **A6** — the verbs existed; nothing said *when*. `template.create` now documents the migration sequence. |
| **8** | **`RunConfig` has no UI** (cadence, chunk, settle) | When tuning | Untunable without editing source | **Chat.** `run.start` already accepts all five fields. **Build no UI for this.** | ✅ **A8** — nothing built, by decision. Row removed from the `live-uat.md` gap map instead. |
| **9** | **Run history is section 5, below the fold** | Whenever provenance is wanted | ~5 steps vs 1 chat call | **Chat** — and see "redundancy" below. | ✅ reachable via `runs.list` / `runs.manifest`; deliberately not grown further. |
| **10** | **No delete for brand / project / template** | Slowly, accumulating | Store only grows | **Chat** — a verb, gated. | ✅ **A7** — `brand.delete`, `template.delete`, `project.delete`; gated, and each removes nothing from disk. |
| **11** | **Docs claim WP6 is unbuilt; the panel is resizable (S/M/L + drag)** | Every reader | Misleads humans and agents | **Neither** — a doc edit. | ✅ **A9** — `user-guide.md § Known limits` corrected. |

---

## Corrections to this review

Two items above were traced in code after this review was written, and **both overstated what was
missing**. They are corrected in place; this section records what was wrong and why, because in each
case the review would have sent someone to rebuild working code.

**1 — Gap 2 blamed the derivation. The derivation was already right.**

The original wording asked to *"derive the cap from measured timings"*. `stall-budget.ts` has done
exactly that since 2026-08-03: `computeStallMs()` takes `max(mean × 1.75, slowest × 1.3)`, clamped,
and is monotonic in the samples — a slow image can only ever widen the cap.

The real defect was the **bootstrap floor**, the one path the derivation does not reach. In
`2026-08-03-1446-smoothies` the only prior timing was Dragonite's `0s` — a mis-attributed DOM `src`,
correctly discarded by `MIN_PLAUSIBLE_MS` (5s) — so with *no valid samples* the budget was still
`BOOTSTRAP_STALL_MS` when a genuine 300s generation was in flight. That constant was 240s, and it
fired. Fixed by raising the bootstrap to clear the observed worst case; the derivation is untouched.

**2 — Gap 2's "a stall is silent" was half wrong: the chip already exists.**

`App.tsx` already renders `⏸ PAUSED` in the top bar and appends `status.note` beside it, so a stall
that happens **while the app is open** is visible exactly where the review says it should be.

The genuine gap is narrower and has a different root: the runner is in-memory, so after a quit there
is no trace of the pause in the UI at all — only in the manifest. That is the **same** root as gap 3,
and A2 is what closes it: a run that ends with the app now records an `outcome`, so `runs.list` can
say what happened to it. No new UI was needed, and building a second pause indicator would have been
building a thing that was already there.

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

1. ✅ **`(none)` in the Brand select.** Mirrors Template. Kills gap 1 outright. Done (A1) — and the
   select's `disabled={brands.length < 2}` came off with it, which was the half of the trap the
   review missed: with one seeded brand, even a `(none)` option would have been unreachable.
2. ✅ **Raise the stall BOOTSTRAP, and leave the derivation alone.** *Rewritten — the original item
   asked to build something that already exists.* `stall-budget.ts` has derived the cap from measured
   timings since 2026-08-03; the 240s that fired below a real 300s generation was
   `BOOTSTRAP_STALL_MS`, used only while there are no valid samples. Done (A3b). Notification needed
   nothing new either — see correction 2 above.
3. ✅ **Write `outcome` on every run terminal path.** Gap 3 — provenance is the product's durable
   promise, and it was silent on the one question that matters. Done (A2): the missing path was
   app-quit-while-live, and it landed in `index.ts`, not `batch-runner.ts` — every path *inside* the
   runner already called `finishRun`.
4. ✅ **Default Live UAT on.** Gap 4. It was built to capture an acceptance pass that still hasn't
   happened; off-by-default is why. Done (A4).
5. ⏳ **Retire the `LIST PROMPT` card** once the chat pane lands (WP4) — not before. Still open, and
   still correct to wait: retiring it now removes a working path and replaces it with nothing.
6. ✅ **Correct `user-guide.md § Known limits`** — the ChatGPT panel is resizable; it was listed as
   not. Done (A9), along with the "no programmatic intake" row, which was equally stale.

### Known debt — leave it

| Item | Why it can wait |
|---|---|
| ~~Delete for brand / project / template~~ | **Closed (A7)** — done as gated verbs, no rail controls |
| Project copy-back | Modelled, never wired; no evidence it is missed |
| Per-prompt reference images | Declared and deferred since v1; still no demand |
| Account switcher (rest of WP6) | The panel width — the loud half — is done |
| Packaging / signed `.app` | Single user, runs from source |
| Live UAT inbox | Correct call *until* the corpus is non-empty. **Revisit now** — fix 4 has landed, so captures can start accumulating |
| Other providers (DZINE / Higgsfield) | The model allows them; nothing is asking for them |
| **Per-project brand** | New. A1 gives `(none)`, which unblocks the contradiction; making brand a per-project pointer is the deeper fix and is premature until `(none)` has been lived with |

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
