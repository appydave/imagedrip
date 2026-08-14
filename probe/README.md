# ImageDrip probes — de-risk the two novel mechanisms first (spec §7)

Approach C rests on two things being true. Prove them **before** building the batch runner.

| Probe | Proves | Needs build? | Human? |
|-------|--------|:------------:|:------:|
| **A — read** | The webview preload's MutationObserver detects a finished image and reports `image-done` to main | yes | no |
| **B — write** | `sendInputEvent` clicks/keys arrive as `event.isTrusted === true` — **the gate for the whole approach** | no | no |
| **C — real** | Live ChatGPT: login persists in the partition, a hand-triggered generation fires `image-done` with a fetchable URL | yes | **yes** |
| **feed** (bonus) | The full write composition: click focuses the composer, paste lands the prompt, Enter submits — all trusted | no | no |

## Phase 0 probes (added 2026-08-14) — de-risk reference images and drift

Same rule, later question: prove the mechanism before building on it. Driven by
`docs/phase-0-checks/README.md`, which is where results get recorded.

| Probe | Proves | Needs build? | Human? |
|-------|--------|:------------:|:------:|
| **attach** | `clipboard.writeImage()` + the same `wc.paste()` `feed()` uses lands an image **file** in a composer — and `feed()`'s `selectAll()` does not destroy it | no | no |
| **attach-live** | The REAL ChatGPT composer accepts a pasted image, `composerAttachment` matches the chip, and the submit post-condition still holds | no | **yes** |
| **measure-drift** | Not a probe — an analyser. Turns a run folder into `D_prev` (collapse) and `D_first` (wander), with chunk boundaries from the manifest | no | no |

## Run

```bash
cd ~/dev/ad/apps/imagedrip
npm install
npm run build          # Probes A + C use the built preload (out/preload/webview-preload.mjs)

npx electron probe/probe-b.cjs   # WRITE gate — run this FIRST
npx electron probe/probe-a.cjs   # READ path
npx electron probe/probe-c.cjs   # REAL — interactive, you log in + generate by hand
```

Phase 0:

```bash
npx electron probe/probe-attach.cjs                      # local; add a real PNG path for realism
npx electron probe/probe-attach-live.cjs <real.png>      # interactive — QUIT IMAGEDRIP FIRST
npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/<project>/*
```

`probe-attach-live.cjs` shares the app's `persist:imagedrip-chatgpt` partition, so it is
signed in if ImageDrip is — and two processes on one partition is asking for trouble.
It pastes, and with `--submit` sends **one** message to the real account. It never runs a batch.

Each probe opens a GUI window, so it must run on a machine with a display (not a
headless CI/agent box).

## What PASS looks like

- **Probe B (the gate):** terminal prints
  `✅ isTrusted: click=true key=true — Approach C write premise HOLDS.`
  If it prints `❌ … INVALID`, **stop** — synthesized input is being flagged as
  untrusted and the stealth premise is gone; fall back to conservative cadence or
  re-think the approach (spec §0/§8).
- **Probe A:** terminal prints `← inbound {"type":"image-done","imageUrl":"blob:…"}`
  then `✅ PASS`.
- **Probe C:** after you log in and generate an image by hand, the terminal prints
  `✅ image-done — url: https://…`. If nothing fires, the selectors in
  `src/main/chatgpt-selectors.ts` need re-pinning against the live DOM — that is
  expected maintenance (spec §4), not a bug.

## Status (as delivered, 2026-07-19)

- **Probe B — EXECUTED, PASSED.** Observed in the build environment:
  `recorded: {"click":true,"key":true,"keyName":"a"}` →
  `✅ isTrusted: click=true key=true`. The write/stealth premise (invariant #1) is
  **verified**, not assumed — synthesized `sendInputEvent` arrives as trusted input.
- **Probe A — EXECUTED, PASSED.** Observed:
  `← inbound {"type":"image-done","imageUrl":"blob:file:///…"}` → `✅ PASS`. The real
  built webview preload's MutationObserver detects a finished image and reports to
  main. This also confirms the **ESM webview preload (+ shared ipc chunk) loads
  correctly inside a `WebContentsView`**.
- **Probe feed — EXECUTED, KEY FINDING.** Observed:
  `activeElement after click: prompt-textarea` (click focuses the composer),
  `synthesized Cmd+V: no-op`, `webContents.paste(): WORKS` with
  `paste isTrusted: true · input isTrusted: true`, `Enter trusted: true`. → The
  spec's synthesized-Cmd+V step does **not** paste into a contenteditable; the
  harness uses `webContents.paste()` (real Edit>Paste, trusted) instead. Invariant #1
  still holds. Spec §3 updated with this correction.
- **Probe C — NOT executed (interactive only).** It requires a human ChatGPT login
  and drives OpenAI's live site, so it must be run by a person. Until then, the live
  ChatGPT read path + the `chatgpt-selectors.ts` values are **unverified** and the
  selectors are expected to need re-pinning against the live DOM (spec §4).

## Status (Phase 0 probes, 2026-08-14)

- **attach — EXECUTED, PASSED.** Observed: `clipboard formats: ["image/png"]`,
  `DataTransfer kinds: ["file"] types: ["image/png"]`, `file count: 1`,
  `paste isTrusted: true`, and `chip survived selectAll + text paste: 1 → 1` with the text
  still landing. → **`clipboard.writeImage()` + `wc.paste()` delivers an image FILE as
  trusted input**, and `feed()`'s `selectAll()` does not destroy an attachment when the
  image is pasted first. Invariant #1 holds for images as it does for text. **Also passed
  against a real 1.4k×1.1k, 1.7 MB harvest** — note the clipboard round-trip re-encodes and
  the delivered file is ~13% larger than the file on disk (1,727,471 → 1,955,196 B).
- **attach-live — NOT executed** (interactive; needs a signed-in account and a human).
  Until it runs, `composerAttachment` remains ⚠️ UNVERIFIED *for images specifically* — it
  was pinned for the "Pasted text" chip and has never seen an image chip.
- **measure-drift — EXECUTED against the three existing run folders.** It runs and produces
  numbers. Baseline recorded in `docs/phase-0-checks/README.md §Results`. Headline:
  `D_prev` flat (0.259 → 0.261) across the one 12-image run, **but the subjects there vary
  so much that the metric is dominated by subject difference rather than style drift** — a
  weak reading, and recorded as weak.
