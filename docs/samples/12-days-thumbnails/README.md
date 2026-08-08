# 12 Days of Claudmas — thumbnail plates

The first real workload ImageDrip has ever run. Kept here because it is the only
corpus that exercises the app the way it is actually used, and because it was
briefly living in a session scratchpad, which is ephemeral.

## What it is

Twelve `TitleThumbPair` prompts (FliThumb) for the *12 Days of Claudmas* series
on the AppyDave channel — one thumbnail **plate** per day.

A *plate*, not a finished thumbnail: the headline hook text is deliberately not
drawn, because composing exact words into an image is the least reliable thing
to ask a generative model for, and the production path finishes that step later
at higher fidelity (KIE.AI / Nano Banana 2). What the plate must deliver is the
ground, the palette, the composition and the **ghost watermark** — which is both
FliThumb's *subliminal/ambient* text layer and, per the AppyDave thumbnail brand
reference, "the single strongest tie to the web brand".

## Files

| File | What |
|---|---|
| `all-12-prompts.blocks.txt` | All twelve, `blocks` format (`---` separated) |
| `batch1-three.blocks.txt` | The three run on 2026-08-07 |
| `remaining-nine.blocks.txt` | **Not yet run** — import with mode `add`, format `blocks` |
| `composed-primer.txt` | The exact 3,502-char primer as posted |

Re-import over the control surface:

```
POST /v1/call/domain.import-prompts
{"text":"<file contents>","mode":"add","format":"blocks"}
```

## Sources

- FliThumb brief — `/Users/davidcruwys/dev/ad/flivideo/flilaunch/docs/flithumb-brief.md`
- Synthesis — `/Users/davidcruwys/dev/ad/brains/ylo/thumbnail-deep.md`
- Entry point — `/Users/davidcruwys/dev/ad/brains/ylo/thumbnail-system-map.md`
- AppyDave thumbnail brand — the `appydave-thumbnail` skill's `references/brand.md`
- Transcripts — `/Users/davidcruwys/dev/ad/flivideo/fligen/assets/12-days-transcripts/01.txt … 12.txt`

## Result of the first run (2026-08-07)

`~/Pictures/ImageDrip/12-days-of-claudmas/2026-08-07-2133-twelve-days-of-claudmas/`

3/3 harvested, `outcome: complete`, generations 36s / 61s / 43s, no pauses.

**The finding that mattered:** ChatGPT rendered the ghost watermark correctly —
`THUMBS` in clean, correctly-spelled letterforms, low opacity, bleeding off two
edges, with the frame otherwise held open. So the *ambient* text layer is viable
through this engine even though composed-in *hook* text would not be. That was
the open question this batch existed to answer.

An earlier attempt (`…-2103-…`) recorded 0/3 and a `stalled — no image in 390s`
pause: the run before `feed` verified delivery. It is kept as the before-picture.

## Known gap in these prompts

Every block repeats the same six field labels (`Paired title`, `Contrast mode`,
`Composition`, `Ghost watermark`, `Scene`, `Subliminal signals`) and only the
values differ. The shape belongs on the Template and the values on the Prompt —
see the `prompt:interpolation-variables` snag in the Live UAT corpus. Deliberately
not built yet: one batch proves the duplication, a second **non-thumbnail**
template is what would prove whether a flat string map is the right shape.
