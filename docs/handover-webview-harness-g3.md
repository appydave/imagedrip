---
handover: webview-harness-g3
repo: imagedrip
audience: a Claude Code session working in ~/dev/ad/apps/imagedrip
created: 2026-07-19
partner: appytron   # owns G1/G2 (scaffold install); receives the donated recipe
---

# Handover — Build the `webview-harness` (Approach C core) + Donate Back (G3)

**How to use:** paste the brief below into a Claude Code session `cd`'d into
`~/dev/ad/apps/imagedrip`. Self-contained; full detail in the webview-harness spec (linked).

**Parallelism:** independent of AppyTron's G1/G2 — this brief uses the *interim* install path, so it
can build the harness now while AppyTron works the scaffold gaps. A later clean re-scaffold wastes
nothing built here.

---

**Task: build the `webview-harness` (Approach C core) + companions, then donate the recipe back to
AppyTron (G3).**

Full spec: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/specs/webview-harness-spec.md`.
Product plan: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/imagedrip-plan.md`.
AppyTron primitives you build on (createConsole, FileAuthor, IpcRouter, WindowManager):
`/Users/davidcruwys/dev/ad/apps/appytron/CONTEXT.md`.

**First, get a running starter** (don't wait on AppyTron's G1/G2) — use the interim install path in
`/Users/davidcruwys/dev/ad/apps/imagedrip/docs/specs/installability-spec.md` §"Interim path":
scaffold to a temp name with `--core "file:../appydave-foundation/packages/core"`,
`rsync --ignore-existing` into this repo, `npm install && npm run dev`.

**Then build, probe-first** (spec §7 — do these before touching ChatGPT):
- **Probe A** (read): `WebContentsView` → local page emitting DOM mutations → confirm the preload's
  MutationObserver reports to main.
- **Probe B** (write): confirm `webContents.sendInputEvent` clicks/keys arrive as
  `event.isTrusted === true`. **This gates the whole approach** — if false, stop and flag.
- **Probe C** (real): chatgpt.com, manual login (persistent partition), a hand-triggered generation
  fires `image-done` with a fetchable URL.

**Build:** `src/main/webview-harness.ts` (the `WebviewHarness` API in spec §API),
`src/preload/webview-preload.ts` (§2 — reports on one namespaced channel, exposes nothing to the
page), `src/main/chatgpt-selectors.ts` (§4 — the one swappable module), plus `image-harvest` (§5,
via `FileAuthor` scoped root) and `rate-limit-guard`. Hit acceptance §9.

**Donate back:** distil the working pattern into
`/Users/davidcruwys/dev/ad/apps/appytron/template/.claude/skills/recipe/references/webview-harness.md`
(+ `image-harvest.md`, `rate-limit-guard.md`) and commit that to `appydave/appytron` — per AppyTron's
"recipes are byproducts of pilots" rule. Commit ImageDrip work to `appydave/imagedrip`.

**Security (non-negotiable, spec §8):** contextIsolation on; preload leaks nothing to the page;
`FileAuthor` scoped root only; STOP key live; conservative cadence + rate-limit pause. Account/ToS
risk is real — mitigations, not guarantees.
