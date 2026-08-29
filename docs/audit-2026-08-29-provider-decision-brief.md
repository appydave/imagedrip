---
doc: decision-brief
project: imagedrip
status: OPEN — awaiting David. Evidence and options only. Nothing built, nothing deprecated, no code changed.
created: 2026-08-29
part: 3 of 3
siblings:
  - audit-2026-08-29-docs-vs-reality.md
  - audit-2026-08-29-north-star-alignment.md
authority: docs/north-star.md
decision_owner: David
purpose: the evidence, blast radius, seam, costs and staged plan for retiring the embedded ChatGPT
  panel in favour of a hosted image-generation API
---

# Part 3 — Provider decision brief

**The premise, from David, taken as given and not re-argued:** the embedded ChatGPT panel is
generating too many bugs, hosting a browser session inside the app is impractical, the direction is
to deprecate it, move to a hosted image-generation API now, and move to Gemini later once a free
image-generation account exists.

**This document does not re-open that decision.** It supplies what a ruling needs: the evidence,
the checklist, the seam, the costs, and a staged plan. Where a stated premise turns out not to hold
— and one does not — it is reported as a fact, not as an argument against the direction.

---

## 0 · Which provider "Kai.AI" is — and the assumption I am flagging

**I have assumed David means [kie.ai](https://kie.ai), and I did not confirm it with him.** The
assumption is strong, and here is exactly why:

- **This repo already names it.** `docs/north-star.md`, "What this is NOT": *"Not a paid-API image
  pipeline — that path exists elsewhere (**kie.ai** / Nano Banana for FliThumb)."* Written 2026-08-08.
- **David maintains a second brain for it** — `~/dev/ad/brains/kie-ai/`, 6 files,
  `activity_level: medium`, `last_major_update: 2026-03-28`, `Maintainer: David Cruwys`. It covers
  auth, the async task workflow, credits, error codes, and the Nano Banana model family.
- **It is already in production elsewhere in the estate** — the brain's fundamentals file names
  `KIE_API_KEY` as the convention "for FliGen and related projects".
- There is no product called "Kai.AI" in David's ecosystem, in any brain, or in the search results.
  "Kie" and "Kai" are homophones.

**What it is:** a reseller/aggregator that fronts many image, video and audio models behind one
Bearer-token API and one credit wallet — `POST https://api.kie.ai/api/v1/jobs/createTask` →
`taskId` → poll `GET /api/v1/jobs/recordInfo`. Its recommended image model is **`nano-banana-2`,
which *is* Google's Gemini 3.1 Flash Image.**

**⚠️ The consequence nobody has stated yet: "kie.ai now, Gemini later" is the same model twice.**
Nano Banana 2 on kie.ai and Gemini 3.1 Flash Image direct from Google are one model with two
billing endpoints. That is good news for the plan — the later migration is an endpoint and auth
swap, not a re-dial of the style — and it is the single strongest argument for putting a seam in
rather than hard-wiring kie.ai.

**What this did NOT establish.** I could not read kie.ai's own pages: both `kie.ai/billing` and
`kie.ai/nano-banana-2` returned **HTTP 403** to an automated fetch, and `docs.kie.ai` returned 404
on the path I tried. **Every kie.ai figure in this brief comes from David's own brain (dated
2026-03-01, five months old), corroborated only by a search engine rendering kie.ai's page title as
*"Nano Banana 2 API — Gemini 3.1 Flash 4K Image from $0.04"*.** Treat kie.ai pricing here as
**unconfirmed**. The Google figures below are from Google's primary pricing docs and are solid.

**Before building anything, one human step:** open kie.ai, confirm the product, confirm current
per-image pricing, and confirm an API key exists. No agent can do that from here.

---

## 1 · The evidence

Four independent bodies of evidence. They are presented strongest-first, which is the reverse of
the order they are usually cited in.

### 1.1 Runtime evidence — the strongest, and it is from today

Read from first-party state on Roamy on 2026-08-29: 11 run manifests under
`~/Pictures/ImageDrip/*/*/manifest.json`, their output repos' git logs, and the app's own
`userData`.

**Across every run this machine has ever recorded:**

| Measure | Value |
|---|---|
| Run manifests on disk | **11** |
| Prompt rows across them | **47** |
| Rows reaching `harvested` | **13 (28%)** |
| Rows left `queued` | **34** |
| Rows reaching `refused` | **0** |
| **Re-primes fired, ever** | **0** |
| Pauses recorded | **12** |
| Manifests with no `outcome` field | 3 of 11 |
| Manifests with no `finishedAt` | 7 of 11 |
| Median measured generation | **76 s** (min 0 s, max **329 s**) |

