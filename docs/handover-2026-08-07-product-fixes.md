---
doc: handover
project: imagedrip
created: 2026-08-07
for: the next session — building A1–A9 (product fixes) and B1–B4 (control seam / CDP tier)
state: nothing started. Tree clean at 5c1302f. This is a cold start, not a resume.
---

# Handover — ImageDrip product fixes + the control seam

## Launch line

```
cd /Users/davidcruwys/dev/ad/apps/imagedrip
```
```
claude --permission-mode auto --model opus -n imagedrip-dev "You must be running in /Users/davidcruwys/dev/ad/apps/imagedrip — verify your cwd before anything else and STOP if it differs. Read /Users/davidcruwys/dev/ad/apps/imagedrip/docs/handover-2026-08-07-product-fixes.md in full and execute it. STOP after A1, A2, A3, A4, A5 and A7 are built with tests and npm run typecheck + npm test are green — report before starting the uat/ CDP tier (B2/B3), which is a new harness and needs a fresh decision. Do not re-derive the stall cap: stall-budget.ts already computes it and the defect is the bootstrap floor only. Do not build a RunConfig settings UI. Do not use AppleScript to drive the app. Never write to the ChatGPT webview by any path and never invoke run.start/run.stop/run.pause/run.resume/prompts.clear."
```

Model is Opus because A1 is a nullable-type change with real design tradeoffs across four files, not
mechanical edits.

---

## Governing frame

**The work is:** closing gaps that a product review found in how ImageDrip is *actually used*, plus
standing up a test tier that can assert reachability.

**The work is not:** a redesign, a v3/v4 continuation, or new capability. Every item traces to an
observed defect. `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/review-usability-and-product-fit.md`
is the evidence base — read it before the task list, because it says *why* each item exists.

**Refine `.mochaccino/designs-v2/pipeline-light.html`, never replace it.** The cockpit is good; this
is repair, not a rebuild.

---

## State of play

- `main` @ `5c1302f`, clean, pushed. Three relevant commits:
  - `3fbe28a` — v4 WP1–WP3: control surface, MCP proxy, stream parser, `npm run chat:probe`
  - `3dc0395` — engine-readiness gate (David's, not this session's)
  - `5c1302f` — the product review
- `npm run typecheck` and `npm test` are green. 231+ tests.
- **Nothing from A1–A9 or B1–B4 has been started.** No partial state to reconcile.
- The task brief is David's message in the session that produced this file. Its A/B structure is
  reproduced under *Queued work* with corrections applied.

---

## Corrections to bank — the brief is wrong in two places

These were traced in code during the session but **not yet applied to any file**. Fix the review doc
as part of the work.

1. **A3(b) is already built.** The brief says "derive the cap from the run's own observed maximum
   rather than a constant." `/Users/davidcruwys/dev/ad/apps/imagedrip/src/main/stall-budget.ts`
   *already does this* — `computeStallMs()` takes `max(mean × 1.75, slowest × 1.3)`, clamped, and is
   monotonic in the samples.

   **The actual defect is the bootstrap.** `BOOTSTRAP_STALL_MS = 4 * 60 * 1000` (240s) is used while
   there are no *valid* samples. In run `2026-08-03-1446-smoothies`, Dragonite recorded 0s — filtered
   out by `MIN_PLAUSIBLE_MS` (5s) as a mis-attributed DOM src — so the budget was still bootstrap
   when a genuine 300s generation was in flight. It fired at 240s. Observed real generations:
   57–116s normal, one at 300s. **Raise the bootstrap; leave the derivation alone.**

2. **A3(a) is largely built.** `/Users/davidcruwys/dev/ad/apps/imagedrip/src/renderer/src/App.tsx`
   already renders `⏸ PAUSED` (~`:315`) and appends `status.note` (~`:316`), and the activity line
   uses `status?.note` (~`:134`). The chip and the line exist.

   **The real gap is that a pause is only visible while the app is open.** The runner is in-memory;
   after a quit there is no trace in the UI, only in the manifest. That is the same root as A2.

