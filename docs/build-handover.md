---
doc: build-handover
project: imagedrip
status: ready to build v1 (Batch Runner)
created: 2026-07-19
audience: a FRESH Claude Code session cd'd into ~/dev/ad/apps/imagedrip
---

# ImageDrip — Build Handover (v1 Batch Runner)

**You are building in `~/dev/ad/apps/imagedrip/`.** Read this, then build. It is self-contained —
you do not need any prior chat. Follow `docs/working-rules.md` at all times.

## What ImageDrip is (1 line)
A native desktop (Electron) sidecar that generates images by driving a real logged-in **ChatGPT**
session embedded in the window — **no paid API**. It feeds prompts, watches the DOM for finished
images, and auto-downloads + names + routes them into a project's output dir.

## Standing rules (do not violate — full list in docs/working-rules.md)
- **AppyDave = light theme, always** (warm cream `#faf5ec`, brown text, amber/yellow accents). Not dark.
- **The ChatGPT panel is native — we do NOT design it.** Show it honestly.
- **No "Generating" state in our UI.** We only track **Queued** and **Harvested**; generating lives
  inside ChatGPT (its panel is the only "generating" view).
- Refine chosen artifacts; finish one thing before moving on; confirm before building; keep the
  `overview.html` index current.

## What is ALREADY built + verified (do NOT rebuild)
The hard part — the ChatGPT driver — is done and **live-verified** (Probe C, 2026-07-19):
- `src/main/webview-harness.ts` — WebContentsView host + synthesized input + DOM-read (Approach C)
- `src/preload/webview-preload.ts` — MutationObserver → reports image-done / rate-limit on one channel
- `src/main/chatgpt-selectors.ts` — **live-verified** selectors (`latestAssistantTurn:'[class*="imagegen-image"]'`)
- `src/main/image-harvest.ts` — fetch image URL in-session → FileAuthor → named + routed
- `src/main/rate-limit-guard.ts`
- Built on AppyTron primitives (createConsole, WindowManager, IpcRouter, FileAuthor, Store) — see
  `~/dev/ad/apps/appytron/CONTEXT.md`.
- The app was scaffolded via the interim install path and builds. Verify: `npm run build && npm run dev`.

## What to BUILD for v1 (the Batch Runner)
The **cockpit UI (renderer) + the run wiring.** The chosen design is the light-theme Pipeline:
- **Design to implement:** `.mochaccino/designs-v2/pipeline-light.html` (open `overview.html` to view).
  Layout: collapsible **CONTEXT** rail (Brand🔒/Project✎ + copy buttons) · **QUEUED** lane · **HARVESTED**
  grid (the star) · native **ChatGPT** panel (live) · top bar (progress, re-prime countdown, mode, STOP).
- **Wire the run:** import a prompt list → Queued → feed via the harness → on image-done, harvest →
  name → route to the project output dir → advance → **re-prime a fresh chat every ~15–20**.
- Domain model (Brand.md + Project.md compose a primer; short prompts inherit): `docs/imagedrip-plan.md §3`.

### Build order (from docs/ux-and-workflow.md §v1 build order)
1. **Domain + Store** — Brand / Project / Prompt / Theme / Run; import a simple prompt list; compose() → primer.
2. **Cockpit shell** — the light Pipeline layout (React/Tailwind/Zustand) + STOP (existing global shortcut) +
   embed the proven webview in the ChatGPT column (bounds-synced).
3. **Run wiring (Auto)** — feed → detect done → harvest → route → re-prime per chunk. Progress UI.
4. **Prove on one real theme** (~15–20 images) end to end.

## Critical gotchas (bite if ignored)
- **Completion de-dupe:** the observer fires image-done repeatedly, flip-flopping srcs. Use a **seen-set →
  first UNSEEN src** rule (NOT "last container"), else an image gets mis-attributed to the wrong prompt.
- **Paste:** use `webContents.paste()` — synthesized Cmd+V is a no-op in ChatGPT's contenteditable (verified).
- **Preload path is `.mjs`** (electron-vite emits `out/preload/index.mjs`); wrong path = `window.imagedrip` undefined.
- **`@appydave/core`** is a local `file:` link (unpublished); keep it for local dev.
- **FileAuthor scoped root** — harvested images may land ONLY under the project output dir; each write git-committed.
- Selectors churn — keep them in `chatgpt-selectors.ts` only; re-pin with `npx electron probe/probe-c.cjs`.

## Key files (absolute)
- Plan / scope: `~/dev/ad/apps/imagedrip/docs/imagedrip-plan.md`
- UX + build order: `~/dev/ad/apps/imagedrip/docs/ux-and-workflow.md`
- Driver spec: `~/dev/ad/apps/imagedrip/docs/specs/webview-harness-spec.md`
- Rules: `~/dev/ad/apps/imagedrip/docs/working-rules.md`
- Chosen design: `~/dev/ad/apps/imagedrip/.mochaccino/designs-v2/pipeline-light.html`
- Index of everything: `~/dev/ad/apps/imagedrip/overview.html`

## Verify / run
- `npm run build && npm run dev` → app window opens.
- `npx electron probe/probe-c.cjs` → log into ChatGPT once (persistent partition), confirm selectors.
- "Done" for anything runtime = David has run it in the app, not a green test.

## Open decisions (decide WITH David as you reach them — confirm first)
- **Dial-in mode screen** — same Pipeline design, context expanded, human copy/paste. Not yet designed.
- **Prompt import format** — keep simple (one prompt per line, or a light table). Expected to evolve.
- Deferred: per-prompt reference images; prompt intake via API/MCP; other drivers (DZINE/Higgsfield).

## v1 acceptance
Point ImageDrip at one real theme (~15–20 prompts) with a locked Brand+Project → it primes a fresh
chat, drips prompts on human cadence, auto-harvests each finished image to the project dir (named,
committed), re-primes per chunk, respects rate-limit, and STOP halts cleanly.
