---
doc: requirements
project: imagedrip
status: approved — WP1–WP3 ready to build; WP4–WP5 follow-on
created: 2026-08-04
purpose: split Template out of Project, and move the source of truth onto disk in per-brand repos
---

# v3 — Templates & Brand Repos

**Status:** proposed. Nothing here is built.
**Predecessor:** [`requirements-v2-usability.md`](requirements-v2-usability.md) (WP1–WP5 built).

---

## 1. Why

ImageDrip works. It is not yet *flexible*, and the reason is a modelling error we can now
name precisely.

The `Project` field is doing two unrelated jobs. David's live `Project.md` reads:

> *"What you need is **not a prompt that invents a shot list**. It is a reusable
> **scene-prompt generator**…"*

That is not a project. **That is a template** — a recipe for a *kind of artifact*, written
to be reused. It is sitting in the field meant for *this particular body of work*, which
is why the character-sheet recipe cannot be pointed at a new subject without copy-paste,
and why "Project" feels badly named.

Second problem: the source of truth is a single unversioned file. Brands, projects,
`Project.md` bodies and queues all live in
`~/Library/Application Support/imagedrip/domain.json` — outside git, outside Dropbox,
outside every repo. Lose it and every configuration is gone. `Project.sourcePath` was
declared for exactly this and never wired.

---

## 2. The model

Four axes. Three exist; one is missing.

| Axis | Is | Reused across | Today |
|---|---|---|---|
| **Brand** | the **style** — palette, tone, personality | every project | ✅ exists |
| **Template** | the **artifact kind** — character sheet / storyboard / infographic | every brand + project | ❌ **missing** |
| **Project** | the **subject** — this body of work and its queue | — | ⚠️ conflated with Template |
| **Run** | one execution | — | ✅ exists (folders) |

The primer becomes a three-part composition:

```
Brand.md      the look            "warm daylight, soft wooden surfaces"
  + Template.md   the artifact      "a 5-view turnaround, 6 expressions, colour palette"
    + Project.md    the subject      "Filipino national heroes, 1890s period dress"
      + Prompt        one line/block  "José Rizal — slight build, round glasses…"
```

### Brand is already solved elsewhere — do not re-author it

The canonical style library is
`~/dev/ad/appydave-plugins/brand-dave/skills/brand/references/<brand>/DESIGN.md`
(`appydave`, `aitldr`, `beauty-and-joy`, `joy-juice`, `challenge-dv`, `supportsignal`, …).

`v-aitldr` already established the correct relationship, and we copy it verbatim:

> `brand/` ← SYNCED brand docs (source of truth = the `brand` skill) … **do NOT edit here**

ImageDrip's Brand becomes a *pointer plus a sync*, not a second copy that drifts.

### What a Template carries

More than a slab of primer text — it shapes the whole intake:

| Field | Why |
|---|---|
| `body` | the primer fragment: the recipe |
| `importFormat` | `lines` or `blocks`. An infographic template is inherently multi-line; a character list is one-per-line. The default should come from the artifact kind, not be re-chosen every time. |
| `listPrompt` | the "ask ChatGPT for N items" helper, tuned per artifact. Currently one generic hardcoded string. |
| `negatives` | hard constraints. **Non-optional for Challenge DV** (below). |
| `examples/` | reference images that define the target |

---

## 3. Folder structure

Mirrors `video-projects/` exactly, because that convention is proven and David already
navigates it.

```
~/dev/image-projects/               ← container, NOT a git repo
├── i-appydave/                     ← own repo   (org: appydave-image-projects)
├── i-aitldr/
├── i-beauty-and-joy/
├── i-joy-juice/
├── i-voz/
├── i-challenge-dv/                 ← PRIVATE — client-confidential
└── i-shared/                       ← cross-brand templates
```

**Naming.** `video-projects/v-<brand>` is the established sibling, so `image-projects/i-<brand>`
keeps the estate symmetrical. David's stated convention was
`imagedrip-projects/imgdrip-<brand>`; that reads fine alone but breaks the `v-`/`i-` rhyme.
**Open question 1.**

### Inside a brand repo

