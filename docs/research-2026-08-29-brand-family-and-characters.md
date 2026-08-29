---
doc: research
project: imagedrip
status: RESEARCH — analysis only. Nothing renamed, nothing created, no schema changed. For David's ruling.
created: 2026-08-29
purpose: four boundary questions — Storyline's model, where characters belong, whether brands need an
  IMAGE.md, and whether two proposed renames are worth their refactor
scope_note: touches the brand-file family (appydave-plugins) and Storyline (flivideo) as REFERENCE.
  No file outside this document was modified.
---

# Brand-file family, characters, and the Storyline boundary

Four questions, four verdicts. Each section closes with what the investigation did **not** establish.

**Headline, before the detail:**

| # | Question | Verdict |
|---|---|---|
| 1 | Adopt Storyline's shape in ImageDrip? | **No — but the integration seam is real, and it is Storyline's own declared direction** |
| 2 | Does ImageDrip need a Character record? | **No.** Prose in `Project.body` already covers it. One real gap, and it is not a Character entity |
| 3 | Add `IMAGE.md` to brands? | **Yes — where there is stable content. Not as a mandatory slot.** 2 of 3 brands tested have content waiting; 1 has none |
| 4 | Rename `VIDEO.md` and `VERBAL-STYLE.md`? | **No to both.** 69 files, 235 mentions, plus a skill rename — and the names are not the actual problem |
| 5 | Is animation an axis of ImageDrip? | **No — and it is not homeless either. `Template` already absorbs it.** Added after David's ruling of 2026-08-29 |

---

## 1 · Storyline's model, and the boundary

### 1.1 There are two Storyline models, and they disagree

This matters more than anything else in this section, and it would be easy to miss.

**The shipped app** — `~/dev/ad/flivideo/storyline-app/shared/types.ts`, 253 lines:

```
StorylineData
  ├─ metadata          { title, projectName, generationTechnique, totalBeats, … }
  ├─ contextDocuments  [{ type, reference, summary }]
  └─ beats: StoryBeat[]
        ├─ timestamp      { start, end, duration, startSeconds, endSeconds }
        ├─ narrative      { text, speaker }
        ├─ visualContext  { shotId, shotNumber, setting, ambiance,
        │                   characters: string[],  ← plain strings
        │                   visualDescription, establishingShot, detailShot }
        ├─ prompts        { images: ImagePrompt[], animations: AnimationPrompt[] }
        ├─ media          { thumbnails[], fullImages[], generatedImages[] }
        ├─ feedback       { status, comments, reviewedAt, reviewedBy }
        └─ beatWords      { word-level Whisper timing }

ImagePrompt      { shotNumber, variationNumber, type, prompt, processed, imageFile? }
AnimationPrompt  { shotNumber, variationNumber, prompt }
```

**The canonical schema** — `~/dev/ad/brand-artifacts/data-systems/schemas/storyline-project-schema.json`,
JSON Schema draft-07, dated **December 2025**, sitting alongside `appydave-brand-schema.json`,
`dam-brand-schema.json` and `system-interconnections-schema.json`:

```
{ id, title, metadata, beats[],
  cast:      [{ id, name, role, description }]        ← characters ARE first-class
  artifacts: [{ id, name, type, description }]
  styleGuide: { brandReference,                       ← "Reference to brand guidelines (e.g. 'appydave')"
                colorPalette[], visualStyle,
                toneDescription, cinematography } }
```

**The app does not reference that schema.** Verified: no file under `storyline-app/` mentions
`storyline-project-schema`. So `cast[]`, `artifacts[]` and `styleGuide` are **an architecture-as-code
design artifact, not a shipped contract.** The app implements `characters: string[]` and has no
styleGuide at all.

> **The trap this avoids.** The canonical schema models three of the exact things ImageDrip is
> straining on — cast, artifact kinds, and a styleGuide that *points at a brand*. It would be very
> easy to read that as "Storyline already solved this, copy it." **It did not ship it.** Adopting it
> would mean adopting an unimplemented design from a sibling app, which is how a second unbuilt
> model gets created rather than one.

### 1.2 The units are genuinely different, and the difference is the boundary

| | Storyline | ImageDrip |
|---|---|---|
| Unit | one **narrated timeline** → beats → shots → prompt variations | one **prompt → one image, filed** |
| Anchored to | wall-clock time — every beat has `startSeconds`, `endSeconds`, and Whisper word-level timing | nothing temporal |
| Origin | a transcript | a list somebody wrote |
| Output | prompts, feedback, curation decisions | image files and a manifest |

