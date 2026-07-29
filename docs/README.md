---
doc: docs-index
project: imagedrip
status: current
created: 2026-07-29
purpose: the single entry point to ImageDrip's documentation — start here
---

# ImageDrip Documentation — Start Here

**ImageDrip** is a macOS desktop app that generates images by driving your own
logged-in ChatGPT session instead of a paid image API. It feeds prompts in at a
human-like pace, watches for each finished image, and downloads, names and files it
automatically.

**Status:** v1 Batch Runner — the ChatGPT driver is live-verified; the run loop on top
of it is built but not yet signed off on a full real batch.

---

## Pick your path

| If you are… | Read this | Then |
|---|---|---|
| **Using the app** | **[user-guide.md](user-guide.md)** | Nothing else. It's self-contained. |
| **New to the project and want to understand it** | [../README.md](../README.md) → [imagedrip-plan.md](imagedrip-plan.md) | [ux-and-workflow.md](ux-and-workflow.md) |
| **Building or extending it** | [build-handover.md](build-handover.md) + [working-rules.md](working-rules.md) | [specs/](#specifications) |
| **Fixing a broken ChatGPT integration** | [specs/webview-harness-spec.md](specs/webview-harness-spec.md) §4 | [../probe/README.md](../probe/README.md) |
| **Reviewing the risk / cost case** | [imagedrip-plan.md](imagedrip-plan.md) §7 and §9 | — |

---

## Every document

### For users

| Document | What it covers |
|---|---|
| [user-guide.md](user-guide.md) | Install, sign in, import prompts, run a batch, where images land, troubleshooting, known limits. **The only doc an operator needs.** |
| [../README.md](../README.md) | The project front door — what ImageDrip is and why, in two minutes. |

### Requirements & design (the Northstar)

| Document | What it covers |
|---|---|
| [imagedrip-plan.md](imagedrip-plan.md) | **The Northstar.** Origin, the no-API constraint, the layered Brand/Project/Prompt model, the locked architecture (Approach C), security and ToS risk, cost rationale, v1 scope, locked decisions, open questions. |
| [ux-and-workflow.md](ux-and-workflow.md) | The intended end-to-end workflow (setup → dial-in → lock → automation), the cockpit layout, and the v1 build order. |

### Specifications

| Document | What it covers |
|---|---|
| [specs/webview-harness-spec.md](specs/webview-harness-spec.md) | The ChatGPT driver: embedding a logged-in session, writing with synthesized OS input, reading the DOM for completion, harvesting, the swappable selector module, acceptance criteria. |
| [specs/installability-spec.md](specs/installability-spec.md) | How ImageDrip gets scaffolded from the AppyTron boilerplate, the gaps that blocked it, and the interim path used. |

### Build & process

| Document | What it covers |
|---|---|
| [build-handover.md](build-handover.md) | Self-contained brief for a fresh session picking up the v1 build: what's already done, what to build, the gotchas that bite. |
| [working-rules.md](working-rules.md) | Standing rules for how work is done on this project (light theme, no "generating" state, refine-don't-replace, confirm before building). |
| [handover-webview-harness-g3.md](handover-webview-harness-g3.md) | The earlier brief that produced the ChatGPT driver. Historical. |
| [../probe/README.md](../probe/README.md) | The three probes that de-risked the approach, and how to re-run them to re-pin ChatGPT's selectors. |

### Design artifacts

| Artifact | What it is |
|---|---|
| `../overview.html` | Clickable index of every doc and design mockup. **Needs a local HTTP server** — start one with `npx serve .` from the repo root, then open `http://localhost:3000/overview.html`. |
| `../.mochaccino/designs-v2/pipeline-light.html` | The chosen cockpit design that the built UI implements. |
| `../.mochaccino/designs/index.html` | The five earlier design directions that were explored. |

---

## The idea in one diagram

```
Brand.md      the fixed look — never edited mid-run
   └ Project.md   the dialled-in specifics — this is what you tune
        └ Prompt     one short line per image

   Brand + Project  ──►  the PRIMER, posted once per conversation
   then short prompts inherit that style

   feed prompt ──► ChatGPT generates ──► detect finished image
                                          ──► download ──► name ──► file
   every ~18 images: fresh conversation, re-post the primer (fights drift)
```

---

## Conventions

- Every document carries YAML frontmatter with `status:` — check it before trusting a
  doc's currency.
- One fact has one home. Documents link to each other rather than repeating content.
- `imagedrip-plan.md` is canonical for *why*; the specs are canonical for *how*; the
  user guide is canonical for *what an operator does*.
