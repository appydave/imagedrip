---
doc: working-rules
project: imagedrip
status: standing — re-apply every turn
created: 2026-07-19
source: David's process reset (2026-07-19)
---

# Working Rules — how to work with David on ImageDrip

These are standing instructions. Re-read and re-apply them every turn. David should never have
to repeat one.

## Process
1. **Refine the chosen thing — never replace it.** When David picks an option ("I like #2"),
   improve THAT option. Do not invent a brand-new alternative. Iterate on the winner only.
2. **Finish one design to completion before moving on.** No half-finished mocks, no "here are 5
   fresh directions." Take the current winner, polish to done, hold it stable. Small changes, same
   artifact.
3. **Keep a real, clickable index.** One page listing every design, doc, and spec, with links that
   actually work (served over http so nothing is a dead `file://` link). Make it navigable before
   telling David to "look at" anything.
4. **Remember the rules already given.** Maintain this list; re-apply it every time. Don't make
   David say the same thing twice.
5. **Confirm before building.** State what you're about to do in one line and let David approve.
   Don't disappear and return with something he didn't ask for.

## Domain / brand (already established — do not re-ask)
6. **AppyDave is light theme, always.** Warm cream (`#faf5ec`), brown text, amber/yellow accents.
   Never a dark console. (Brand tokens: `brand-dave:brand` → AppyDave.)
7. **The ChatGPT panel is native — we don't design it.** Show it honestly (dark, their UI); design
   only the frame around it.
8. **We can't show "Generating."** Our app only tracks **Queued** and **Harvested**. Generating
   happens inside ChatGPT — that panel is the only "generating" view. No Generating lane/column.

## Current state (update as it moves)
- **Chosen design:** light-theme **Pipeline** — `.mochaccino/designs-v2/pipeline-light.html`.
  Being finished to completion. Do not replace it.
- **Index:** `overview.html` (repo root) — the clickable index of everything.