**Storyline is time-anchored and ImageDrip is not.** `StoryBeat.timestamp` and `beatWords` exist
because the storyline is derived from a narration that already exists. Nothing in ImageDrip's work
has a timeline: nail-art tiles, drink heroes and catalogue plates have no narration to align to.

Adopting Storyline's shape would import beats, timestamps and word-level timing into an app whose
North Star says *"three fields carry the whole thing"* and *"not a cockpit to be mastered."*
**David's position is correct and the check confirms it rather than merely agreeing with it.**

### 1.3 The seam is real, and it is Storyline's own stated direction

Not speculative. Three pieces of evidence:

1. **Storyline already produces exactly what ImageDrip consumes.** `ImagePrompt.prompt` is a prompt
   string with a stable identity (`shotNumber`-`variationNumber`). ImageDrip imports one prompt per
   line, with an optional `subject | prompt` pipe form. A Storyline → ImageDrip export is a one-line
   transform: `${shotNumber}-${variationNumber} | ${prompt}`.
2. **Storyline's own CLAUDE.md declares the direction**, unprompted by this investigation:
   > *"**Future Vision:** Generative content creation platform for faceless video production —
   > generating scripts, image prompts, animation prompts, and integrating with automation pipelines
   > … The app will serve as **the creative control center that triggers and manages automated video
   > production workflows.**"*
3. **Storyline is live, not a prototype.** Real data on disk at
   `/Users/davidcruwys/dev/video-projects/v-appydave/legend-of-appydave/data/storyline.json`.

So the seam is: **Storyline owns story, cast, timing and prompt authoring. ImageDrip owns
generation, harvest and filing.** Storyline already has an `ExportFormat` union
(`'json' | 'csv' | 'pdf'`); this is a fourth member, not a new subsystem.

**But the seam covers only part of ImageDrip's work, and this must be said plainly.** Of the seven
runs inventoried in the axes artefact, **three are narrative** (Kybernesis agent office, AITLDR
storyboards, vOz songs) and **four are not** (nail tiles, drink heroes, stat cards, thumbnails).
Catalogue work has no story, no beats and no transcript. **Storyline cannot be ImageDrip's only
front door**, and the pressure to model subjects inside ImageDrip does not disappear — it halves.

### 1.4 What §1 did NOT establish

- **Whether the export actually works.** No export was written, run, or tested. The transform is
  trivial *on paper*; nothing here proves Storyline's prompts are well-formed for ImageDrip's
  importer, or that `type` on `ImagePrompt` (an untyped string) carries anything ImageDrip needs.
- **Why the schema and the app diverged.** The schema is dated Dec 2025 and the app's types carry
  "Story 5.3+ / 5.5+ / 5.6+" migration comments. Which came first, and whether `cast[]` was tried
  and abandoned or never attempted, was not investigated.
- **Whether Storyline is maintained.** One live data file was found. Commit recency, open work and
  whether anyone is actively developing it were not checked.
- **Anything about `poem-os/poem/data/storyline/`**, which holds a *third* storyline schema
  (`storyline-output-schema.json`) that was not opened. There may be three models, not two.

---

## 2 · Where characters belong

### 2.1 Verdict: no Character record in ImageDrip

Three independent reasons, in ascending order of strength.

**(a) Neither Storyline model treats characters the way a Character record implies.** The shipped app
uses `characters: string[]` — names on a shot, nothing more. The canonical schema's `cast[]` is
described as *"Global list of all people appearing in **project**"* — **project-scoped, not a
library.** Even the richer design does not make characters reusable across projects.

**(b) ImageDrip's existing prose path already delivers the requirement.** The requirement is *"Maya
remains Maya"* across every scene and every style. `compose(brand, template, project)`
(`src/shared/domain.ts:289`) posts the project body **once per conversation**, so a cast description
in `Project.body` reaches every prompt in the run by construction. That is precisely the continuity
guarantee, and it needs no new entity.

**(c) The style bible already proves the split works as prose.** Six visual languages were written
over one production design, and the cast survived all six — *"Maya remains Maya… the experiment
changes the visual language, not the underlying production design."* The cast was carried in prose
throughout that experiment and it held.

### 2.2 The one concrete gap, and it is not a Character entity

There is a real failure prose cannot cover: **a character's visual identity is more reliably held by
a reference image than by a description.** "Maya, mid-30s, cropped dark hair, green cardigan" drifts;
a turnaround sheet does not.

ImageDrip already has the field — `Prompt.refImage?: string` (`domain.ts`), commented *"Deferred
(model allows it)"* — and **no harness path attaches an image**. So the gap is:

> **reference images are declared and unbuilt** — not *characters are unmodelled*.