Both corrections need applying to
`/Users/davidcruwys/dev/ad/apps/imagedrip/docs/review-usability-and-product-fit.md` — gap #2 in the
ranked table and "Fix now" item 2 both overstate what is missing.

---

## Queued work

### A · Product fixes, priority order

| # | Item | Notes gathered this session |
|---|---|---|
| **A1** | **Brand can be `(none)`** | Mirror Template exactly. Template already does it: `activeTemplateId: string \| null`, `template: Template \| null`, `templateSwitch(id: string \| null)`. Ripples through `src/shared/domain.ts` (`compose()`), `src/main/domain-store.ts`, `src/main/domain-migrate.ts`, `src/renderer/src/App.tsx` (brand select ~`:1242`, currently `disabled={brands.length < 2}`). **Add a test pinning that a null brand composes byte-identically to Template + Project** — `test/domain-compose.test.ts` already holds the equivalent guarantee for a null template; copy that shape. |
| **A2** | **Write `outcome` on every terminal path** | `batch-runner.ts:282` already calls `finishRun('stopped')` and `:375/:431/:527/:556` call `finishRun('complete')`. **The missing path is app-quit-while-live** — belongs in `src/main/index.ts`, not batch-runner. `will-quit` does not await async work; use `before-quit` with `preventDefault()` then quit, or the manifest write is lost exactly as it was for both existing runs. |
| **A3** | **Stall** | (b) raise `BOOTSTRAP_STALL_MS` in `src/main/stall-budget.ts` above the observed 300s — see corrections. (a) the chip already works; the gap is post-restart visibility, which A2 fixes. |
| **A4** | **Default Live UAT on** | `~/Library/Application Support/imagedrip/live-uat/` **does not exist** — zero captures since it was built 2026-08-03. Flip the default; do **not** build the inbox (`docs/live-uat.md` is right that it is premature until the corpus is non-empty). |
| **A5** | **`theme.rename` verb** | No rail control — the rail is already five sections deep. Verb only. |
| **A6** | **Template migration as a documented chat capability** | Doc/description change only. Add a `when-to-call` to `src/main/verb-policy.ts`. The chat can already do it with `template.create` + `template.save` + `template.switch` + `domain.save-project`. |
| **A7** | **Delete verbs** for brand / project / template | Gated, confirm-first. Add to `GATED_VERBS` in `verb-policy.ts`. |
| **A8** | **Build no `RunConfig` settings UI** | `run.start` already accepts `chunkSize`, `cadenceBaseMs`, `cadenceJitterMs`, `primerSettleMs`, `loadSettleMs` — verified live on `/v1/verbs`. Delete the row from the gap map in `docs/live-uat.md` instead of building it. |
| **A9** | **Correct `docs/user-guide.md § Known limits`** | It lists the ChatGPT panel as narrow and fixed (WP6). The running app has S/M/L buttons **and** a draggable edge. The docs understate the app. |

### B · The control seam