```
i-beauty-and-joy/
├── brand/                          ← SYNCED from the brand skill — DO NOT EDIT
│   ├── DESIGN.md
│   └── sync-brand.sh
├── templates/
│   ├── _template/                  ← copy to start a new one
│   └── nail-art-tile/
│       ├── template.md             the recipe (primer fragment)
│       ├── template.json           { importFormat, listPrompt, negatives }
│       └── examples/               reference images
├── projects/
│   ├── _template/
│   └── 2026-08-04-spring-gallery/
│       ├── project.md              the SUBJECT only
│       ├── prompts.md              the queue (--- blocks)
│       ├── project.json            { brand, template }
│       └── runs/
│           └── 2026-08-04-1233/
│               ├── almond-ombre.png
│               ├── manifest.json
│               └── provenance.jsonl
├── library.json                    ← index: id · path · template · tags · keywords
└── .gitignore
```

**Storage rule, inherited from `v-aitldr`:** *small & reusable → git; big → S3/Syncthing.*
Generated PNGs are small and David wants them kept, so they go in git. Only if a repo
grows past comfort does `runs/**/*.png` move out.

---

## 4. The five brands, worked

Templates marked ★ are the two David named as universally needed; they live in `i-shared`
and are symlinked or copied in.

### `i-appydave` — dev education, 65 video projects, FliVideo workflow

| Template | Produces |
|---|---|
| `concept-diagram` | architecture / flow diagrams for a video |
| `infographic` | prose → visual summary (the future type David flagged) |
| `thumbnail` | YouTube thumbnail variants |
| ★ `storyboard` | shot-by-shot frames from a script |

Sample project: `projects/b71-context-engineering-diagrams/` — mirrors the `b##-` code
convention already used in `v-appydave`.

### `i-aitldr` — AI news, faceless channel, Storyline workflow (Mary runs)

| Template | Produces |
|---|---|
| `movie-poster` | the existing `v-aitldr/movie-posters` idea, as stills |
| ★ `character-sheet` | recurring presenters/avatars, consistent across episodes |
| `thumbnail` | high-contrast news thumbnails |
| ★ `storyboard` | scene frames for narrated pieces |

Sample project: `projects/2026-08-04-movie-posters/` — date-slug convention, as `v-aitldr` uses.

### `i-beauty-and-joy` — nail salon

| Template | Produces |
|---|---|
| `nail-art-tile` | a single design, square, catalogue-ready |
| `treatment-card` | service + price card art |
| `promo-tile` | social//in-shop promotion |

Sample project: `projects/2026-08-04-spring-nail-gallery/`
⚠️ Keep separate from `joy-media/brand-art/`, which curates **captured** photos — a
different lifecycle. Generated output must not be mixed into that store by accident.

### `i-joy-juice` — juice bar *(a distinct brand in the style library, not a sub-folder of B&J)*

| Template | Produces |
|---|---|
| `menu-board` | drink listings as board art |
| `drink-hero` | single-drink hero shots |
| `promo-tile` | seasonal promotions |

Sample project: `projects/2026-08-04-summer-menu/`

### `i-voz` — creative content, client (Vasilios)

| Template | Produces |
|---|---|
| `movie-poster` | film-style posters |
| ★ `storyboard` | shot-by-shot — `v-voz` already generates shot-list docs |
| `lyric-card` | songShine lyric artwork |

Sample project: `projects/2026-08-04-songshine-covers/`

### `i-challenge-dv` — **client, DFV charity, Brisbane. PRIVATE REPO.**

| Template | Produces |
|---|---|
| `resource-illustration` | branded PDF/HTML resource art |
| `stat-card` | the "big purple number" stat treatment |
| `flat-vector-character` | friendly flat characters (e.g. "Lucy") |

Sample project: `projects/2026-08-04-workplace-readiness-checklist/`

> 🔒 **Two hard constraints, both from the brand brief, both non-negotiable:**
>
> 1. **`negatives` MUST include: no AI-fabricated survivors, faces, or testimonials.**
>    Dignity first, no sensationalism. This is the hardest constraint the brand carries
>    and it must be baked into every template in this repo.
> 2. **Client-confidential.** This repo is private and must never reach a public repo or
>    the plugin marketplace.
>
> This single brand is why `negatives` is a first-class Template field rather than
> something you remember to type into the primer.

---

## 5. The build

