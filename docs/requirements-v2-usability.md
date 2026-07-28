---
doc: requirements-v2-usability
project: imagedrip
status: ready to build — v2 (Usability & Project Identity)
created: 2026-07-28
source: Captain's Log capture B329 (2026-07-28 07:59, Plaud, 30 min) — David's live UAT pass on the v1 Batch Runner
audience: a FRESH Claude Code worker session cd'd into ~/dev/ad/apps/imagedrip
supersedes: nothing — v1 (docs/build-handover.md) shipped; this is the next slice
---

# ImageDrip v2 — Usability & Project Identity (requirements)

**v1 works.** David ran a real theme end to end this morning: primer posted, prompts dripped,
kangaroo + koala harvested, no account burn. His words closing the session: *"it's all going to work
for me — a few usability bugs, but…"*

**v2 is not new capability. It is making v1 usable.** Everything below came out of one 30-minute
live pass. The pipeline is not in question; the cockpit around it is.

Follow `docs/working-rules.md` at all times — especially: **refine, never replace**; **finish one
thing before moving on**; **confirm before building**; **"done" for anything runtime means David has
run it in the app**, not a green test.

---

## 0. The one-line framing

> v1 asked "can we drive ChatGPT safely?" — answered yes.
> v2 asks **"can David sit in this thing for an hour without getting lost?"** — currently no.

Three things break that, in order of pain:

1. **A run is not a thing you can go back to.** Harvested images land in an invisible folder and the
   next run overwrites the context that made them.
2. **The context rail lies.** It shows Brand/Project as if they were yours to steer; almost none of
   it is editable, and one label ("Smoothies") is unexplained.
3. **Auto destroys dial-in.** Pressing `Run theme` opens a brand-new ChatGPT conversation, throwing
   away every refinement David just negotiated. This is the single worst bug in the app.

---

## 1. Scope

### In scope
Seven work packages, WP1–WP7 below. All renderer + main-process work inside this repo.

### Out of scope (do NOT drift into these)
- The ChatGPT driver itself (`webview-harness.ts`, `chatgpt-selectors.ts`, `image-harvest.ts`) —
  live-verified, do not refactor. Touch only where a WP explicitly says so.