That is `rulings-open.md` **R5** (the reference-image paste path), already on the sheet, already
recommended for authorisation-in-principle. **A Character record would not fix it and building one
would not advance it.** If character consistency becomes the binding problem, the thing to build is
R5, not an entity.

### 2.3 What §2 did NOT establish

- **Whether prose actually holds continuity in practice.** The six-style experiment produced style
  *bibles*, not images — only style 06 reached generation, and it harvested 1 image of 9 attempted.
  **The claim that a prose cast description keeps Maya consistent across scenes has never been
  tested at generation time on this machine.** Absence of a failure here is absence of a test, not
  evidence of success.
- **How prose scales.** Three characters fit comfortably in a project body. Whether twelve do, and
  whether a primer carrying twelve character descriptions still leaves room for the actual prompt,
  was not measured.
- **Cross-project reuse.** If Maya later appears in a second show, prose means copy-paste and the two
  copies drift. Nobody has asked for that yet, so it is noted rather than costed.

---

## 3 · `IMAGE.md` — recommended, but not as a mandatory slot

### 3.1 The gap is real and one brand has already named it

Current family under `brand-dave/skills/brand/references/`:

| File | Brands | Governs |
|---|---|---|
| `DESIGN.md` | 11 | surfaces — hex, typefaces, radius, spacing |
| `VIDEO.md` | 5 | motion |
| `VERBAL-STYLE.md` | 2 | words |

**Nothing carries prose an image model can use.** `#059669`, `Space Mono`, `radius: 0` produce
nothing when fed to a generator; they require translation into "operator terminal, warm paper ground,
hard edges, no gloss" — and that translation exists nowhere.

### 3.2 Tested against three brands, and they do not agree

| Brand | Stable imagery content today | Verdict |
|---|---|---|
| **AITLDR** | **DESIGN.md already declares the missing file**: *"Thumbnails are a separate design mode — they don't follow the light/dark [rules] … document (`thumbnail-system.md` — **not yet created**)"*, plus five recorded observations from an April 2026 thumbnail review | **Strongest case.** The content exists, the gap is already documented, and someone already chose a filename |
| **AppyDave** | One instruction, buried mid-DESIGN.md and homeless: *"photographs of the actual job with the grease still on it."* That is a genuine, stable, reusable imagery rule sitting in a tokens file where no generator will find it | **Yes.** Content exists; it has nowhere to live |
| **Kybernesis** | **Nothing.** Zero imagery guidance across the whole DESIGN.md — no thumbnail, photograph, illustration or imagery language at all | **Not yet.** Kybernesis ships an *app UI*; it may have no depicted imagery to specify |

**So: recommend the file where content exists, and do not mandate it.** A per-brand slot everyone
must fill produces empty files, and an empty spec file is worse than a missing one — it reads as
"specified, nothing to say" rather than "not specified."

### 3.3 Keep it distinct from style bibles — they are different objects

| | `IMAGE.md` | Style bible |
|---|---|---|
| Describes | the brand's **own face** — thumbnails, hero shots, diagrams | a visual language for content the brand **produces** |
| Example | what an AITLDR thumbnail looks like | the agent office rendered in retro pixel |
| Stability | written once, changes at rebrand | chosen per property, six candidates at a time |
| Derivable from the brand? | yes — it *is* the brand | **no** — brand constrains, does not determine |

Retro pixel is not what Kybernesis looks like. It is a show Kybernesis makes. Both files can exist
for the same brand without overlapping.

### 3.4 What §3 did NOT establish

- **Only three of eleven brands were tested.** Beauty & Joy, Joy Juice, Challenge DV, vOz,
  SupportSignal, Supporting Potential, Guy Monroe and Anthropic were not examined. The 2-of-3 ratio
  is not a projection.
- **Nobody has written one.** Whether a brand's imagery can be usefully specified in prose — and
  whether a generator honours it — is untested. The recommendation rests on the content existing and
  being homeless, not on the file working.
- **Whether `thumbnail-system.md` is the better name.** AITLDR already chose it, and thumbnails may
  be a narrower and more tractable scope than "imagery". Not adjudicated.

---

## 4 · The two renames — recommend **not** doing either

### 4.1 `VERBAL-STYLE.md` → `VOICE.md`: no

**The collision is real and specific to this estate.** David runs Kokoro TTS locally (`~/bin/speak`),
holds an `ELEVENLABS_API_KEY`, and has a `voice-coach` skill in the showrunner crew. `VOICE.md` would
then mean both *how the brand writes* and *which synthesised voice speaks* — in a repo where both are
live concerns.