**Every pause ever recorded — all 12 — is a panel-mechanism failure. There are exactly two kinds:**

| Count | Reason, verbatim from the manifests |
|---|---|
| **6** | `feed failed — feed: the prompt is still sitting in the composer — Enter did not submit it. This is the "pasted but not sent" symptom; nothing was posted to the chat.` |
| **6** | `stalled — no image in 390s` (×4), `576s`, `240s` |

Nothing else has ever paused a run. Not a rate limit, not a refusal, not a network error, not the
operator.

**And today, 2026-08-29, in the project David was actually working in:**

`~/Pictures/ImageDrip/agent-office-s06-plates/` — five runs between 11:46 and 17:21.

| Run | Prompts | Harvested | Outcome | Pause |
|---|---|---|---|---|
| `…-1146-…` | 4 | **1** (329 s) | `open` | stalled — no image in 576s |
| `…-1354-…` | 1 | 0 | `stopped` | — |
| `…-1425-…` | 1 | 0 | `open` | stalled — no image in 390s |
| `…-1719-…` | 2 | 0 | `stopped` | — |
| `…-1721-…` | 1 | 0 | `open` | stalled — no image in 390s |

**Nine prompt rows. One image.**

The run folder, however, holds **five PNGs** — all four plates plus a composite. The output
project is a git repo, and `FileAuthor` commits everything it writes. Its log contains exactly
**one** `harvest …` commit and **one** `provenance …` commit; `git status` reports the other four
PNGs as **untracked**.

> **ImageDrip produced one plate. David produced the other three by hand, and saved them into the
> folder ImageDrip had made.**

That is the premise — *"generating too many bugs"* — in first-party data, on the most recent day of
use, without a single commit being counted.

**What this does NOT establish.** (a) *Why* each run stalled: `src/main/engine-readiness.ts:49-50`
defines `indeterminate` as *"Probe timed out, page still loading, **or the selectors no longer
match**"* — the app cannot tell a slow ChatGPT from a rotted selector, and this audit did not drive
it to find out. (b) That the four untracked PNGs came from ChatGPT at all — only that ImageDrip did
not write them. (c) That the 34 `queued` rows are failures: **a `queued` row means both "the
operator stopped before we got here" and "we fed it and nothing came back"**, because
`PromptStatus` has no terminal failure state (`src/shared/domain.ts:38`). The 28% figure is
therefore a **floor on ambiguity, not a measured success rate** — and the fact that no honest
success rate can be computed is itself a finding.

### 1.2 Two failure detectors have been marked UNVERIFIED since the first commit

`src/main/chatgpt-selectors.ts` carries ⚠️ UNVERIFIED markers, unchanged since 2026-07-19, on:

- `rateLimitBanner: '[role="alert"], [role="status"]'` and the refusal markers (`:10`, `:73-74`)
- `composerAttachment` (`:76`, `:82`) — *"written for the 'Pasted text' chip, never for an image"*

These are not stale comments; they are the reason two of the numbers in §1.1 are unreadable.
**0 rate-limit pauses and 0 refusals across 11 runs is not evidence that ChatGPT never rate-limited
or never refused.** It is equally consistent with a detector that has never matched anything. The
guard behind it is well tested as a mechanism — `test/rate-limit-guard.test.ts`, 6 tests — and has
never been shown to *fire*.

This is the audit's central rigour point applied to the panel: **on the two failure paths that
matter most, absence of evidence and success are the same observation, and have been for 41 days.**

### 1.3 Git evidence — weaker, and it should be labelled as such

