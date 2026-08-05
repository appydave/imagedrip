---
topic: "Package-manager mismatch in an Electron dev loop"
issue: "pnpm blocked Electron's postinstall, leaving an `electron` package with no Electron binary in it"
created: "2026-08-05"
story_reference: "ad-hoc — v3 WP1–WP3 session, after the work packages shipped"
category: "infrastructure"
severity: "high"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# A blocked postinstall leaves a hollow package

## Problem Signature

**Symptoms**: `pnpm run dev` in this repo ended in a 60-line stack trace. The decisive line is
not in the trace — it is six lines above it:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: electron@34.5.8, esbuild@0.21.5, esbuild@0.25.12
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.

[ERROR] Command failed with exit code 1: … pnpm install
    at runDepsStatusCheck (…/pnpm.mjs:254302:7)
```

Two earlier lines were the real tell, and were easy to scroll past:

```
[WARN] Moving electron that was installed by a different package manager to "node_modules/.ignored"
[WARN] 12 other warnings
```

Everything else looked like success — 534 packages added, a tidy dependency list, versions
resolved. `node_modules` existed and was full.

**Environment**: macOS, Node 25.8, corepack pnpm 11.20.0, Electron 34, electron-vite. Repo's
committed lockfile is `package-lock.json` (npm).

**Triggering Conditions**: typing `pnpm` in a repo whose committed lockfile is npm's. Nothing
warns you off; pnpm happily installs and only fails at the very end, for a reason unrelated to
what you typed.

## Root Cause

Two faults stacked, and only the second one is loud.

**1. pnpm 10+ blocks lifecycle scripts by default.** `postinstall` is a supply-chain attack
surface, so pnpm refuses to run it unless the package is explicitly allowed. It writes a
decision file and waits for a human:

```yaml
# pnpm-workspace.yaml — auto-created, with literal placeholder text
allowBuilds:
  electron: set this to true or false
  esbuild: set this to true or false
```

**2. Electron ships as a package that contains no Electron.** The npm package is a small
wrapper; its **`postinstall` is what downloads the ~100 MB platform binary**. Block that script
and you are left with an `electron` directory that looks installed, resolves in `package.json`,
type-checks fine — and cannot launch anything. The same is true of `esbuild`, and of every
dependency that fetches a native binary at install time (`sharp`, `playwright`, `puppeteer`,
`better-sqlite3`, …).

So the failure is not "install broke". It is **install succeeded into a hollow package**.

The one check that settles it in a single step:

```bash
cat node_modules/electron/path.txt          # absent ⇒ postinstall never ran
ls node_modules/electron/dist/Electron.app  # absent ⇒ there is no binary to launch
```

**Why the stack trace misleads.** The trace bottoms out in `runDepsStatusCheck` inside pnpm's own
bundle, which reads like a pnpm bug. It is not. pnpm noticed `node_modules` was out of sync,
auto-ran `install`, and that install exited 1 for a **policy** reason printed above the trace.
The trace describes the messenger. Roughly 55 of those 60 lines are noise.

A third, quieter consequence: the repo briefly had **two lockfiles**. `package-lock.json`
(committed) plus `pnpm-lock.yaml` and `pnpm-workspace.yaml` (untracked, created that minute), with
npm's packages shoved aside into `node_modules/.ignored`. Left in place, the next `pnpm` reproduces
the identical failure.

## Solution

Match the package manager to the committed lockfile.

```bash
# WRONG — pnpm in a repo whose committed lockfile is package-lock.json
pnpm run dev

# RIGHT — the tree is pnpm-shaped and half-broken, so rebuild it with npm
rm -rf node_modules pnpm-lock.yaml pnpm-workspace.yaml
npm install        # electron's postinstall runs → the binary is downloaded
npm run dev
```

If pnpm is genuinely wanted, the fix is to answer the question it asked, then retire the npm
lockfile so the two cannot drift:

```yaml
# pnpm-workspace.yaml
allowBuilds:
  electron: true
  esbuild: true
```

Verified 2026-08-05: `node_modules/electron/path.txt` present, binary present, app launched
(window opened, harness attached), 148/148 tests passing.

## Prevention

- **For Dev**: run `ls *lock*` before installing in an unfamiliar repo, and use the manager that
  owns the committed lockfile. One lockfile per repo, always. The durable fix is a
  `packageManager` field in `package.json` so corepack refuses the wrong tool outright — this
  repo does not have one yet, and should.
- **For Agents / diagnosis**: when an install *reports success* but the app will not start,
  **check for the artifact, not in the stack trace**. Ask "did the binary actually arrive?"
  before reading a single frame. `ERR_PNPM_IGNORED_BUILDS` names the packages whose scripts were
  skipped — that list IS the diagnosis, and it sits above the trace, not inside it.
- **Generalise past Electron**: under pnpm 10+, *any* dependency that downloads a binary in
  `postinstall` is inert by default. Treat "pnpm + native binary dependency" as a known-hostile
  combination requiring an explicit `allowBuilds` entry.
- **For Review**: `[WARN] Moving X that was installed by a different package manager` is never
  cosmetic. It means the tree just changed shape underneath you; stop and check which manager
  the repo actually uses.

## Related

- Story: ad-hoc — 2026-08-05, after v3 WP1–WP3 shipped
- Related learnings: [[one-persist-partition-one-process]] — the sibling failure mode in this
  same dev loop, where accurate log output was dismissed as noise. Both belong to the recurring
  ImageDrip theme that **symptom-based reasoning produces confident wrong answers**; see also
  [[electron-default-user-agent-is-bot-refused]], where a working-looking login masked a
  different fault entirely.
- Related patterns: []
