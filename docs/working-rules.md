---
doc: working-rules
project: imagedrip
status: standing — re-apply every turn
created: 2026-07-19
source: David's process reset (2026-07-19)
---

# Working Rules — how to work with David on ImageDrip

These are standing instructions. Re-read and re-apply them every turn. David should never have
to repeat one.

## Process
1. **Refine the chosen thing — never replace it.** When David picks an option ("I like #2"),
   improve THAT option. Do not invent a brand-new alternative. Iterate on the winner only.
2. **Finish one design to completion before moving on.** No half-finished mocks, no "here are 5
   fresh directions." Take the current winner, polish to done, hold it stable. Small changes, same
   artifact.
3. **Keep a real, clickable index.** One page listing every design, doc, and spec, with links that
   actually work (served over http so nothing is a dead `file://` link). Make it navigable before
   telling David to "look at" anything.
4. **Remember the rules already given.** Maintain this list; re-apply it every time. Don't make
   David say the same thing twice.
5. **Confirm before building.** State what you're about to do in one line and let David approve.
   Don't disappear and return with something he didn't ask for.

## Domain / brand (already established — do not re-ask)
6. **AppyDave is light theme, always.** Warm cream (`#faf5ec`), brown text, amber/yellow accents.
   Never a dark console. (Brand tokens: `brand-dave:brand` → AppyDave.)
7. **The ChatGPT panel is native — we don't design it.** Show it honestly (dark, their UI); design
   only the frame around it.
8. **We can't show "Generating."** Our app only tracks **Queued** and **Harvested**. Generating
   happens inside ChatGPT — that panel is the only "generating" view. No Generating lane/column.

## Current state (update as it moves)
- **Chosen design:** light-theme **Pipeline** — `.mochaccino/designs-v2/pipeline-light.html`.
  Being finished to completion. Do not replace it.
- **Index:** `overview.html` (repo root) — the clickable index of everything.
- **v2 (Usability & Project Identity, `docs/requirements-v2-usability.md`):** WP1 + WP2 built —
  WP1: multi-project store (silent migration), visible per-project output dirs
  (default `~/Pictures/ImageDrip/<slug>`), per-run `<outputDir>/<run-id>/` folders with
  `manifest.json` + `provenance.jsonl`, run-history UI + Reveal in Finder, draft-until-Create
  new-project flow. WP2: brand editable/selectable/creatable (run-state lock, labelled),
  project rename, autosave on debounce/blur + per-card saved/unsaved indicator, Copy
  Primer/Prompt descriptions + exact previews, listing-prompt helper card.
  WP3: import is now explicit Add-to-queue (append, ids continue) vs Replace-queue
  (two-step confirm; harvested prompts always survive).
  WP4: Dial-in is real — ⚡ Initialise project (primer into the LIVE chat + submit via
  the proven feed() path) is the Dial-in primary action; queue rows hover-reveal
  ⚡ inject (feeds that one prompt, harvests into a lazily-opened dial-in run record);
  passive seen-learning stops old images being mis-attributed; Auto loop excluded
  while injecting and vice versa.
  WP5: Run theme is a visible choice — **Continue in this chat** (no new conversation,
  no primer; recommended once dial-in touched the chat; entry-time warning that mid-run
  re-primes revert to saved Project.md) vs **Start a fresh chat** (v1 behaviour).
  STOP renders only when running/paused; LIVE/PAUSED/IDLE state chip; STOP-vs-Pause
  defined in tooltips. Pacing gate re-verified by unit tests (fake harness), untouched.
  Settle defaults bumped (load 4s, primer 9s) for the paste-without-enter symptom.
  **Chaperone advisory-1 applied (all 8 items + 3 spec corrections):** sync entry latch on
  start/injects; closure-derived store updates; .bak before migrating writes + fail-loud on
  unrecognizable docs; git-inited output dirs; run-id seeding from disk; feed-in-flight guard
  on passive seen-banking; fail-loud run records; chat-primed truth in main + Continue as the
  real default. Requirements doc corrected (chunk path untested / git-commit gotcha / WP7 fonts).
  **STOPPED before WP6 per ruling — awaiting David's in-app acceptance of WP1–WP5**, especially
  the WP5 dial-in→Continue scenario and the real domain.json migration.
- **v3 (Templates & Brand Repos, `docs/requirements-v3-templates-and-repos.md`):** WP1–WP3 built.
  WP1: **Template** is a first-class axis between Brand and Project — the ARTIFACT KIND
  (character sheet / storyboard / infographic), carrying `body`, `importFormat`, `listPrompt`
  and `negatives`. The primer is now `compose(Brand, Template, Project)`; a project points at
  a template (per-project, per §3 `project.json`), Template locks during a run exactly as
  Brand does, and it drives the import-format default and the LIST PROMPT card's wording.
  **Back-compat is proven, not assumed:** the v3→v4 migration creates no templates and points
  no project at one, and an absent/empty template composes byte-identically to the pre-v3
  primer (`test/domain-compose.test.ts`).
  WP2: `src/main/repo-store.ts` — the brand repo on disk is the SOURCE OF TRUTH
  (`i-<brand>/{brand/,templates/<id>/,projects/<id>/}`), mirroring `video-projects/`. Read on
  activate, write on save; `domain.json` demotes to an index of pointers. Attach imports what
  is there (disk wins) and publishes what is not. **`brand/DESIGN.md` is only ever READ** — the
  `brand` skill is canonical, so a sourced brand body is read-only in the app.
  WP3: default output is `<repo>/projects/<project>/runs/<run-id>/`; `_template/` scaffolds
  for templates and projects; and the **nested-repo trap is fixed** — `ensureOutputRoot` now
  asks `git rev-parse --is-inside-work-tree` (walks ancestors) instead of looking for
  `<dir>/.git`, and additionally declines to init inside a brand repo root, which is WP5's job.
  **Not done: WP4 (`library.json`) and WP5 (scaffold a new brand repo, git init, private flag).**
  `~/dev/image-projects/i-*` exist but are deliberately NOT git repos yet — do not init them.
- **Live UAT built (2026-08-03, `docs/live-uat.md`)** — the acceptance pass now has a capture
  layer. ⚑ toggle in the top bar (off by default, persisted); ⚑ on every cockpit region raises a
  screen-anchored `Snag`; harvested tiles are multi-selectable and take an `ImageVerdict` carrying
  the EXACT primer from that run's manifest. Two anchors → two stores, appended as JSONL to
  `~/Library/Application Support/imagedrip/live-uat/`. Sidecar only: it never writes `domain.json`
  or a run manifest. **No inbox** (no resolve/delete/bulk-clear) — known debt if it outlives the
  first processing pass. Acting on the pile is `live-uat-process`, not an app feature.
