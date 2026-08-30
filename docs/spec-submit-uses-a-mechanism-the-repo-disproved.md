---
doc: spec
project: imagedrip
status: OPEN — defect report + proposed fix. NOTHING BUILT, and no fix has been run.
  The diagnosis is reasoned from the repo's own evidence; it has not been reproduced.
created: 2026-08-29
reported_by: Claude Code session "imagedrip-ed", during the 2026-08-29 three-part audit
severity: high — accounts for 6 of the 12 pauses ever recorded on this machine
---

# `submit()` uses the exact mechanism `paste()` proved does not work

## The finding, in two lines of the same file

`src/main/webview-harness.ts`, twenty lines apart:

```ts
// :468  private paste()
//   VERIFIED (probe/probe-feed.cjs, 2026-07-19): a synthesized Cmd/Ctrl+V via
//   `sendInputEvent` is a NO-OP into a contenteditable composer — the spec's
//   stated keystroke does not paste. `webContents.paste()` runs the real
//   Edit>Paste editing command … This is the correct mechanism.
wc.selectAll();
wc.paste();                                              // ← real editing command

// :486  private submit()
wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers });
wc.sendInputEvent({ type: 'keyUp',   keyCode: 'Return', modifiers });
```

**A synthesized key event was probed, proved to be a no-op into this composer, and `paste()` was
rewritten to use the real editing command. `submit()` was left on the disproved mechanism.**

The comment inside `paste()` even names the downstream symptom it has to defend against:

> *"a submit that didn't take (the known paste-without-enter symptom) leaves the previous text
> sitting there, and the next paste concatenates onto it."*

So the symptom was known, and the code was hardened **against** it rather than at its cause.

## What the evidence says

Read from `~/Pictures/ImageDrip/*/*/manifest.json` on Roamy, 2026-08-29 — 11 manifests, 47 prompt
rows, 13 harvested.

**Every pause ever recorded, and there are only two kinds:**

| Count | Reason, verbatim |
|---|---|
| **6** | `feed failed — feed: the prompt is still sitting in the composer — Enter did not submit it.` |
| 6 | `stalled — no image in 390s` ×4, `576s`, `240s` |

**Half of every failure ever logged is this one function.**

And the message is emitted by a check that *worked*. `webview-harness.ts:279` fires from
`awaitComposer((s) => s.text.length === 0)` — the harness looked at the composer, saw text that
should have been cleared, and reported the truth precisely. **Perception is fine. Actuation is not.**

Contrast `:269` — *"the prompt never reached the composer — the paste did not land"* — which has
**never once fired**. The half that was fixed works.

## Why this is the cheapest explanation

1. A synthesized key into this composer is **already proven** to be a no-op, by this repo, with a
   named probe and a date.
2. The failure is **intermittent, not total** — `2026-08-07-2133` ran 3 of 3 to `outcome: complete`
   with no pause. A page-structure change would not be intermittent; a race between a synthesized
   key and a composer's own readiness would be.
3. It requires no hypothesis about ChatGPT changing anything.

## The proposed fix — mirror what `paste()` already did

`paste()` was fixed by **stopping the synthesis and using the real thing**. `submit()` needs the
same move. Two candidates:

**(a) Click the real send button.** The machinery already exists and is proven: `locateInput()`
(`:444`) asks the preload for a rect and `click()` (`:460`) delivers a real `mouseDown`/`mouseUp`.
That is the same trusted-input path the composer click already uses. Needs one addition — a
`sendButton` selector in `src/main/chatgpt-selectors.ts`, which today carries only `submitKey`
(`:34`, `:84`) and no button selector at all.

**(b) Keep the key, add a verified retry.** Cheaper, weaker: re-fire the key once on the existing
post-condition failure before pausing. Treats the symptom, and if the mechanism truly is a no-op it
will fail identically twice.

**Recommend (a), with (b) as the fallback path if the button cannot be located** — which is exactly
the shape `feed()` already uses for the composer click (`:261-264`: locate, click if found, warn and
continue if not).

**Do not reach for `executeJavaScript` to call `.click()` or dispatch a synthetic event.** That
breaks the repo's invariant #1 — trusted input, not scripted DOM — which is the whole ToS mitigation.
A real `sendInputEvent` mouse click on a located rect does not.

## What would prove it

One run. Not a test — the mechanism lives in a real browser against a real page:

1. Queue 3 prompts against a signed-in engine.
2. Run with the current `submit()`. Record whether any pause says *"still sitting in the composer"*.
3. Swap to the button click. Run the same 3.
4. **Success condition:** the paste-without-enter pause does not recur across, say, 10 consecutive
   feeds. **Failure condition:** it recurs — in which case the mechanism is not the cause and this
   spec is wrong, which is worth knowing for the price of one run.

`docs/phase-0-checks/RUNBOOK.md` is the existing home for a measurement of this shape.

## What this spec does NOT establish

- **It has not been reproduced.** No fix was written and no run was made. The diagnosis is reasoned
  from the repo's own probe result plus the manifest data. **It is a strong hypothesis, not a
  confirmed root cause**, and it should not be cited as the latter.
- **It does not explain the other six pauses.** The `stalled — no image in Ns` half is a separate
  question, and at least two of those runs harvested successfully *before* stalling
  (`2026-08-29-1146` at 329s, `2026-08-03-1446` ×2) — so for those, "the selectors rotted" is the
  weaker reading, not the stronger one. Unresolved.
- **It does not establish that ChatGPT has not changed.** Both could be true.
- **No send-button selector was located.** Whether ChatGPT's send button is reliably locatable by the
  existing preload path is unverified — that is the first thing (a) has to answer.
- **The 6/12 figure is pauses, not runs.** Five of the eleven runs recorded no pause at all.

## Why this matters beyond the bug

It is the same class the 2026-08-29 audit found throughout the docs: **a thing was learned, written
down, and then not applied to the neighbouring case.** The probe result is a genuine hard-won lesson
sitting four lines above the code that ignores it.

It also changes what the provider decision is *about*. The decision brief
([audit-2026-08-29-provider-decision-brief.md](audit-2026-08-29-provider-decision-brief.md)) says the
evidence shows *"the panel is not working"*, not *"the panel cannot work"* — this is the strongest
instance of that distinction found so far. **Fixing it first means choosing a provider on cost and
ToS rather than under duress.**
