---
doc: handover
project: imagedrip
created: 2026-08-07
updated: 2026-08-07 (second pass — A1–A9 are DONE)
for: the next session
state: A1–A9 shipped at 3d8d4f2. B1–B4 not started and no longer the obvious next move. The
  current goal is USING ImageDrip, not building it.
---

# Handover — ImageDrip

> **⚠️ This file used to say "nothing started" and queue up A1–A9. That work is DONE.**
> If you are here to build A1–A9, stop: read *What shipped* below. Rebuilding it is the exact
> failure this rewrite exists to prevent.

## Launch line

```
cd /Users/davidcruwys/dev/ad/apps/imagedrip
```
```
claude --permission-mode auto --model opus -n imagedrip-drive "You must be running in /Users/davidcruwys/dev/ad/apps/imagedrip — verify your cwd before anything else and STOP if it differs. Read /Users/davidcruwys/dev/ad/apps/imagedrip/docs/handover-2026-08-07-product-fixes.md in full. The goal is to DRIVE ImageDrip for a real image session over its control surface, not to build features. Never write to the ChatGPT webview by any path. Never call repo.attach — it has a known defect that publishes projects into the wrong repo. Ask David explicitly before any run.start, every time."
```

---

## What shipped (3d8d4f2, pushed)

| | Item | Note |
|---|---|---|
| **A1** | Brand can be `(none)` | Nullable end to end, mirrors Template. The select was ALSO `disabled` below two brands — that came off too, and was the half that actually trapped a fresh install. |
| **A2** | `outcome` written on app-quit | `src/main/quit-flush.ts` + a `before-quit` handler. `batch-runner.ts` untouched. |
| **A3b** | `BOOTSTRAP_STALL_MS` raised | The *derived* cap was never the defect — only the bootstrap floor, used while there are no valid samples. |
| **A4** | Live UAT defaults on | An explicit *off* still wins. |
| **A5** | `theme.rename` verb | Verb-only, no rail control. |
| **A7** | `brand.delete` / `template.delete` / `project.delete` | Gated. Each removes nothing from disk. |
| **A6/A8/A9** | Docs | `template.create` now documents the migration sequence; no `RunConfig` UI was built; `user-guide.md § Known limits` corrected. |

**Green:** 316 tests, `npm run typecheck`, `npm run build`.

**Not verified in the running app.** Everything above is proven by tests and a build. Nobody has
clicked it. The one worth checking first: start a dial-in inject, quit mid-run, and confirm the
newest `manifest.json` under `~/Pictures/ImageDrip/smoothies/` now has an `outcome`.

---

## ⚠️ Read before touching repos — `repo.attach` is unsafe

**Do not point ImageDrip at any repo you care about.** `attachRepo` publishes *every* unsourced
project and template into whichever repo you attach, stamped with the **active** brand. Projects
carry no `brandId`, so a blanket publish has nothing to route with.

It is now **gated** (confirm-first) and its verb description says so, but **the underlying defect is
not fixed**. The agreed fix (2026-08-05, still unbuilt): attach becomes IMPORT-ONLY, plus an explicit
per-record "Publish to repo" action. The deeper fix is a `Project.brandId`.

Full detail at the bottom of `docs/working-rules.md`, including the `.gitignore` pattern
(`**/runs/**/*.png`) any future brand repo must have — ~4 MB all-in per image, so a 20-image run is
~80 MB and git cannot delta a PNG.

**Everything works fine without a repo.** Projects live in `domain.json`, images in
`~/Pictures/ImageDrip/<project>/`. That is what `smoothies` does. Leave `smoothies` where it is.

---

## Driving the app from Claude Code

This is the capability v4 WP1–WP3 built, and it is the reason the current goal is reachable.

- **`.mcp.json` is now committed**, so a Claude Code session in this repo gets an `imagedrip` MCP
  server with one tool per published verb. Descriptions, schemas and confirm-first flags all come
  from `GET /v1/verbs` — the server has no policy of its own.
- **Or curl it directly.** Port and bearer token are in
  `~/Library/Application Support/imagedrip/control.json` (0600). `GET /v1/verbs`, `POST /v1/call/:verb`.
