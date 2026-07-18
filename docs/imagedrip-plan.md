---
project: imagedrip
repo: appydave/imagedrip          # public; own repo, scaffolded from AppyTron
built_on: appytron                # ~/dev/ad/apps/appytron (the boilerplate — not part of this repo)
kind: requirements + architecture + build plan
status: named + approach locked — not yet scaffolded
created: 2026-07-18
last_updated: 2026-07-19
approach: C — embedded webview host + synthesized input + DOM-read (§4)
security: lethal-trifecta (embedded remote origin + file writes) — see brains/personal-security
---

# ImageDrip — Requirements & Build Plan

## 0. TL;DR
**ImageDrip is a native desktop app that generates images by driving ChatGPT's image UI
(DALL·E / GPT-image) directly — no paid API.** It hosts your real, logged-in ChatGPT in an
embedded webview, feeds image prompts in on a **human-like cadence**, reads the page DOM to know
when each image is done and to grab its URL, then **downloads, names, and routes** the results
into a project's output directory.

- It is **its own app + repo** (`appydave/imagedrip`, `~/dev/ad/apps/imagedrip/`), **scaffolded
  from AppyTron** — AppyTron is the boilerplate, not the host. ImageDrip is AppyTron's **first
  real consumer**, so building it pressure-tests the scaffold.
- The name: "Drip" = the signature metered, one-at-a-time, human-cadence feed (never a flood) +
  a nod to its ancestor tool; "Image" pins the domain.

## 1. Origin
Rewrite of a ~30-line Ruby CLI, `mj-paste-test/main.rb` — a `pbcopy` drip feeder that staged
MidJourney `/imagine` prompts to the clipboard on a timer for **manual** paste. Recover it at git
`2a6f359:lib/mj-paste-test/main.rb` in `~/dev/ad/appydave-tools`. Sins to fix: hardcoded paths,
single target, manual paste, and a *destructive* input file (deleted lines as it went — no clean
resume/history).

## 2. Hard constraint (drives the whole architecture)
**No API credits.** ImageDrip operates the real ChatGPT UI on David's subscription, never an API
key. Deliberate cost decision — see §9.

## 3. Domain model
```
Project → Theme → Style/Design → Prompt list → Runs (history)
```
Local-first (`@appydave/core` `Store`, from AppyTron), non-destructive, resumable, per-run
history. Prompts are **stateless & self-contained** (the full style is baked into each prompt —
matches the first real batch and avoids conversation-context drift).

### Two operating modes (the spine)
- **Batch Runner** — hands-off: a locked style + prompt list → **open a fresh ChatGPT chat** →
  drip the full list on human cadence → harvest each result → walk away. **This is v1.**
- **Style Studio** — interactive: seed a style, test one image, redo/tweak, **lock** it.
  **Fast-follow (v2).**
- The handoff (**lock style → new chat → run from scratch**) is the core UX. v1 can skip Studio
  because the first real batch already ships fully-formed, style-baked prompts.

---

## 4. Architecture — Approach C (locked)
The decision that dominates everything is *how the tool talks to ChatGPT*. Locked:
**host ChatGPT in an embedded webview; WRITE like a human, only READ the DOM.**

```
┌──────────────────────────────────────────────────────────────────┐
│  RENDERER (React/Vite/Tailwind/Zustand — from AppyTron)            │
│  Project/Style/Prompt-list mgmt · live queue · progress · STOP     │
│                         │ window.imagedrip.* (typed, Zod-validated)│
├─────────────────────────┼──────────────────────────────────────────┤
│  MAIN (createConsole from AppyTron)                                │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ CadenceEngine │  │ WebviewDriver│  │ FileAuthor (scoped+git) │  │
│  │ jitter+learn  │  │              │  │ writes into project dir │  │
│  └──────┬────────┘  └──────┬───────┘  └───────────▲────────────┘  │
│         │ "send next"      │ input / read          │ harvest      │
└─────────┼──────────────────┼───────────────────────┼──────────────┘
          │                  ▼                        │
          │        ┌──────────────────────────────────┴───────────┐
          │        │  <webview> partition:persist  chatgpt.com     │
          │        │  real logged-in session (subscription)        │
          └──────► │  WRITE: sendInputEvent → synthesized Cmd+V +   │
   put prompt on   │         Enter (real OS-level input, NOT JS     │
   clipboard,      │         value-setting — looks human)           │
   focus input     │  READ:  MutationObserver in a webview preload  │
                   │         → "generation done" + image <img> src  │
                   │         (reads are invisible to the server)    │
                   └────────────────────────────────────────────────┘
```

**The core insight:** it's *writing* to the page via JS that fingerprints as a bot; *reading*
the DOM is invisible to the server. So ImageDrip **inputs** via a synthesized real keystroke
(humans paste prompts — normal) and only **reads** the DOM to detect completion and locate the
finished image. Robust completion-detection + clean download, with a human input signature.

**What Approach C buys over the old screenshot idea:**
| | Old (screen-capture + cliclick) | Approach C (webview + DOM-read) |
|---|---|---|
| macOS grants | Accessibility **+** Screen Recording | **none** (input & read are in-app) |
| Completion detect | pixel-diff on a screenshot (fuzzy) | MutationObserver on the message (reliable) |
| Download | automate Save-As dialog (brittle) | fetch the `<img>` URL → `FileAuthor` (clean) |
| Adaptive tempo | guessed from pixels | **measured** real generation time |
| Fragility | window position / resolution | ChatGPT DOM structure changes |

Remaining fragility (ChatGPT obfuscates/renames DOM classes) is contained by keeping selectors
in **one small, swappable module** — treat it like a live catalog; expect to re-pin it.