**Ruling (David's, 2026-08-07): the HTTP control surface is the remote-control mechanism; CDP is a
test tier; AppleScript is retired.**

- **B1 — do not widen the bind.** Loopback + per-launch token is correct. For fleet access use an SSH
  port-forward to `127.0.0.1:7180` and read `control.json` over the same connection.
- **B2 — stand up `uat/`** from
  `/Users/davidcruwys/dev/ad/appydave-plugins/appydave/skills/drivable/assets/scaffold/`, editing
  only `config.mjs`. Follow that skill's `references/electron-recipe.md`. **The app needs a
  remote-debugging port, which `npm run dev` does not set — add a separate script, do not change
  `dev`.** Locate controls by the words a human reads (`change…`, `reveal`, `+ import`,
  `Copy list prompt`); **never add a `data-testid`**. Wire the self-test and confirm it FAILS before
  writing a real story.
- **B3 — exactly three stories**: the Brand select offers `(none)` (this is A1's acceptance test);
  run history is reachable without scrolling the CONTEXT rail; a paused run is visible in the top bar
  without opening a log.
- **B4 — do not add a `ui.state` verb.** Use the DOM. A renderer-state verb is easier and is exactly
  the failure the drivable skill exists to prevent: a harness that tests its own hook.

---

## Gotchas

- **`npm` only, and the version matters.** `packageManager` pins `npm@11.11.0`; this machine has
  10.9.8, which **rewrites `package-lock.json`** by stripping `libc` fields on every install. That
  churn is cosmetic — `git checkout package-lock.json` before committing. pnpm blocks the postinstall
  that downloads Electron and yields a hollow package.
- **Import Zod from `@appydave/core`, never `zod`.** It is v3.25 — there is no `z.toJSONSchema()`;
  `src/main/zod-to-json-schema.ts` projects it by reading `_def`.
- **Zod v3 arrays hold bounds in `_def.minLength`/`maxLength`, not `_def.checks`** like strings and
  numbers. Reading `checks` for an array silently drops `minItems`. Already fixed; do not regress.
- **`electron-vite dev` consumes `--` args itself.** To pass a flag to Electron you need
  `npm run dev -- -- --flag=value` (two `--`). Relevant to B2's debug port.
- **A fresh Electron profile looks exactly like David's real data.** `seedDefaults()` in
  `domain-migrate.ts` seeds brand "Beauty & Joy" and project "Smoothies" with 8 prompts. When
  isolating with `--user-data-dir`, "Smoothies" appearing is **not** evidence you hit the real store —
  check the prompt count (real store: 22) or the control-file path.
- **The real store is at `~/Library/Application Support/imagedrip/domain.json`.** Read-only probing
  via the control surface is safe; `domain.compose-primer` is genuinely read-only.
- **`3dc0395` changed signatures** in `control-surface.ts` and `verb-policy.ts` — `requiresEngine`,
  `EngineReadiness`, a distinct `engine_not_ready` 409. Read
  `/Users/davidcruwys/dev/ad/apps/imagedrip/src/main/engine-readiness.ts` before touching either.
- **`WebviewHarness.feed` proceeds when it cannot find the composer** — it warns and pastes into
  whatever holds focus. That is why the engine gate exists. Do not weaken it.
- **The known `attachRepo` gap is still live** — see the bottom of
  `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/working-rules.md`. Attaching a repo publishes *every*
  unsourced project stamped with the *active* brand. Do not point the app at a real repo.

---

## What was ruled out

- **AppleScript for driving the app.** A coordinate click always "succeeds" — during the review one
  landed on a different window entirely. It violates the drivable rule that every action must fail
  loudly. Retired; do not reintroduce.
- **A `ui.state` verb** for the harness — see B4.
- **A `RunConfig` settings panel** — already solved on the chat surface (A8).
- **Widening the control-surface bind** — SSH port-forward instead (B1).
- **Editing `src/main/batch-runner.ts`.** Traced this session: A2 and A3 both land outside it
  (`index.ts` and `stall-budget.ts` respectively). If a later item seems to need it, that is a signal
  to re-check, not to proceed — David flagged it as previously read-only.

---

## Open questions — carry, do not answer

1. **Should Brand become per-project rather than global?** A1 gives `(none)`, which unblocks the
   contradiction. Per-project brand is the deeper fix and is **premature** until `(none)` has been
   lived with.
2. **Does the Live UAT inbox get built once the corpus is non-empty?** `docs/live-uat.md` names it as
   known debt. Premature until A4 lands and captures accumulate.
3. **Does the `LIST PROMPT` card get retired?** The review recommends it, but only once the in-app
   chat pane (v4 WP4) exists — retiring it before then removes a working path and replaces it with
   nothing.

---

## Suggested order

1. **A1** — highest tax, and B3's first story is its acceptance test.
2. **A2** — then A3(b) is a one-constant change on top.
3. **A4, A5, A7** — independent, small.
4. **A6, A8, A9** — documentation and verb descriptions only, no code.
5. **Apply the two corrections** to `docs/review-usability-and-product-fit.md` and mark which ranked
   gaps are now closed.
6. **STOP and report.** Do not start B2/B3 in the same pass.

**Do not start with the `uat/` harness.** It is the most interesting item and the least urgent; A1
taxes every image generated between now and whenever it lands.
