---
spec: imagedrip-installability
project: imagedrip
depends_on: appytron   # most changes land in ~/dev/ad/apps/appytron/create-appytron + template
status: proposed
created: 2026-07-19
goal: scaffold + run ImageDrip as a starter app from the AppyTron boilerplate
---

# Spec — Make ImageDrip Installable from AppyTron

**Goal:** `create-appytron` should produce a **runnable** ImageDrip starter in
`~/dev/ad/apps/imagedrip/` — copy the template, wire `@appydave/core`, `npm install`, `npm run dev`
opens a window. Today the scaffold copies files but the result won't install/run. This spec lists
the exact gaps and the changes to close them, plus a zero-code interim path so ImageDrip isn't
blocked.

## Verified current state (2026-07-19)
- `create-appytron <name>` exists (`~/dev/ad/apps/appytron/create-appytron`, 5 tests). It copies
  `template/`, rewrites app name / `appId` / `productName` / publish repo, rewrites the core dep,
  and writes `appytron.json`. `src/scaffold.ts` + `src/index.ts`.
- `template/` exists and builds; renderer is React/Vite/Tailwind/Zustand; main wires
  `createConsole` + Tier-2 primitives.
- **`@appydave/core` is NOT published** — `npm view @appydave/core version` → 404. Template pins it
  as `file:../../appydave-foundation/packages/core`.
- Template has **no** `<webview>` / `BrowserView` / `sendInputEvent` (grep empty).

## Gaps

### G1 — Core dependency won't resolve (blocks `npm install`)
`scaffold.ts` rewrites the `file:` link to `coreVersion` (default `^0.1.0`). Since `@appydave/core`
is unpublished, `npm install` 404s. The `--core` flag can pass a value, but:
- a `file:` path is **location-relative**: the template sits at `apps/appytron/template` (needs
  `../../appydave-foundation/...`), while ImageDrip sits at `apps/imagedrip` (needs
  `../appydave-foundation/...`). The CLI does not recompute this for the target location.

### G2 — Scaffolder refuses an existing folder (blocks this repo)
`index.ts:32` aborts if `targetDir` exists. `~/dev/ad/apps/imagedrip/` already exists (docs + git),
so `create-appytron imagedrip` aborts.

### G3 — No webview harness in the template (blocks Approach C)
ImageDrip's core mechanism (embed ChatGPT, synthesized input, DOM-read) needs a `webview-harness`
recipe + supporting primitive. Not in the template; not a shipped recipe. This is app-build work
the pilot must author and **donate back** to AppyTron — not strictly an "install" gap, but it's
what makes the scaffolded app actually ImageDrip.

## Required changes

### C1 — Local-link mode (`--link-core`)  ·  lands in `create-appytron`
Add a flag that keeps a **`file:` link recomputed relative to `targetDir`**, instead of pinning a
published version:
- `create-appytron imagedrip --link-core` → writes
  `"@appydave/core": "file:<relative path from targetDir to apps/appydave-foundation/packages/core>"`.
- Compute the relative path at scaffold time (`path.relative(targetDir, coreDir)`), don't hardcode.
- **Acceptance:** scaffolded `package.json` has a `file:` link that resolves; `npm install` succeeds
  from `~/dev/ad/apps/imagedrip/`.

### C2 — Scaffold into an existing dir (`--here` / `--into`)  ·  `create-appytron`
Allow writing into a pre-existing folder, **merging** (copy files that don't exist, refuse only on
real file collisions), so an app repo that already holds `docs/` + `.git` can be scaffolded.
- `create-appytron imagedrip --here` (run from inside `imagedrip/`) **or**
  `create-appytron --into ~/dev/ad/apps/imagedrip`.
- Never overwrite an existing file unless `--force`; list any skipped collisions.
- **Acceptance:** running it against the current `imagedrip/` adds the template without touching
  `docs/` or `.git`.

### C3 — `webview-harness` recipe  ·  `template/.claude/skills/recipe/references/webview-harness.md`
Author the recipe (Approach C): a `BrowserView`/`<webview>` with `partition:persist:<name>` for a
real logged-in session; a webview **preload** exposing a minimal typed read/report channel
(MutationObserver → "done" + `<img>` src + rate-limit state); input via
`webContents.sendInputEvent` (synthesized Cmd+V+Enter); selectors isolated in one swappable module.
- Plus `image-harvest` (fetch resolved URL in-session → `FileAuthor`) and `rate-limit-guard`.
- **Acceptance:** ImageDrip runs the recipe and gets a working ChatGPT-hosting view it can drive +
  read. Recipe is contributed back to AppyTron (Sentinel rule: recipes are byproducts of pilots).

### C4 (real fix, later) — Publish `@appydave/core`  ·  `appydave-foundation`
Publish `@appydave/core` to npm (or a private registry / npm workspace) so scaffolded apps pin a
real `^0.x` and `--link-core` becomes optional. Tracked in `appytron-plan §14.6` and the CONTEXT §8
gotcha. Not required for local pilot dev; required before ImageDrip ships to anyone else.

## Interim path — get ImageDrip running TODAY (zero AppyTron code changes)
Until C1/C2 land, scaffold to a temp name and merge by hand:
```bash
cd ~/dev/ad/apps
# 1. scaffold to a temp dir (avoids the existing-folder guard)
node appytron/create-appytron/dist/index.js imagedrip-scaffold \
  --core "file:../appydave-foundation/packages/core"   # correct relative path from apps/*
# 2. merge template into the real repo, keeping docs/ + .git
rsync -a --ignore-existing imagedrip-scaffold/ imagedrip/
rm -rf imagedrip-scaffold
# 3. install + run
cd imagedrip && npm install && npm run dev
```
Note: the `--core "file:..."` value is written verbatim, so give the path correct **from
`apps/imagedrip`** (`../appydave-foundation/...`). Then Approach C still needs C3 before it does
anything ChatGPT-related.

## Where each change lands
| Change | Repo / path |
|--------|-------------|
| C1 `--link-core` | `appytron/create-appytron/src/{index,scaffold}.ts` + tests |
| C2 `--here`/`--into` | `appytron/create-appytron/src/{index,scaffold}.ts` + tests |
| C3 recipes | `appytron/template/.claude/skills/recipe/references/*.md` (donated back) |
| C4 publish core | `appydave-foundation` |
| consume it | `imagedrip/` (this repo) |

## Suggested order
1. **Interim path** → prove the template runs as `imagedrip` locally (unblocks everything).
2. **C1 + C2** → clean, repeatable scaffold into this repo.
3. **C3** → the webview harness — turns the generic starter into ImageDrip (v1 Batch Runner).
4. **C4** → publish core when ImageDrip needs to leave this machine.
