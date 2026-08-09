---
north_star: "Fill in a few fields — or just say it in chat — and get images in that style generated
  on repeat, unattended, into a folder for that run. Drivable by a person or an agent."
horizon: product
status: open
parent: /Users/davidcruwys/dev/ad/brains/north-star/north-star.md   # David's own Star, life/business horizon
bearing: |
  Make a run something you can start and walk away from — then make the whole configuration
  travel, so a second person can run it on their own machine.
bearing_source: 2026-08-09 — RULED by David, not derived. The previous bearing's first clause
  ("finish the chat seat") shipped as v4 WP4 on 2026-08-08. Distribution was explicitly deferred
  in the same ruling: "being installed by other people is not needed just yet."
source: 2026-08-08 — INTERVIEWED from David, not derived. A first pass derived from 54 commits
  and the docs produced a different and wrong Star; he corrected it. The code is a stale snapshot
  of intent, the human is not. Evidence below is used to CHECK his answer, never to form it.
---

# ImageDrip — North Star

## The guiding idea

**Fill in a few fields — or just say it in chat — and get images in that style generated on repeat,
unattended, into a folder for that run. Drivable by a person or an agent.**

## What this means in practice

- **Three fields carry the whole thing**: the **brand**, the **style/template** of image, and the
  **theme or project**. Joy Juice fruit juices and Joy Juice character sheets are the same brand,
  different templates, different projects — the axes are separate on purpose.
- **The chat drives the fields.** Typing into controls by hand is the fallback, not the design.
  It should be easy and seamless — *"it should just generate images a lot."*
- **A run is the unit.** Images are harvested automatically and land in a project folder belonging
  to that run.
- **It costs nothing per image.** ChatGPT's own UI is the engine — *"I don't have to pay for it."*
  This has been the founding constraint since the first commit, 2026-07-19.
- **Single-user, distributed widely.** One person (or one agent) per install — but that install
  goes to clients, to Mary, to Jan, and to David. It is not multi-tenant and does not become so.
- **Agents are first-class operators**, not an afterthought — ultimately through API endpoints they
  can drive directly.
- **Flexible for prompt shapes not invented yet** — interpolation variables are the named example.

## What this is NOT

- Not multi-tenant · not a shared service · not an account system
- Not a paid-API image pipeline — that path exists elsewhere (kie.ai / Nano Banana for FliThumb)
- Not an image editor, and not a general creative tool
- Not a cockpit to be mastered. If it needs learning, that is the defect

## The test

**Does it get more images of a given style out, with less of the operator touching it?**

If it removes a manual step, widens what a run can express, or lets an agent do something a human
had to do — it fits. If it adds a control to learn, it does not.

**And nothing may fail silently.** This repo's own hardest-won rule: *"a control that quietly
disappears is worse than none, because it is believed."* A run that did not deliver must never look
like one that did.

## Memorable framing

> "Say the style. Walk away. Come back to a folder full of images."

## Open

1. ~~The bearing above is derived, not ruled.~~ **Closed 2026-08-09** — ruled by David, and
   corrected: *unattended* leads, distribution follows. See `bearing_source` above.
2. **Distribution to other people has not started**, and is **deliberately not next**. Every
   install today assumes David's machine and a hand-signed-in ChatGPT. Clients and staff are named
   in the Star as users, but on 2026-08-09 David confirmed **nobody is waiting** — so this stays a
   named destination with no date. It moves the moment a real person has one, and *who* they are
   decides its size: staff take a `.dmg` from a link; a client takes signing, notarization and an
   honest first launch.
3. **Interpolation variables** — floated, not specified.

*Limits: the Star came from a 2026-08-08 interview. The 54 commits and v1–v4 requirements docs were
read, and describe a narrower product than the one he wants — treat them as history, not intent.*