- New providers (DZINE / Higgsfield), per-prompt reference images, prompt intake via API/MCP.
- Porting ImageDrip into KyberAgent as an extension (that's captures B306/B313, a separate track).
- Redesigning the light Pipeline layout. WP7 is a **polish** pass on the existing design, not a
  replacement (`working-rules.md` §1–2).

---

## 2. Bug → work package traceability

Every row is a verbatim finding from B329, with the code that causes it.

| # | Finding (B329) | Cause in code | WP |
|---|---|---|---|
| 1 | No way to go back to previous runs; harvested images vanish | `src/main/index.ts:62` — `harvestRoot()` is a single flat `userData/harvest` dir, not per-project/per-run | WP1 |
| 2 | Can't reset to a clean project / "new project" | No project-switch surface exists; `DomainState` holds exactly one project | WP1 |
| 3 | Copy Primer vs Copy Prompt — difference not discoverable | `App.tsx:310-311` — two bare buttons, no affordance | WP2 |
| 4 | Brand is fixed: can't edit, can't select another, can't create one | No `saveBrand` channel in `src/shared/ipc.ts`; `ContextPanel` renders `brandName` as static text (`App.tsx:295`) | WP2 |
| 5 | "Smoothies" appears with no explanation and can't be changed | `domain-store.ts:45` seeds `project.name`; UI shows it read-only (`App.tsx:300`) | WP2 |
| 6 | Save gives almost no feedback; edits don't autosave and you forget to press it | `store.ts:63` sets a 1.6s `flash`; no dirty state, no autosave | WP2 |
| 7 | ChatGPT panel far too narrow — "I'd almost double it" | `App.tsx:238` — hard-coded `w-[330px]`, not resizable | WP6 |
| 8 | Import **wipes** existing queued prompts | `domain-store.ts:73-76` — `importPrompts` replaces `theme.prompts` wholesale | WP3 |
| 9 | Wants one button that injects the primer **and** presses enter | Only `copyPrimer` (clipboard) exists — `store.ts:65-68` | WP4 |
| 10 | Clicking a queued prompt does nothing; wants manual inject-this-one | `App.tsx:376-386` — queue rows are non-interactive `div`s | WP4 |
| 11 | Run/Pause/Stop state incoherent; STOP shown when nothing is running | `App.tsx:157-199` — STOP always rendered regardless of phase | WP5 |
| 12 | **Run theme opened a NEW conversation and destroyed all dial-in** | `batch-runner.ts:157` — `start()` → `primeThenContinue(true)` → `harness.newConversation()`, unconditionally | WP5 |
| 13 | North Star: never fire the next step until the previous finishes | Awaiting-gate + seen-set (`batch-runner.ts:194-233`). *Correction (advisory-1):* the per-prompt gate is honoured, but the **chunk-boundary re-prime path has NEVER executed** (chunkSize 18 > the only real run's 8 prompts) — **untested, verify for the first time**, incl. a chunk-boundary test | WP5 |
| 14 | Stuck on a free plan; login auto-picks the wrong Google account; can't fix it in the narrow pane | `webview-harness.ts:43` — one hard-coded partition `persist:imagedrip-chatgpt`; no account surface | WP6 |
| 15 | Wants a canned "listing prompt" that formats correctly (code block + a limit) | No such helper exists | WP2 |
| 16 | Get the impeccable / front-end design skill onto these screens | — | WP7 |

---

## 3. Work packages

Build in order. WP1, WP4 and WP5 are the ones that change David's day; WP7 runs last, over finished
surfaces.

### WP1 — Project identity & run history  ⭐ biggest structural change

**Problem.** Harvested images go to `userData/harvest` — invisible, flat, and shared across every
run. There is no record of *how* a set of images was made, and no way to look at yesterday's.

**Build.**
1. **Per-project output dir.** Honour `Project.outputDir` (already declared, `src/shared/domain.ts:47`
   and unused). A project owns a real, user-chosen folder on disk.
2. **Per-run subfolder.** Each run writes to `<outputDir>/<run-id>/` where `run-id` is
   `YYYY-MM-DD-HHmm-<theme-slug>`.
3. **Run manifest.** Write `<outputDir>/<run-id>/manifest.json` capturing everything needed to
   reproduce or explain the run:
   - project name, theme name, run id, started/finished timestamps
   - the **exact composed primer text** used (brand body + project body as posted)
   - every prompt: subject, full text, status, harvested filename, generation ms
   - counts, re-prime boundaries, any refusals / rate-limit pauses
   Extend the existing provenance writer (`image-harvest.ts:61 appendProvenance`) rather than
   inventing a second mechanism.
4. **Run history UI.** A browsable list of previous runs for the current project — click one, see its
   harvested grid and its manifest (primer + prompts) exactly as it ran.
5. **Reveal in Finder.** A button that opens the run's folder (`shell.showItemInFolder`).
6. **New / switch project.** Project becomes selectable. **A project is not real until it is saved** —
   an unsaved "new project" must not persist, so hammering the button cannot litter the store with
   blanks (David called this out explicitly).

**Acceptance.**
- Run a theme → a new dated subfolder appears under the project's output dir containing the images
  **and** a `manifest.json` whose primer text matches what was actually posted to ChatGPT.
- Run a second theme → the first run's folder and images are untouched.
- Open run history, pick the earlier run, see its images and the primer that made them.
- Click Reveal in Finder → Finder opens on that folder.
- Press "New project" five times without saving → the store still holds only the real projects.

---

### WP2 — Make the context rail honest and editable

**Problem.** The CONTEXT rail presents the layered model but is mostly read-only, so it reads as
broken rather than as deliberate. David: *"I don't know where that comes from. It's brand, it's fixed
but I can't change it… so that's problematic."*

**Build.**
1. **Brand is editable and selectable.** Add a `domainSaveBrand` channel to `src/shared/ipc.ts` +
   `domain-store.ts`, and let the user pick between saved brands or create one. `Brand` stays
   **locked during a run** (`working-rules.md`: Brand never changes mid-run) — the lock is a run-state
   lock, not a permanent one, and the UI must say which.
2. **Project name editable.** Explains bug #5 — "Smoothies" is just the seeded project name
   (`domain-store.ts:45`). Once it's editable and labelled, the mystery disappears.
3. **Copy Primer vs Copy Prompt disambiguated.** Each button gets a one-line description and a
   preview of what it will put on the clipboard (primer = Brand + Project composed, posted once per
   chat; prompt = the next queued item). Reuse `compose()` (`domain.ts:91`) for the preview.
4. **Autosave + dirty state.** Edits to Project (and Brand) autosave on blur/debounce. Keep an
   explicit Save for muscle memory, but it must never be the only path — David: *"I hate the save
   project button… I forget to press it."* Show an unmistakable saved/unsaved indicator; the current
   1.6s footer flash (`store.ts:63`) is not enough.
5. **Listing-prompt helper.** A canned, editable prompt in the context area for generating an import
   list — formats the answer as a code block and takes a count, e.g.
   *"Give me a list of N <subject>. Names only, in a code block, no commentary."*
   David had to hand-type this twice and still forgot the limit.

**Acceptance.** Change brand text → reload the app → it persisted, no Save press. Rename the project
→ the rail shows the new name. Hover/expand Copy Primer → see exactly what will be copied. Start a
run → Brand shows locked with a reason.

---

### WP3 — Import semantics: Replace vs Add

**Problem.** `importPrompts` silently discards the existing queue (`domain-store.ts:73-76`). David
had two queued prompts, imported ten, and lost the two.

**Build.**
- Two explicit actions: **Replace queue** and **Add to queue** (append after existing, preserving
  order). The import panel already previews the count (`App.tsx:369`) — extend it to say what will
  happen to the N already queued.
- **Do not drop harvested prompts on Replace.** Today they're wiped along with everything else, which
  destroys the run record. With WP1's manifest this matters more, not less.
- Keep ids deterministic (`parsePromptList`, `domain.ts:104`) — on Add, ensure the index suffix
  continues from the existing queue rather than colliding at `-1`.

**Acceptance.** Queue has 2 → import 10 → **Add** gives 12 in order; **Replace** gives 10 and warns
first. Harvested tiles survive both.

---

### WP4 — Manual injection (make Dial-in a real mode)

**Problem.** Dial-in is a toggle with no controls behind it. Everything David wanted to do by hand,
he did by hand — copy, click into ChatGPT, paste, press the send arrow. His words: *"I just want one
button that would do that."*

**Build.**
1. **Inject Primer** — paste the composed primer into the live ChatGPT composer **and submit**. The
   mechanism exists: `harness.feed()` (`webview-harness.ts:112`) already does clipboard → click →
   paste → Enter. Wire a renderer action to it. This is *not* a replacement for Copy Primer; David
   framed it as **"initialise project"** — treat that as the button's job and name it accordingly.
2. **Inject one prompt** — hovering a queued row reveals an inject action; clicking feeds **that**
   prompt and submits it, then marks it harvested when its image lands. Clicking a row currently does
   nothing (`App.tsx:376-386`).
3. **Dial-in mode owns these controls.** In Dial-in, the manual controls are primary and the Auto
   loop must not be running. Mode already exists in the store (`store.ts:5,95`) but changes nothing —
   make it real.

**Acceptance.** In Dial-in: click Initialise project → the primer appears in ChatGPT and sends, with
no keyboard. Hover "kangaroo" → inject → it sends, generates, and harvests into the current run.

---

### WP5 — Run control: coherent state, and STOP DESTROYING DIAL-IN  ⭐ worst bug

**Problem A — the destroyer (#12).** `BatchRunner.start()` unconditionally calls
`harness.newConversation()` (`batch-runner.ts:152-157`). David spent minutes dialling in a look — told
ChatGPT to switch the starry background from blue to green, got agreement — then pressed `Run theme`
and watched it open a fresh chat and throw all of it away. It then pasted the kangaroo prompt
*without pressing enter*, so the run appeared broken on top.

**Build.**
- **Do not open a new conversation if the current chat is already primed.** Two explicit run entry
  paths, and the UI must make the choice visible before anything is sent:
  - **Continue in this chat** — reuse the dialled-in conversation as-is. Skip priming; the chat is
    already carrying the refinements. Start feeding the queue.
  - **Start a fresh chat** — current behaviour: new conversation → post primer → feed.
- Coming out of **Dial-in → Auto**, *Continue in this chat* is the correct default. That is the
  entire point of dial-in.
- Chunked re-priming mid-run (`batch-runner.ts:228`) stays as-is — that's drift control, and it is
  working. But a re-prime **loses dial-in refinements too**: if the user dialled in changes that live
  only in the conversation, they must be captured into Project.md before a re-prime, or the re-primed
  chat will silently revert. Surface this: prompt to fold the refinement into Project (WP2 makes the
  edit possible). Do not auto-scrape the conversation.
- Fix the paste-without-enter symptom seen after the forced new chat — verify `feed()` submits
  reliably immediately after a `newConversation()` + hydrate (`loadSettleMs`, currently 2500ms).

**Problem B — incoherent controls (#11).** STOP renders permanently (`App.tsx:192-198`), including
when nothing is running; David clicked it and nothing happened. He also couldn't tell whether the run
was live.

**Build.**
- One phase-driven control group. STOP is only present/enabled when there is something to stop
  (`isRunning || isPaused`). Pause/Resume is the toggle; STOP is a distinct terminal action.
- Make it unambiguous at a glance whether a run is live, paused, or idle — a state label, not just
  button shapes.
- Define and show what STOP means versus Pause: STOP ends the run (queue keeps its progress, the
  ChatGPT view and login stay attached — `batch-runner.ts:138-148`); Pause holds and can resume from
  the same position. David asked this directly: *"what is stop meant to do?"*

**Problem C — pacing (#13).** The awaiting-gate + seen-set (`batch-runner.ts:194`) means no prompt
fires before the previous image lands — verify under the new Continue-in-chat path; do not rebuild.
*Correction (advisory-1):* the **chunked re-prime path is UNTESTED, not "working"** — chunkSize is
18 and the only real run was 8 prompts, so it has never executed. Verify it for the first time and
add a chunk-boundary unit test. The North Star is unchanged: never burn the account by going too
fast.

**Acceptance.** Dial in a look (change the background colour), switch to Auto, press Run → **the
conversation is the same one**, the refinement is still in effect, and the first image reflects it.
When idle, STOP is not offered. During a run, state is readable at a glance. No prompt is ever sent
before the previous image has landed.

---

### WP6 — ChatGPT panel: width and account

**Problem.** The panel is a hard-coded `w-[330px]` (`App.tsx:238`) — *"it's too narrow, I'd almost
double it."* Worse, David was stuck on a **free plan** inside the app while his real account is on
AppyDave: logging out and back in auto-selected the wrong Google account, and the pane was too small
to fix it. He had to move to another computer.

**Build.**
1. **Resizable panel** with a persisted width and a sane default (roughly double today's, ~640px).
   The bounds sync already handles arbitrary rects (`App.tsx:53-79`) — the constraint is only the
   fixed Tailwind width.
2. **Account visibility + control.** Surface which ChatGPT account/plan the embedded session is on,
   and give a real way to sign out and choose a different Google account. Root cause is the single
   hard-coded partition `persist:imagedrip-chatgpt` (`webview-harness.ts:43`) — investigate whether a
   named/selectable partition per account is the right fix, and confirm the approach with David
   before changing how sessions persist (this can log him out).
3. Make sure Google's account chooser is actually usable at the default width — that's what blocked
   him.

**Acceptance.** Drag the panel wider; it stays after restart. See the current account/plan in the UI.
Sign out and sign in to the AppyDave account **without leaving the app**.

---

### WP7 — Design pass over the finished surfaces

Run the front-end design / impeccable pass over the cockpit **after** WP1–WP6 land, so it reviews
real screens. David: *"I think we need to get the impeccable skill, the front end design skill out
looking at these screens and figuring out what's going on."*

Constraints (non-negotiable, `working-rules.md` §6–8):
- **AppyDave light theme always** — warm cream `#faf5ec`, brown text, amber/yellow accents. Never a
  dark console.
- **The design font stack** (advisory-1 — v1 skipped this and it was a real conformance miss):
  **Oswald** (display) / **Roboto** (body) / **Roboto Mono** (mono), self-hosted woff2, CSP-safe —
  no CDN fonts.
- **The ChatGPT panel is native — we do not design it.** Design only the frame.
- **No "Generating" state in our UI.** Queued and Harvested only.
- Refine the existing light Pipeline design; do not produce fresh alternatives.

---

## 4. Definition of done

1. All seven WPs implemented, each meeting its own acceptance criteria above.
2. `npm run build && npm test` clean.
3. **David has run it in the app** — the only definition of done that counts for runtime behaviour
   (`build-handover.md`). Specifically the WP5 scenario end to end: dial in a look → switch to Auto →
   the refinement survives → images harvest into a dated run folder with a manifest → open the
   previous run from history.
4. `docs/working-rules.md` §"Current state" updated, and `overview.html` still links everything.

## 5. Gotchas carried forward from v1 (do not relearn these the hard way)

- **Completion de-dupe:** first **UNSEEN** src wins, never "last container", or images get
  mis-attributed to the wrong prompt. Already implemented — don't undo it.
- **Paste:** `webContents.paste()`. Synthesized Cmd+V is a no-op in ChatGPT's contenteditable.
- **Preload path is `.mjs`** — wrong path and `window.imagedrip` is undefined.
- **FileAuthor scoped root** refuses any path escaping it; WP1's per-run subfolders must live *inside*
  the root. *Correction (advisory-1):* a write is git-committed **only if the root is a git repo** —
  `FileAuthor.commit()` silently returns `committed:false` otherwise, so per-project output dirs must
  be git-inited on creation (now done by `ensureOutputRoot`), and WP1 acceptance includes a harvested
  file being provably committed there.
- **Selectors churn** — they live only in `chatgpt-selectors.ts`; re-pin with
  `npx electron probe/probe-c.cjs`.

## 6. Source

Captain's Log **B329** — Plaud, 2026-07-28 07:59, 30 min, M4 Mini store (`100.82.235.39:7101`).
Part 1 of that recording is the bootstrap/orchestration pattern (chaperone → Swagger worker) and is
not part of these requirements. Parts 2–3 are the live UAT pass transcribed above.

Related but out of scope: **B305** (autopilot: first generation doesn't always fire; filename/image
mismatch — mango prompt produced a banana image) and **B306 / B313** (porting ImageDrip into
KyberAgent as an iframe / external-app extension).