- **The app must be running.** The control surface starts with the window.
- **`npm run dev` does not hot-reload main.** Use `npm run dev:watch`, or the running app will keep
  serving the build it started with — which is how a session can spend an hour driving verbs that no
  longer match the source.

**Never** call `run.start` / `run.stop` / `run.pause` / `run.resume` without asking David for that
specific run. They are confirm-first by design, and `run.start` feeds a live paid session that sits
against OpenAI's ToS.

---

## The current goal — use ImageDrip in anger

David, 2026-08-07: *"Brands, projects, style prompts, or content stuff. Run a couple of image
gens… I'd rather control it from a Claude Code session so that you write better context and test
stuff properly."*

So the job is **operating** the app, not extending it. Set up real brands, templates and projects
over the control surface; get prompts queued; run a small batch with David's explicit go; then judge
the output. Live UAT is now on by default, so friction gets captured as it happens — that corpus was
empty for four days and is the highest-value thing a real session produces.

**Do not start B2/B3 (the `uat/` CDP harness).** It tests the UI's own reachability, which is a
different job from using the app, and it is no longer the obvious next move.

---

## What is parked, and why

| Item | Why it can wait |
|---|---|
| **v4 WP4 — the in-app `Context ｜ Chat` pane** | The largest unfinished thing in the project. WP1–3 prove the capability from a terminal; WP4 is the in-app experience. Design already decided: tab the CONTEXT column (`requirements-v4-resident-chat.md §5`). |
| **B1–B4 — the `uat/` CDP tier** | The drivable-skill harness. ImageDrip already HAS a control seam, so driving verbs beats driving pixels; the CDP tier is only for asserting things about the UI itself. |
| `repo.attach` import-only fix | Needed before repos are usable. Not needed while everything lives in `~/Pictures`. |
| Per-project brand | A1's `(none)` unblocks the contradiction; this is the deeper fix and is premature until `(none)` has been lived with. |
| Retiring the `LIST PROMPT` card | Only once WP4 lands — retiring it sooner removes a working path and replaces it with nothing. |
| Live UAT inbox | Was correct to defer while the corpus was empty. **Revisit now** — A4 means captures can accumulate. |

---

## Gotchas that still bite

- **`npm` only, and the version matters.** `packageManager` pins `npm@11.11.0`; this machine has
  10.9.8, which rewrites `package-lock.json` by stripping `libc` fields on every install. Cosmetic —
  `git checkout package-lock.json` before committing. pnpm blocks the postinstall that downloads
  Electron and yields a hollow package.
- **Import Zod from `@appydave/core`, never `zod`.** v3.25 — no `z.toJSONSchema()`;
  `src/main/zod-to-json-schema.ts` projects it by reading `_def`.
- **Zod v3 arrays hold bounds in `_def.minLength`/`maxLength`, not `_def.checks`.** Already fixed;
  do not regress.
- **`electron-vite dev` consumes `--` args itself** — `npm run dev -- -- --flag=value` (two `--`).
- **A fresh Electron profile looks exactly like David's real data.** `seedDefaults()` seeds brand
  "Beauty & Joy" and project "Smoothies" with 8 prompts. When isolating with `--user-data-dir`,
  "Smoothies" appearing is **not** evidence you hit the real store — the real one has 22 prompts.
- **`WebviewHarness.feed` proceeds when it cannot find the composer** — it warns and pastes into
  whatever holds focus. That is why the engine-readiness gate exists. Do not weaken it.
- **One ImageDrip at a time.** The ChatGPT view holds an exclusive profile lock; a second instance
  surrenders and focuses the first.

---

## Ruled out — do not reintroduce

- **AppleScript for driving the app.** A coordinate click always "succeeds"; during the review one
  landed on a different window entirely.
- **A `ui.state` verb** for a test harness — it would test its own hook.
- **A `RunConfig` settings panel** — `run.start` already takes all five fields (A8).
- **Widening the control-surface bind** — SSH port-forward to `127.0.0.1:7180` instead.