That is exactly the one-word-two-jobs failure that forced `Template` out of `Project`, and that this
whole conversation has been unpicking in ImageDrip's `Brand` field. **Introducing a fresh instance of
it, deliberately, to save six characters, is a bad trade.**

If a shorter name is wanted: **`WRITING.md`** or **`TONE.md`**. Both unambiguous, neither collides.
`WRITING.md` is the better of the two — tone is one property of writing, not the whole of it.

### 4.2 `VIDEO.md` → `VIDEO-MOTION.md`: no, it is redundant

Verified by reading all three of AITLDR's, AppyDave's and Kybernesis's. **Every one has the same
skeleton:**

```
## The one-line shift
## What changes vs DESIGN.md (the fork table)     ← literally a diff against DESIGN.md
## The N motion rules (the actually-new part)
## Keep (survives from DESIGN.md unchanged)       ← literally an inheritance list
## Don'ts (video-specific)
```

These are **medium forks of one design system**, and they say so in their own headings. "Video"
already implies motion; `VIDEO-MOTION.md` adds a word that the file's own §"motion rules" already
carries. It would be pure cost.

### 4.3 The family logic that *does* follow from the contents

The files are organised by **medium**, and the naming is already coherent:

| Medium | File | Status |
|---|---|---|
| Static surfaces | `DESIGN.md` | 11 brands |
| Motion | `VIDEO.md` | 5 brands |
| Words | `VERBAL-STYLE.md` | 2 brands |
| **Generated imagery** | **— missing —** | **0 brands** |

**David's confusion about "which is which" is not caused by the names. It is caused by the set being
incomplete.** A family of three where one medium has no member is hard to hold in your head; you keep
reaching for the missing one and finding nothing, which reads as *"I must have the names wrong."*

One genuine wrinkle worth recording: **`DESIGN.md` is doing double duty** — it is both *the base
system* (which `VIDEO.md` inherits from) and *the static-surface variant*. That is a mild
one-word-two-jobs of its own. It is not worth fixing; the inheritance is explicit in every VIDEO.md's
"Keep" section, so nothing is silent about it.

### 4.4 The refactor cost, measured

| Rename | Files touching it | Total mentions |
|---|---|---|
| `VERBAL-STYLE` → anything | **40** | **133** |
| `VIDEO.md` → anything | **29** | **102** |
| **Both** | **~69** | **~235** |

**And `VERBAL-STYLE` carries a hidden multiplier: the skill name encodes the filename.**
`brand-dave/skills/verbal-style-forge/` would have to become `voice-forge` / `writing-forge`, which
cascades into:

- `verbal-style-forge/SKILL.md` — 13 mentions
- `verbal-style-forge/references/method.md` — 2, `template.md` — 1
- `brand-dave/.claude-plugin/plugin.json` — the skill registration
- `appydave-plugins/INDEX.md` — the plugin index
- `structure-forge/SKILL.md` and `references/method.md` — its sibling references it
- `showrunner/SKILL.md`, `scribe/SKILL.md`, `voice-coach/SKILL.md` — the crew that consumes it
- `eve-maker/scripts/generate-brand-data.mjs` — **the one consumer that is code, not prose**, and the
  only one where a missed reference fails silently rather than reading oddly

Plus brains: `brand-ambassador-design.md`, `methodology/cadence-alignment-method.md`,
`agent-briefs/joy.md`, `agent-briefs/alex.md`, `video-as-code/brand-skin-protocol.md`, and the two
`docs/aitldr-*` runbooks.

**~235 edits and a skill rename, to fix a naming preference, in a family whose actual problem is a
missing member.** Recommend declining both, and spending the effort on §3 instead.

### 4.4a If David overrules and wants it done anyway

Do `VIDEO.md` alone — 29 files, no skill rename, no code consumer, and mechanically safe. Leave
`VERBAL-STYLE` where it is; it is the one carrying the collision risk *and* the multiplier.

### 4.5 What §4 did NOT establish

- **The counts are grep counts, not edit counts.** `grep -c` over `~/dev/ad/appydave-plugins` and
  `~/dev/ad/brains` only. Other machines were not checked, and `rulings-open.md` R6 already records
  that the M4 and Roamy disagree about directory contents. **The real number is at least this, and
  possibly higher.**
- **No consumer was opened to see whether the reference is load-bearing.** A mention in a brains
  narrative doc is cosmetic; the mention in `generate-brand-data.mjs` is not. They are counted the
  same here.
- **Whether anything resolves these filenames at runtime** — a glob, a config key, a skill frontmatter
  path — was not traced. If something does, a rename breaks it silently and the cost is higher again.
