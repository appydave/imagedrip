---
doc: explainer
project: imagedrip
status: current
created: 2026-08-04
purpose: why ImageDrip runs two independent timers, and why each is driven by a different statistic
---

# Two clocks at the dinner table

*How ImageDrip paces itself, and the two timers that spent most of this project
wearing each other's clothes.*

---

Picture ImageDrip as a guest at a very slow dinner party. It asks ChatGPT a question, and
ChatGPT — being the sort of guest who thinks before speaking — takes a minute and a half
to answer. Ninety seconds of silence, then a beautiful character sheet lands on the table.

There are two clocks running in ImageDrip's head during that silence, and for most of
this project's life they were wearing each other's clothes.

## The first clock — the Stall Budget

Its only question is grim: **has this person died?**

It doesn't care about manners. It cares about the worst case, because if it panics too
early it will shake a perfectly healthy guest by the shoulders mid-sentence. So it
watches the **slowest** answer anyone has ever given and pads generously past it.

That's the one you saw fail — `stalled — no image in 113s`, when the image was merely
taking 153 seconds to arrive. The Stall Budget called time of death on someone still
talking.

## The second clock — the Cadence

Completely different job. Its question is social: **how long do I sit here before I ask
the next thing?**

And this is where the old code was quietly embarrassing. It waited **3.5 seconds**.
Ninety seconds of patient silence, a gorgeous answer arrives, and ImageDrip fires back
with the next question in three and a half seconds. Nobody does that. That is not a
person; that's a machine with a clipboard. **The rhythm itself was the tell.**

So the Cadence now takes **12% of the median generation** — at a 90-second median that's
about eleven seconds. Long enough to look like someone who actually glanced at the
picture. Floored at 3s so it never becomes frantic, capped at 30s so a long queue doesn't
outlive you. Then **jitter at 75% of base** on top, which is deliberately wide: a tight
jitter around a fixed base is still a rhythm, just a blurry one.

## The impostor

Remember `José Rizal` — the 0.9-second "generation"? That was never an image being made.
That was a re-fired DOM src: a phantom, someone coughing at the table and the notetaker
writing it down as an answer.

The **mean** is a credulous notetaker. Feed it a 0.9 alongside an 86.7 and it dutifully
reports that the typical answer takes 43 seconds.

The **median** simply doesn't care. Sort the samples, take the middle, and the phantom
sits harmlessly at the end of the queue where it can't drag anything. Belt and braces,
the same 5-second plausibility filter throws out anything under five seconds before the
median even looks at it — because a real image generation never, ever takes 0.9 seconds.

## What actually killed that image

Here the story has to correct itself, because the obvious villain didn't do it.

The phantom *did* poison the mean. But the mean was **not** the number that hanged the
image. Working it through:

```
samples: 0.9s, 86.7s          budget = max(mean × 1.75, slowest × 1.3)

  mean     43.8s  → × 1.75 =   76.7s
  slowest  86.7s  → × 1.30 =  112.7s   ← this term won
                    budget  =  112.7s
```

`113s` came from **1.3× headroom over the slowest of only two samples** — and the next
image took nearly twice that. The killer wasn't a bad number. It was **thin evidence**:
two samples is not a distribution, and no multiplier over such a small sample can be
trusted to clear the third.

Which is why the fix that mattered is neither the median nor the filter. It's the
**confidence floor**: until there are five plausible samples, the budget stays at its
generous bootstrap value and refuses to tighten at all. Widening is still allowed
immediately — one slow image is evidence enough on its own — but *narrowing* has to be
earned.

The impostor is still a real hazard, and still filtered. It just didn't fire the shot
that day.

> **The lesson worth keeping:** a derived bound needs a confidence floor, not just good
> arithmetic. The adaptive budget was briefly *worse* than the hardcoded constant it
> replaced, because it acted on evidence it didn't have yet.

## Where they live

| | Stall Budget | Cadence |
|---|---|---|
| Question | is this generation **dead**? | how long does a **human pause**? |
| Statistic | the **slowest** observation | the **median** observation |
| Why that one | must clear the worst real case | must track the typical case |
| Code | `src/main/stall-budget.ts` | `src/main/cadence.ts` |
| Failure if wrong | healthy runs halt | the rhythm looks mechanical |

Both clocks now sit in the timings panel — click the `s/img` figure in the top bar — with
their arithmetic shown and, more importantly, **the question each one answers written
next to it**, so nobody mistakes one for the other again.

---

## Related

- [`user-guide.md`](user-guide.md) — the operator's view: what the panel shows and how
  to read it.
- [`kdd/learnings/`](kdd/README.md) — the stall-budget regression as a formal learning.
- [`imagedrip-plan.md`](imagedrip-plan.md) §7 — why cadence realism matters at all: this
  drives a real account, and pacing is the mitigation, not a disguise.