Five work packages. WP1 alone delivers most of the flexibility; WP2 delivers the
durability.

### WP1 — Template as a first-class concept ⭐ the core change

- `Template { id, name, body, importFormat, listPrompt?, negatives? }` in `shared/domain.ts`.
- `compose(brand, template, project)` — order: style → recipe → subject.
- Persisted alongside brands in `domain.json` (v3 → v4 migration, same silent-upgrade
  pattern as WP1 of v2, with the `.bak`).
- Third card in the CONTEXT rail: `2 TEMPLATE`, renumbering Project to `3`.
- **Template locks during a run**, exactly as Brand does — changing the recipe mid-run is
  the same class of error as changing the style.
- Template drives the import-format default and the LIST PROMPT card's text.
- **Back-compat:** an empty Template composes to today's exact primer. No existing project
  changes behaviour.

*Acceptance:* create a `character-sheet` template, point two different projects at it, run
both, and confirm the manifests carry identical template text with different subjects.

### WP2 — Files on disk as the source of truth

- Wire `Project.sourcePath` (declared since v1, never built) and add the equivalent for
  Brand and Template.
- Read on activate, write back on save. `domain.json` demotes to an *index of pointers*.
- Per-brand **repo root** setting; `brand/` synced from the brand skill via `sync-brand.sh`,
  read-only in the app.

*Acceptance:* delete `domain.json`, re-point at the repo, and lose nothing but window state.

### WP3 — Folder convention + the nested-repo fix

- Default output becomes `<repo>/projects/<project>/runs/<run-id>/`.
- **Fix the git-init trap:** `ensureOutputRoot` checks only `dir/.git`, never ancestors, so
  pointing inside an existing repo silently creates a nested one. Use
  `git rev-parse --is-inside-work-tree` before init.
- `_template/` scaffolds for both templates and projects.

### WP4 — `library.json` and keywords

- Index every generated image: `id · path · template · project · run · tags · keywords`.
- Mirrors `v-aitldr/library.json` field-for-field so one mental model covers both estates.
- This is what makes runs searchable later, which is David's stated reason for keeping
  everything.

### WP5 — Scaffolding a new brand repo

- "New brand repo" action: create the tree, `git init`, seed `brand/sync-brand.sh` from the
  style library, copy `_template/`s.
- Private-by-default flag for client brands (Challenge DV, vOz, SupportSignal, Kiros).

---

## 6. Decisions

Settled 2026-08-04.

1. **Naming — `image-projects/i-<brand>`.** ✅ Decided. Symmetric with `video-projects/v-<brand>`,
   so the two estates read as siblings.
2. **Template scope — `i-shared` first, brand-specific layered on top.** ✅ Decided. The app
   merges both lists, `i-shared` providing the universals (`character-sheet`, `storyboard`)
   and the brand repo adding its own. A brand-local template with the same id **overrides**
   the shared one — last-most-specific wins, the same rule CSS and CLAUDE.md files use.
3. **GitHub org — `appydave-image-projects`.** Default, mirroring `appydave-video-projects`.
   Trivially changed before the first push.
4. **Shared templates are COPIED on create, never symlinked.** Rationale: a symlink breaks
   across machines and in git, and worse — a shared template that silently changes under a
   finished project makes old runs unreproducible. The copy records the source id and a
   version so drift is *visible* rather than prevented. This matches the provenance ethos
   already in the run manifest, which copies the exact primer rather than pointing at it.
5. **Generated images go in git.** Follows the `v-aitldr` golden rule (small & reusable →
   git) and David's stated intent to keep them. Revisit only if a repo outgrows comfort;
   the escape hatch is `runs/**/*.png` in `.gitignore` plus S3, exactly as `v-aitldr` does
   for renders.
6. **outputDir stays as an escape hatch.** Derived from the repo layout by default; the
   per-project override built in v2 remains for one-off destinations.

---

## 7. Out of scope

- Any change to the harvest pipeline, run-folder layout inside a run, or the two timers
  ([`two-clocks.md`](two-clocks.md)).
- Rebuilding Pause/STOP.
- The human-in-the-loop cadence checkpoint (noted as optional-future).
- Migrating existing images out of `~/Pictures/ImageDrip/`. Old runs stay where they are;
  the convention applies going forward.
