---
doc: ux-and-workflow
project: imagedrip
status: draft — build spec for the v1 vertical slice
created: 2026-07-19
pairs_with: imagedrip-plan.md (§3 domain, §10 scope), specs/webview-harness-spec.md (the driver)
---

# ImageDrip — Workflow & UX (v1 slice build spec)

**What v1 is:** one vertical slice touching the whole loop once — **dial-in** *and* an **automated
run of one theme** (~15–20 images), ChatGPT only. See `imagedrip-plan.md §10`.

## The layered model (why the UX has three context surfaces)
```
Brand.md   (static, 🔒 read-only in practice)  ─┐
Project.md (small, ✎ editable, copy-BACK)       ├─ primer = Brand + Project (posted once/chat)
Prompt     (short, standalone, [±ref image])   ─┘   then short prompts inherit the primed style
```
`Brand` never changes mid-run. `Project` is what you dial in and copy back to source. Provider is a
swappable **driver** (ChatGPT now; DZINE/Higgsfield later) — the model above is driver-independent.

## Workflow
```
┌─ SETUP ───────────────────────────────────────────────────────────────┐
│  Load Brand.md (static)  ─┐                                            │
│  Load/pick Project.md ────┼─ compose → primer                          │
│  Import prompts → queue  ─┘   (a prompt may carry a reference image)   │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ DIAL-IN   (human-in-the-loop is FINE — copy buttons) ────────────────┐
│  post primer (Brand+Project) into a fresh chat                        │
│    ├ test prompt #1 → look → tweak PROJECT.md (never Brand)            │
│    ├ test #2 → retry #1 → retry #2 …                                   │
│    └ copy updated Project.md BACK to the project source               │
│  repeat until the look is locked                                      │
└────────────────────────────────────────────────────────────────────────┘
                              │  "locked"
                              ▼
┌─ LOCK ────────────────────────────────────────────────────────────────┐
│  new conversation → post final primer  (+ carry reference images)     │
└────────────────────────────────────────────────────────────────────────┘
                              │  press RUN
                              ▼
┌─ AUTOMATION   (autopilot, chunked) ───────────────────────────────────┐
│  for each prompt in the theme:                                        │
│    feed short prompt → wait → detect "image done"                     │
│       (seen-set → first UNSEEN src; NOT "last container")             │
│       → download (in-session fetch) → name → route to output dir      │
│    every ~15–20 images → new conversation → re-post primer            │
│    human cadence · rate-limit → pause · STOP always live              │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 images land in <project>/output/  (+ provenance log)
```

## UX — single-window cockpit
```
┌─ ImageDrip ──────────────────────────────────────────────── [_][□][X] ┐
│  Mode: ( ● Dial-in )  ( ○ Automation )                    [ STOP ■ ]    │
├──────────────────┬────────────────────────────┬────────────────────────┤
│ CONTEXT          │  CHAT (embedded ChatGPT)    │  QUEUE  (theme)        │
│ ┌ Brand.md 🔒 ─┐ │  ┌───────────────────────┐  │ 01 avocado      ✓      │
│ │ Beauty & Joy │ │  │ your logged-in         │  │ 02 banana   ⟳          │
│ │ (fixed)      │ │  │ ChatGPT — live webview │  │ 03 mango  ·  [ref]     │
│ └──────────────┘ │  │                        │  │ 04 lime   ·            │
│ ┌ Project.md ✎─┐ │  │                        │  │  … theme: smoothies    │
│ │ Smoothies    │ │  │                        │  │ 18 in theme            │
│ │ (editable)   │ │  └───────────────────────┘  │                        │
│ └──────────────┘ │ [Copy primer] [Copy prompt] │ [ + import prompts ]   │
│ [ Save back ↩ ]  │ [Copy project back ↩]       │                        │
├──────────────────┴────────────────────────────┴────────────────────────┤
│ DIAL-IN   : [ Post primer ] [ Test next ] [ Retry ] [ New chat ]         │
│ AUTOMATION: [ ▶ Run theme ]  12/18 · ~4s/img · re-prime in 6 · next 3s    │
└──────────────────────────────────────────────────────────────────────────┘
  primer = Brand.md + Project.md composed   ·   queue: ✓done ⟳running ·pending   ·   [ref]=reference image
```
- **CONTEXT column** = the layered model made visible: Brand (🔒), Project (✎ + Save-back), compose.
- **Copy buttons** are the human path (dial-in): copy primer / copy a prompt / copy Project back.
  In Automation the app does the equivalent via the driver (`webContents.paste()`), no human.
- **STOP** always visible; **re-prime countdown** shows the chunk boundary during a run.

## v1 build order
1. **Domain + Store** — Brand / Project / Prompt / Theme / Run; import a prompt list (simple format);
   compose() → primer. Copy-back writes Project.md to its source path.
2. **Cockpit shell** — the 3-column layout + mode toggle + STOP (wire STOP to the existing global
   shortcut). Embed the proven webview in the CHAT column (bounds-synced).
3. **Dial-in** — Post-primer / Test-next / Retry / New-chat + the three Copy buttons. Human-driven;
   no automation risk. (This is the part David lives in.)
4. **Automation** — Run-theme: feed → detect (seen-set/newest-unseen) → harvest (in-session fetch →
   `FileAuthor` scoped root) → name → route → re-prime per chunk. Rate-limit pause. Progress UI.
5. **Prove on one real theme** (~15–20) end to end.

## Open (small) — decide as we build, not blocking
- **Prompt import format** — keep simple; likely one prompt per line **or** a light table
  (subject / prompt / optional output-name / optional ref-image). Expected to evolve.
- **Naming rule** — default `<subject-slug>.png` into `<project>/output/`; make it a per-project setting.
- **Re-prime carry** — v1 re-primes with Brand+Project text; carrying prior reference images into the
  new chat is a fast-follow once ref-image support lands.