## 5. Runtime engine
- **Feed:** prompt → clipboard → focus webview input → `webContents.sendInputEvent` synthesizes
  **Cmd+V + Enter**. Real OS-level input, human signature.
- **Cadence:** jittered, human-like delays (randomized only — do **not** over-engineer anti-bot
  behavior until something breaks). Global **STOP key** live even hands-off.
- **Completion-detect:** a webview-preload `MutationObserver` watches the latest assistant
  message; fires "done" when the image element resolves to a real URL (not a spinner/placeholder).
- **Adaptive tempo / learning:** completion timestamps give the **actual** per-image generation
  time; a rolling per-target estimate sets the next delay, so the default *shifts over time*
  (solves "GPT is slow today"). Fully local, no credits.
- **Rate-limit guard (must-have):** the observer also watches for the "image limit reached" DOM
  state → **pause + notify**, never spin blindly. Account-safety, not a nicety.
- **Harvest:** read the finished `<img>` URL → fetch within the webview session → `FileAuthor`
  writes to the **scoped project dir**, renamed by rule, + a provenance log line.

## 6. What ImageDrip needs from AppyTron
**Reuses (validates):** `createConsole`, `WindowManager`, `IpcRouter` (Zod-validated door),
`Store` (Project/Theme/Style/Run), `FileAuthor` (path-safe, git-committed output writes — its
first real workout), `add-state`/Zustand, `nav-shell`, `global-shortcut` (STOP), `packaging-macos`.

**Forces new AppyTron recipes** (Sentinel rule: recipes are byproducts of a real pilot — these
get contributed back to AppyTron as `references/*.md`):
| Recipe | Purpose |
|--------|---------|
| `webview-harness` | Embed a session-partitioned remote web app; synthesized OS-level input + DOM-read via a webview preload (no macOS Accessibility/Screen-Recording grants) |
| `dom-observe` | MutationObserver-in-webview reporting "done" + element data back to main; selectors in one swappable module |
| `image-harvest` | Fetch a resolved image URL in-session → `FileAuthor` → named + routed + provenance |
| `rate-limit-guard` | Detect the provider's limit state → pause + notify |
| `human-cadence` | Jittered timing + adaptive per-target pacing store (may stay app code) |

*(These replace the earlier `native-input`/`screen-capture`/`screen-watch`/`download-router`
set, which assumed OS-automation of an external window — Approach C makes them unnecessary.)*

## 7. Security (Approach C surface)
Lethal-trifecta shape shifts but doesn't shrink: ImageDrip **embeds a remote origin
(chatgpt.com) it reads data from + writes files locally + can act.** Under AppyTron §6/§9:
- Webview is **untrusted content** — isolate its partition; talk to it only through a dedicated
  webview preload with a **minimal, typed** read/report channel. No Node in the webview.
- **`FileAuthor` scoped root only** — harvested images land *only* under the project's output
  dir; every write git-committed (revert point).
- **STOP key always live**; conservative default cadence; rate-limit guard mandatory.
- **Account risk is real:** automating ChatGPT — even a real session — sits against OpenAI ToS;
  the cost of getting it wrong is the *account*, not a crashed run. Human cadence + rate-limit
  guard are mitigations, not guarantees. Convenience-vs-risk chosen with eyes open. Ties to
  `~/dev/ad/brains/personal-security`.

## 8. First real job (by category — specifics stay in the consuming project)
A *job* is external input — **not part of ImageDrip.** The first batch it will be pointed at is a
**private brand's product-image run**: ~**116 catalog items** with no photo, a **single locked
style** (warm-wood / soft-natural-light / text-free commercial product shots), **stateless
self-contained prompts** (one per item), routed into that project's **brand-art output dir** with
a **provenance log** and a callback to record image refs. Those concrete specifics — catalog,
brand, paths, counts — live in the **consuming project**, never in this repo. (The prompt list
currently exists as an HTML preview generated for that project; ImageDrip consumes a prompt list,
it does not own one.)

Perfect v1 target: real volume (100+), a locked style (no Studio needed yet), a defined output
dir — exercises the whole feed → detect → harvest → route chain end to end.

## 9. Cost rationale
Paid image APIs run ~\$0.06/image, so a 100+ image batch is several dollars *per run*, and batches
recur across a catalog's life. ImageDrip does the same batch on an existing ChatGPT subscription
for **\$0**; the saving compounds across runs. That economic fact is *why* the no-API constraint
drives the whole architecture.

## 10. Scope
- **v1 = Batch Runner** — proves the hard/risky parts (webview harness, synthesized input, DOM
  completion-detect, adaptive cadence, rate-limit guard, harvest→route) against the real 100+ item
  batch. No Style Studio needed (prompts arrive style-baked).
- **v2 = Style Studio** — interactive dial-in, redo/tweak, lock-and-handoff.
- **Later** — additional targets (DZINE / others) via config + provider-specific selector modules.

## 11. Locked decisions
1. **Name** — ✅ `ImageDrip`.
2. **Interaction approach** — ✅ C (embedded webview + synthesized input + DOM-read).
3. **Repo / folder** — ✅ `appydave/imagedrip`, `~/dev/ad/apps/imagedrip/`, scaffolded from AppyTron.
4. **v1 scope** — ✅ Batch Runner first; Style Studio v2.

## 12. Open / next
- **Scaffold** — `npx create-appytron imagedrip` once AppyTron's `webview-harness` + `image-harvest`
  recipes exist (or scaffold now and hand-write those two as the pilot that then donates them back).
- **GitHub remote** — repo not yet created (`gh repo create appydave/imagedrip --public`); awaiting go.
- **Selector module** — pin ChatGPT's current image-message + limit-state DOM selectors (expect churn).
- **Provenance callback contract** — how the consuming project records harvested image refs (kept
  generic here; concrete binding lives in that project).