A commit count measures *fix effort someone chose to record in git*. It is not bug frequency, not
severity, not time lost. It cannot see: bugs never fixed (the two UNVERIFIED selectors above are
exactly this — two live unknowns on the feed path with zero commits), bugs fixed inside a feature
commit (`b87597c` silently raises `loadSettleMs` 2500→4000 and `primerSettleMs` 6000→9000 against
the paste-without-enter symptom, under a WP5 headline), or diagnosis time
(`one-persist-partition-one-process.md` records that the symptom *"was dismissed as noise for most
of the session"* — one commit, unknown hours).

With that stated, over 76 commits:

| Measure | Count | % |
|---|---|---|
| **Panel-traceable, strict** (the commit's primary purpose is the panel mechanism) | **18** | 23.7% |
| **Panel-traceable, broad** (the panel is a material component) | **31** | 40.8% |
| Of the 18 strict: initial build | 4 | — |
| **Of the 18 strict: fixes or fix-documentation** | **14** | **19.4% of the 72 post-build commits** |

By bucket, the strict set:

| Bucket | N | Representative commits |
|---|---|---|
| Manual per-machine sign-in / auth precondition | 4 | `3dc0395` *treat the ChatGPT sign-in as state, not an undocumented precondition*; `3f274d3` *authorization moves beneath the adapters — and closes a live hole* (a human clicking `▶ Run theme…` against a signed-out ChatGPT met no check at all) |
| Session/auth rejection, "logged in but empty" | 3 | `67945c3` *fix ChatGPT panel showing a logged-in session with no state* |
| Single-instance lock / partition contention | 2 | `68f2e76` *dev:stop / dev:clean — stop before start*; KDD `one-persist-partition-one-process.md` |
| Stall / timeout / pacing / duplicate sends | 6 | `88cba99` *fix duplicate prompt sends ("EmuEmu") and stalls on slow images*; `7abab23` *fix the adaptive stall budget causing the stalls it prevents*; `9fabdf8`; `34ceeda`; `c2c2624` |
| DOM-scraping fragility | 3 | `29e7981` *re-pin ChatGPT selectors — Probe C verified against live DOM*; `9f49732` *feed now verifies delivery* |
| Z-order / native-view compositing | 2 | `d6aa934`, `f597d72` *live UAT round 2 — stop fighting the z-index, move out of its way* |

**Three of the seven KDD learnings are unambiguously panel-caused — and they are the three most
severe in the whole KDD:**

| Learning | Severity | Why it is the panel's |
|---|---|---|
| `electron-default-user-agent-is-bot-refused` | **critical** | *"Embedding a real consumer website in Electron"* — the UA is bot-refused, so the shell authenticates while every API call hangs |
| `native-view-paints-above-all-html` | **high** | *"A `WebContentsView` composites above every HTML element"* |
| `one-persist-partition-one-process` | **high** | *"Two app instances sharing one `persist:` partition silently reset each other's storage"* — the ChatGPT session's Chromium profile |

A fourth, `verify-the-legacy-before-porting-it` (process), is *about* the pacing engine, which
exists only for the panel — but the lesson itself is about porting, not about browsers.

The remaining three are **not** panel-caused and should not be counted as such:
`a-truncated-probe-reads-as-an-absent-flag` (the **Claude CLI** capability probe in the chat pane,
not ChatGPT), `blocked-postinstall-leaves-a-hollow-package` (packaging), and
`render-real-identity-not-a-derived-guess` (a UI captioning bug that would recur under any engine).

*Recorded because a first pass of this audit counted five, and three of those five did not survive
reading the learnings' own frontmatter. The corrected count is smaller and the point is stronger:
the panel owns the KDD's only `critical` and both of its `high` infrastructure entries.*

One caveat worth recording: `electron-default-user-agent-is-bot-refused.md` carries
`recurrence_count: 1`, while its own commit body quotes David saying *"I've seen this particular
problem happen before, and it's happening again today."* The counter and the quote disagree, so the
recurrence data under-reports.

### 1.4 The test suite is green and does not touch the panel

`npm test` — **37 files, 483 tests, all passing, 3.02 s.** Verified by running it.

And every module that drives the browser has **no test file of its own**:

| Untested | Lines | What it does |
|---|---|---|
| `src/main/webview-harness.ts` | 517 | attach, feed, submit, harvest, stall arming, engine probe |
| `src/main/chatgpt-selectors.ts` | 105 | every DOM selector |
| `src/main/image-harvest.ts` | 69 | fetch-in-session and write |
| `src/preload/webview-preload.ts` | — | the DOM observer |
| `src/main/window-manager.ts`, `output-router.ts`, `ipc-router.ts`, `live-uat-store.ts` | — | — |
| the entire renderer (`App.tsx` 2,715 lines, and 4 more files) | — | — |

Eight test files *reference* the harness, but through stand-ins.

**483 green tests, and none of them touch the part that breaks.** This is not a criticism of the
suite — a DOM you do not control cannot be unit-tested, which is precisely the argument for
replacing it with one you can. It does mean **a green CI run carries no information about whether
ImageDrip can currently make an image.**

---

## 2 · Blast radius — the deprecation checklist

Everything below was located by grep across `src/ test/ scripts/ probe/ docs/ *.md *.json`,
excluding `node_modules`. **83 files.**

### 2.1 Source — delete candidates (exist only for the panel)

| File | Lines | Note |
|---|---|---|
| `src/main/webview-harness.ts` | 517 | The driver. Everything |
| `src/main/chatgpt-selectors.ts` | 105 | Pure ChatGPT DOM |
| `src/preload/webview-preload.ts` | — | The in-page observer |
| `src/main/image-harvest.ts` | 69 | **Split, don't delete** — `harvestImage` is session-coupled (`session.fetch`, `:37`); `appendProvenance` (`:61`) is provider-neutral and must survive |
| `src/main/cadence.ts` | — | **Only meaningful as ToS mitigation.** No cadence is needed against an API |
| `src/main/rate-limit-guard.ts` | — | Replaced by HTTP 429 handling, not deleted outright |

### 2.2 Source — edit candidates (reference the panel)

`src/main/batch-runner.ts` (7 hits — the loop itself), `src/main/index.ts` (14 — wiring, window,
attach), `src/shared/ipc.ts` (15 — channels, `EngineProbeReport`, `RunStatus`),
`src/main/verb-policy.ts` (11 — `NEVER_EXPOSED` harness channels, `ENGINE_REQUIRED_VERBS`, verb
docs), `src/main/engine-readiness.ts` (8 — becomes "is the API key valid?"),
`src/main/stall-budget.ts` (becomes a request timeout), `src/main/capability-guard.ts` (5),
`src/main/output-router.ts`, `src/main/domain-migrate.ts`, `src/main/chat-gate.ts`,
`src/main/claude-cli.ts`, `src/main/ipc-router.ts`, `src/shared/domain.ts` (5),
`src/preload/index.ts` (3).

Renderer: `src/renderer/src/App.tsx` (**26 hits**, 2,715 lines — the reserved rect, the bounds-sync
effect, the ChatGPT column, Dial-in, COPY OUT, the re-prime warning), `Popover.tsx`,
`useResizable.tsx`, `store.ts`, `FlagButton.tsx`.

### 2.3 Verbs, channels and config

| Kind | Items |
|---|---|
| **Verbs whose meaning changes or dies** | `run.chat-state` (dies — conversation priming is a chat concept), `run.start` / `run.resume` (keep, but `ENGINE_REQUIRED` means "key + credits", not "signed in"), `harvest.thumb` (keep), `context.get`'s `engine` block (re-shaped) |
| **MCP tools affected** | `mcp__imagedrip__run_chat-state`, `run_start`, `run_resume`, `run_status`, `context_get` — 5 of 34 |
| **Never-exposed channels that disappear** | `harness:attach`, `harness:set-bounds`, `harness:set-visible`, `harness:new-conversation`, `harness:feed`, `harness:stop`, `harness:event`, `run:inject-primer`, `run:inject-prompt` — **9 of the 19** `NEVER_EXPOSED` entries (`verb-policy.ts:70-178`). The list gets materially shorter, which shrinks the surface R13 is worried about |
| **Config / persisted state** | the `persist:` Chromium partition and `Partitions/` + `Cookies` in `userData`; the UA override; `RunConfig.chunkSize` / `cadenceBaseMs` / `cadenceJitterMs` / `primerSettleMs` / `loadSettleMs` (`ipc.ts:286-306`); the single-instance lock's operational consequence. **New:** an API key — which is the first secret this app has ever held (see §4.5) |
| **New IPC needed** | none structurally — `run.*` and `RunStatus` already carry the right shape |

### 2.4 Tests

Ten files reference the panel, all through stand-ins: `batch-runner.test.ts` (28 tests — the largest
single edit; its fake harness becomes a fake provider), `engine-readiness.test.ts`,
`stall-visibility.test.ts`, `capability-guard.test.ts`, `control-surface.test.ts`,
`verb-policy.test.ts` (pins the published set — **will fail by design** the moment a verb is
removed, which is the guard working), `mcp-proxy.test.ts`, `chat-session.test.ts`,
`chat-gate.test.ts`, `domain-merge.test.ts`.

**None would be deleted; all would be edited.** No test exercises real browser behaviour, so none is
made obsolete — which is the flip side of §1.4.

### 2.5 Probes — all delete candidates

`probe/probe-a.cjs`, `probe-b.cjs`, `probe-c.cjs`, `probe-feed.cjs`, `probe-attach.cjs`,
`probe-attach-live.cjs`, `probe/pages/` (3 HTML), `probe/probe-c.log` (2.1 MB), `probe/README.md`.
`probe/measure-drift.cjs` **survives** — drift measurement is provider-neutral and becomes *more*
useful, not less.

### 2.6 Docs — 38 files reference the panel

**Retire outright (their subject goes away):** `docs/specs/webview-harness-spec.md`,
`docs/handover-webview-harness-g3.md`, `probe/README.md`, and **`docs/two-clocks.md`** — the best
explainer in the repo, and about a mechanism that will not exist. Keep it as history with a
`status: historical` stamp; do not silently delete a category-1 hard-won lesson.

**Substantially rewrite:** `README.md` (its opening sentence, its warning box and its entire "Why it
exists" rationale invert), `docs/user-guide.md` (sign-in, Dial-in, troubleshooting),
`docs/north-star.md` (see §4.1 — **David's call, not an agent's**), `CLAUDE.md`,
`docs/imagedrip-plan.md` §7 and §9 (the ToS and cost case).

**Amend:** `docs/README.md`, `docs/working-rules.md`, `docs/live-uat.md`, `docs/rulings-open.md`
(R4, R5 and R12 are all about drift inside a conversation and change shape entirely),
`docs/phase-0-checks/README.md` + `RUNBOOK.md` (the chunk-size experiment measures a phenomenon
that may not exist under an API), the five `requirements-v*.md`, the four `spec-*.md`,
`docs/ux-and-workflow.md`, `docs/wp4-chat-pane-research.md`, `docs/research-imagedrip-architecture.md`.

**Unaffected:** `docs/kdd/` learnings stay exactly as they are. A learning is a record of what
happened, not a claim about what is true now. Do not retire them when the panel goes.

---

## 3 · The seam

### 3.1 Does one already exist? No.

The engine is hard-wired into the runner by concrete type:

```ts
// src/main/batch-runner.ts:8
import type { WebviewHarness } from './webview-harness.js';

// src/main/batch-runner.ts:40-41
export interface BatchRunnerDeps {
  harness: WebviewHarness;      // ← a class, not an interface
```

**The call chain, prompt → image:**

```
run.start (index.ts:841)
  → capability-guard.authorize()            capability-guard.ts:154   [engine precondition, :178]
  → BatchRunner.start()                     batch-runner.ts
      → harness.newConversation()           batch-runner.ts:416
      → harness.feed(text)                  batch-runner.ts:439   ← clipboard + click + paste + Enter
        └ WebviewHarness.feed()             webview-harness.ts:255
      … waits for a DOM event …
      → onImageDone(imageUrl)               batch-runner.ts:156
      → harness.harvest(url, relPath)       batch-runner.ts:544
        └ harvestImage()                    image-harvest.ts:34   ← session.fetch → FileAuthor.write
      → recorder.harvest(...)               run-manifest.ts:120
      → cadence delay, next                 cadence.ts
```

**The good news:** `BatchRunner` touches only **eight** members of `WebviewHarness` —
`onImageDone`, `onRateLimit`, `onRefused`, `onStall` (`:156-159`), `setStallMs` (`:211`, `:532`),
`newConversation` (`:416`), `feed` (`:439`), `harvest` (`:544`). Extracting an interface from those
eight is a morning's work.

**Do not do that.** Those eight are the *panel's* shape: a stateful conversation, a fire-and-forget
write, and an image that arrives later as an event. A hosted API is a request that returns a result.
An interface shaped like `WebviewHarness` would force the kie.ai adapter to fake an event loop
around a `taskId` poll, and would carry `newConversation()` and `setStallMs()` — two concepts a
stateless API does not have — into every future provider forever.

### 3.2 Recommended seam — one paragraph

**Put the boundary at `one prompt → one delivered image`, not at the harness's method list.** Define
an `ImageEngine` interface whose central call is a single `generate()` that takes a rendered prompt
and a destination path and resolves with a file that has already been written through `FileAuthor` —
so *how* an image is obtained (feed-and-wait-for-DOM vs createTask-and-poll) stays entirely inside
the adapter, along with the timing machinery each one needs. The existing `WebviewHarness` becomes
`ChatGptWebviewEngine`, which implements `generate()` by doing what `BatchRunner` does today (feed →
await `image-done` → harvest) and keeps the stall budget, the cadence and the de-dupe `seen` set as
its own private business; `KieEngine` implements the same call as `createTask` → poll `recordInfo` →
download → `fileAuthor.write()`, and keeps a concurrency limiter and 429 backoff as *its* private
business. `beginSession(primer)` exists so the chat engine can open a conversation and post the
primer while the API engine simply stores the primer for prompt composition — which is what makes
the re-prime/chunking concept disappear for API providers instead of being carried as dead
configuration. Keep `EngineReadiness` exactly as it is (`engine-readiness.ts:52-60`): it is already
a clean, pure, provider-neutral verdict-with-a-hint, it is already what `capability-guard.ts:178`
and `context.get` consume, and for an API adapter it answers "is there a key and are there credits"
with the same four states and the same honest `indeterminate`. `BatchRunner` then keeps only what is
genuinely its own — the queue, ordering, the manifest, pause/stop, and the run folder — and its
`deps.harness: WebviewHarness` becomes `deps.engine: ImageEngine`, which is a one-line change to a
type and a large deletion everywhere else.

### 3.3 Signature sketch

```ts
// src/main/image-engine.ts — new; provider-neutral, no Electron import

export type EngineId = 'chatgpt-webview' | 'kie' | 'gemini';

export interface GenerateRequest {
  /** The fully rendered prompt — promptShape already applied. */
  prompt: string;
  /** Short label, for filenames and logs. */
  subject: string;
  /** Destination, relative to the run's FileAuthor root. Extension may be adjusted. */
  relPath: string;
  /** Cancellation: STOP must reach in-flight work, whatever the provider. */
  signal: AbortSignal;
}

export interface GeneratedImage {
  /** Path as FileAuthor actually wrote it. */
  path: string;
  bytes: number;
  /** Measured, for the stall/cadence statistics and the manifest. */
  generationMs: number;
  /** Provenance: the ChatGPT CDN url, or the provider's result url. */
  sourceUrl?: string;
  /** Provider's own id, when it has one (kie.ai taskId). Manifest gold. */
  providerRef?: string;
}

/** Every refusal a provider can express, normalised. Nothing may fail silently. */
export type EngineFailure =
  | { kind: 'refused'; detail: string }        // the model declined the prompt
  | { kind: 'rate-limited'; retryAfterMs?: number }
  | { kind: 'timed-out'; waitedMs: number }
  | { kind: 'unavailable'; detail: string }    // signed out / no key / no credits
  | { kind: 'failed'; detail: string };

export class EngineError extends Error {
  constructor(readonly failure: EngineFailure, message: string) { super(message); }
}

export interface ImageEngine {
  readonly id: EngineId;

  /** Unchanged contract — `engine-readiness.ts` already defines this shape. */
  readiness(): Promise<EngineReadiness>;

  /**
   * Establish style context for the run. Chat engines open a conversation and
   * post the primer; stateless engines store it for prompt composition.
   * Called at run start and at any provider-defined boundary.
   */
  beginSession(primer: string): Promise<void>;

  /**
   * ONE prompt in, ONE written image out, or an EngineError.
   * Everything provider-specific — pacing, polling, DOM observation, retries,
   * download — lives behind this call.
   */
  generate(req: GenerateRequest): Promise<GeneratedImage>;

  /** Halt in-flight work. Must remain callable when readiness() is false. */
  stop(): void;

  /**
   * Provider-declared pacing. The webview engine returns its measured cadence;
   * an API engine returns { concurrency: n, minGapMs: 0 }. The runner asks
   * rather than assuming, which is how the two clocks stop being global.
   */
  pacing(): { concurrency: number; minGapMs: number };
}
```

**Two design notes worth stating, because both are earned by this repo's own history.**

1. **`generate()` returns a *written file*, not a URL.** Harvesting is where ChatGPT's session
   cookies are load-bearing (`image-harvest.ts:9-12`) and where kie.ai's 14-day URL expiry bites.
   Making delivery the adapter's job keeps `FileAuthor`'s scoped-write guarantee intact for both.
2. **`EngineFailure` is exhaustive on purpose.** Today `PromptStatus` has no terminal failure state
   (Part 2, AF-2) and `refused` is never written to the queue (`shared/domain.ts:26-33`). A provider
   swap is the moment to fix that, because an API returns real, distinguishable errors —
   HTTP 401/402/422/429/501 — where the DOM returned silence. **This is the single largest
   correctness gain of the move, and it is bigger than the cost argument.**

---

## 4 · What breaks for the user

### 4.1 The North Star's founding constraint is the thing being reversed

`docs/north-star.md` states: *"**It costs nothing per image.** ChatGPT's own UI is the engine — 'I
don't have to pay for it.' This has been the founding constraint since the first commit,
2026-07-19."* And under "What this is NOT": *"Not a paid-API image pipeline — that path exists
elsewhere (kie.ai / Nano Banana for FliThumb)."*

**This move makes ImageDrip the thing its Star says it is not.** That is not an argument against it
— the Star also says *"The code is a stale snapshot of intent, the human is not"* — but the Star is
an **interviewed** document, ratified by David on 2026-08-08 and re-ruled on 08-09 and 08-10.
**It must be re-ratified by him, not patched by an agent.** Doing this move without re-ratifying the
Star leaves the project with a written goal that contradicts its own architecture, which is exactly
the drift Part 1 documents.

### 4.2 Cost model — subscription to metered

| Path | Per image | Source | Confidence |
|---|---|---|---|
| **Today** — ChatGPT subscription | **$0** marginal | `north-star.md` | Certain |
| **kie.ai `nano-banana-2`** 1K / 2K / 4K | ~**$0.040** / $0.060 / $0.090 | `~/dev/ad/brains/kie-ai/kie-ai-nano-banana.md`, dated 2026-03-01 | **Unconfirmed** (403) |
| **Gemini 3.1 Flash Image** direct, 1K | **$0.067** | Google's own pricing docs | Confirmed |
| **Gemini 2.5 Flash Image** direct | **$0.039** ($0.0195 batch) | Google's own pricing docs | Confirmed |

**The counter-intuitive result: kie.ai appears to undercut Google on Google's own model.** ~$0.040
for a 1K Nano Banana 2 versus Google's $0.067 for the identical Gemini 3.1 Flash Image. If that
holds, "go direct to Gemini later" is a decision about latency, quota and control — **not price.**

**Worked cost, using the runs that exist:** the whole recorded history of this app is 47 prompt
rows. At $0.04 that is **$1.88 — total, for every run ever attempted.** A 100-image catalogue costs
**~$4**, and re-running it costs $4 again. The README's own framing — *"several dollars every time
you re-run it"* — is accurate and was always the real number; what changes is whether that is
material against three plates finished by hand today.

### 4.3 The "Gemini later, once a free account exists" premise does not currently hold

Checked against **Google's own pricing page**, not a brain and not a blog:

> **Gemini 3.1 Flash Image (Nano Banana 2) — Free Tier: NOT available.**
> **Gemini 2.5 Flash Image (Nano Banana) — Free Tier: NOT available.**
> "Image generation is not free-tier eligible for any currently listed models."

Third-party blogs claiming "500 free images/day" are contradicted by the vendor's own table. The
free tier is real for *text* Flash models; it does not extend to image generation.

**What this means for the plan:** stage 3 ("move to Gemini once free") has **no trigger date, and
may have no trigger at all.** It should be re-framed as *"move to Gemini direct if and when price,
quota or latency justifies it"* — which the seam makes cheap either way. **This is a factual
correction to a premise, not a recommendation to change the direction.**

**What this did NOT establish:** whether Google offers free image generation through some other
route — AI Studio's interactive UI, a promotional credit, or a Workspace/Cloud grant David already
holds. Only the public Gemini API pricing page was checked.

### 4.4 Rate limits, and the one thing that genuinely gets worse

| | Panel today | kie.ai |
|---|---|---|
| Ceiling | ChatGPT plan image cap — undocumented, and **the detector for it is UNVERIFIED** (§1.2) | 20 new tasks / 10 s; 100+ concurrent; HTTP 429 |
| Behaviour at the limit | 15-minute blind backoff (`rate-limit-guard.ts:23`) | Explicit 429, `retryAfter`, retry |
| Throughput | One image at a time by design (ToS mitigation), median 76 s | Concurrent — a 20-image run could complete in the time one does today |
| Result retention | Files land locally, permanently | **Result URLs expire in 14 days; upload URLs in 10 minutes** — you must download immediately |

That last row is the real operational change, and it is already handled: `generate()` returning a
written file (§3.3) means expiry never becomes the operator's problem. It would become one
instantly if the seam returned a URL.

### 4.5 What the panel can do that an API cannot

Stated plainly, because these are genuine losses:

1. **Iterative refinement in a conversation.** Dial-in works because ChatGPT *remembers*: "make the
   background darker" refers to the last image. A stateless API takes a full prompt every time.
   `promptShape` (`verb-policy.ts:329`) already carries much of this, and the primer is already
   composed and re-posted — but conversational correction is a real capability that goes away.
2. **Watching it work.** `App.tsx:465`: *"native ChatGPT — the **ONLY** place 'generating' ever
   shows."* The panel is the app's only live feedback surface. Losing it makes the honest-progress
   problem (Part 2, AF-1/AF-2) harder, not easier — an API run is a progress bar the app must now
   render truthfully by itself.
3. **A model you cannot buy per-image.** GPT-4o/5-class image generation inside the ChatGPT UI is
   not the same product as any per-image endpoint. **Style consistency will differ.** Nothing in this
   audit can predict by how much — that requires generating the same prompts through both and
   comparing. `probe/measure-drift.cjs` already exists for exactly this comparison and should be
   the first thing run in stage 1.
4. **Zero secrets.** ImageDrip currently holds no API key. Adding one makes it a credential-holding
   app: it needs a storage decision (`userData`? Keychain?), it must never reach `domain.json`
   (which is git-committed into brand repos), and `CLAUDE.md`'s existing rule about not committing
   secrets becomes load-bearing for the first time.
5. **ToS risk disappears.** Worth naming as a gain, not a loss: the warning box in `README.md`, the
   human-paced feed, the account-risk framing and `rate-limit-guard`'s entire justification all
   become unnecessary. **The single largest risk this project carries is retired by this move.**

---

## 5 · A staged plan

**Nothing here starts until David rules.** The stages are ordered so the point of no return comes
as late as possible.

### Stage 0 — Confirm the premise (human only, one sitting, no code)

1. Open kie.ai. **Confirm it is what "Kai.AI" meant.** Confirm current per-image pricing and
   create an API key.
2. Rule on the North Star (§4.1): does *"it costs nothing per image"* stand, get amended, or get
   struck? Everything downstream reads differently depending on the answer.
3. Rule on stage 3's trigger (§4.3), now that "free Gemini image account" is known not to exist.

**Gate:** without 1 and 2, stage 1 is building against an unratified goal.

### Stage 1 — The seam, plus a bake-off. Nothing is deleted.

- Introduce `src/main/image-engine.ts` (§3.3). Wrap the existing driver as `ChatGptWebviewEngine`.
  Change `BatchRunnerDeps.harness: WebviewHarness` → `engine: ImageEngine`. **Behaviour identical;
  `test/batch-runner.test.ts`'s 28 tests should pass unchanged** — that is the acceptance criterion.
- Add `KieEngine` behind a config key, defaulting **off**.
- **Run the bake-off before committing further.** Take one real theme — the
  `agent-office-s06-plates` prompts are ideal, since the panel scored 1/9 on them today — and run it
  through both. Compare with `probe/measure-drift.cjs`. This is the only way to answer §4.5.3, and
  it costs about **$0.50**.
- Fix `PromptStatus` (§3.3 note 2 / Part 2 AF-2) here, while both engines exist: a terminal failure
  state, written by both adapters. Doing it now means the migration is verifiable — **you cannot
  compare two engines on a queue that cannot express failure.**

**Reversible in full.** Nothing deleted, one config key.

### Stage 2 — Flip the default. The panel stays behind a flag.

- kie.ai becomes the default engine; the webview engine remains selectable.
- Renderer: the ChatGPT column becomes a real progress surface for API runs (§4.5.2). This is the
  largest single piece of UI work in the whole migration and the one most likely to be
  under-estimated.
- Amend docs rather than retiring them; `status: historical` stamps, no deletions yet.
- Retire the *cockpit* the panel needed: the entry-mode choice, the re-prime warning, the two-clock
  vocabulary, COPY OUT — the 11 north-star violations Part 2 identifies. **This is where the
  alignment win is actually banked.**

**Still reversible.** One flag flip back.

### ⛔ Point of no return

**Deleting `webview-harness.ts`, `chatgpt-selectors.ts` and `webview-preload.ts` — and, separately,
clearing the `persist:` partition.** The code is recoverable from git; **the signed-in ChatGPT
session in `userData/Partitions/` is not**, and re-establishing it is a manual per-machine human
step. Those two must be separate decisions taken on separate days.

**The gate on stage 3 should be a number, not a feeling:** *N* consecutive successful API runs at a
harvest rate above some threshold David sets. Today's baseline for comparison is **1 of 9**.

### Stage 3 — Delete

- Remove the delete-candidate sources (§2.1), the six probes (§2.5), the nine `NEVER_EXPOSED`
  harness channels, `run.chat-state`, and the five `RunConfig` tuning fields.
- Retire `docs/specs/webview-harness-spec.md`, `docs/handover-webview-harness-g3.md`,
  `probe/README.md`; stamp `docs/two-clocks.md` historical.
- Regenerate `README.md` (via `appydave:craft-readme`) and `docs/user-guide.md`.
- **Leave `docs/kdd/` untouched.**
- `test/verb-policy.test.ts` will fail on the removed verbs. **That is the pinning test working.**
  Update it deliberately, one verb at a time.

### Stage 4 — Optional: Gemini direct

Only if §4.3's re-framed trigger fires. With the seam in place this is one new `ImageEngine`
implementation and a config value. **The model is the same one (§0)**, so style should carry — which
is the whole reason the seam is worth building in stage 1 rather than hard-wiring kie.ai.

---

## 6 · What this brief does not settle

- **Whether image quality and style consistency survive the move.** Nothing short of the stage 1
  bake-off can answer it. Every cost figure here is worthless if the images are wrong.
- **kie.ai's current pricing, availability, and terms.** 403 on every page (§0). Human step.
- **Whether the panel's failures are ChatGPT's fault or ImageDrip's.** Two selectors have been
  UNVERIFIED for 41 days (§1.2) and `indeterminate` conflates a slow page with a rotted selector
  (`engine-readiness.ts:49-50`). **It is entirely possible that a day of selector re-pinning would
  restore the panel to working order.** That does not contradict the premise — a mechanism that
  needs re-pinning every few weeks, against a page you do not control, with no test that can catch
  the rot, is impractical for the reason David gave. But it does mean the evidence in §1.1 measures
  *"the panel is not working"*, not *"the panel cannot work"*, and this brief should not be cited
  as the latter.
- **Effort.** No estimate is offered. The seam is small; `App.tsx` (2,715 lines, 26 panel hits) and
  the honest-progress UI are not, and neither has any test coverage to migrate against.