- **Nothing was renamed, and no rename was rehearsed.** No `git mv`, no dry run.

---

## 5 · Is animation part of ImageDrip? No — and Template already absorbs it

**Added 2026-08-29, after the first four sections.** David raised it and the answer changed the axis
count, so it is recorded here rather than left in a conversation.

### 5.1 The question

An earlier pass listed **Motion** as a sixth axis with no slot, and scored a "Strain D" against six of
seven worked runs. David's objection:

> *"We don't actually do animation the way you might do with an animation prompt. It's really an
> external coded system of JavaScript, so I don't know that animation makes sense."*

### 5.2 There are two kinds of animation in this estate and neither belongs to ImageDrip

| | Mechanism | Lives in | Prompt-driven? |
|---|---|---|---|
| **Coded motion** | multiplane parallax, camera drift, per-layer travel | `scene/config.js` — `travel`, `bob`, camera scale/drift, CSS filters (Hyperframes / GSAP) | **No.** JavaScript config |
| **Generated motion** | a video model animates a still | Storyline's `AnimationPrompt { shotNumber, variationNumber, prompt }`, aimed at Sora / Runway / Kling per its own CLAUDE.md | Yes — **but it is Storyline's, not ImageDrip's** |

ImageDrip generates still images. It touches neither.

### 5.3 The decisive point: the motion decision is already expressed, as the Template

`isolated-depth-plate` **is** a motion decision. Its body specifies one depth band per image, a flat
magenta `#FF00FF` field for keying, and paint order back-to-front — every rule there because of
parallax. **ImageDrip does not need to know why.** It needs to know what shape to make, which is
exactly what an artifact kind is.

Tested against every technique in `animation-techniques.md`:

| Technique | What the generator must do differently | Where it lives |
|---|---|---|
| Multiplane parallax | separate depth bands, magenta key | **Template** — `isolated-depth-plate` |
| Cut-out puppet rig | limbs, head, jaw as separate elements | **Template** |
| Sprite animation on twos | 2–3 pose frames per action | **Template** |
| Stop-motion substitution | discrete pose variants | **Template** |
| Gentle dolly / Ken Burns | *nothing* | — |
| Kinetic type / number count-up | *nothing* | — |

**Every technique either implies an artifact kind, or asks nothing of the generator at all.** There
is no case in the six where motion needs a slot of its own. `Template` absorbs it correctly, and the
run manifest already records which template a run used — so a folder of magenta plates still explains
itself months later.

### 5.4 What survives — a sequencing rule, not schema

The technique must be chosen **before** the prompts are written, because the cut cannot be recovered
afterwards. `animation-techniques.md` establishes this by measurement rather than assertion:

> *"This is **regeneration, not conversion**. Nothing below can be extracted from what we already
> have."* — the 38 existing images are JPEG/sRGB, three channels, no alpha.

That is a workflow note for whoever writes the prompts. It is not an axis, and nothing in ImageDrip
should model it.

### 5.5 What §5 did NOT establish

- **It does not cover prompt-driven video generation.** If ImageDrip were ever asked to produce
  clips rather than stills, `AnimationPrompt` becomes relevant and this verdict would need
  re-opening. Nobody has asked, and this section assumes the still-image scope the North Star states.
- **The six techniques come from one document.** `animation-techniques.md` covers the six agent-office
  styles. A seventh technique that needs something Template cannot express is not ruled out — it is
  merely not present in anything examined.
- **No technique was executed.** The mapping is read from the plan, not from a rendered scene. Only
  style 06 reached generation, and it harvested 1 image of 9 attempted.
- **This corrects a published artefact.** The axes artefact scored Motion as an axis and Strain D as
  hitting six of seven runs. Both were withdrawn in its rev 3. The withdrawal is kept visible on that
  page rather than deleted, for the same reason it is recorded here.

---

## What this document does not do

It recommends. It does not act. Nothing outside this file was created, renamed, or modified —
no `IMAGE.md` was written, no brand file was touched, Storyline was read and not changed, and
ImageDrip's schema is exactly as it was.

**Four rulings are waiting on David** — §5 is already ruled and is recorded, not pending. Only the
third of these has any urgency:

1. Storyline seam — **build it or not** (cheap, and halves the pressure to model narrative in ImageDrip)
2. Character record — **recommend no**; if character drift becomes the binding problem, build R5 instead
3. `IMAGE.md` — **recommend yes for AITLDR and AppyDave**, not for Kybernesis, not as a mandatory slot
4. Renames — **recommend no to both**; if overruled, `VIDEO.md` alone is the safe half
