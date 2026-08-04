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

**Status:** the pipeline is proven — a real theme has been run end to end against a live
ChatGPT session. Current work is **v2 (Usability & Project Identity)**: WP1–WP5 built and
awaiting an in-app acceptance pass; WP6 (wider panel, account switcher) and WP7 (design
polish) not started.

---

## Pick your path

| If you are… | Read this | Then |
|---|---|---|
| **Using the app** | **[user-guide.md](user-guide.md)** | Nothing else. It's self-contained. |
| **New to the project and want to understand it** | [../README.md](../README.md) → [imagedrip-plan.md](imagedrip-plan.md) | [ux-and-workflow.md](ux-and-workflow.md) |
| **Touching either of the timers** | **[two-clocks.md](two-clocks.md)** | Then `src/main/stall-budget.ts` / `src/main/cadence.ts` |
| **Picking up the build right now** | **[requirements-v2-usability.md](requirements-v2-usability.md)** + [working-rules.md](working-rules.md) | The "Current state" block at the end of working-rules is the live progress marker. |
| **Understanding how v1 was built** | [build-handover.md](build-handover.md) | [specs/](#specifications) |
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
| [requirements-v2-usability.md](requirements-v2-usability.md) | **The current build.** v2 Usability & Project Identity — every finding from a live UAT pass traced to the code that caused it, split into seven work packages with acceptance criteria. |
| [ux-and-workflow.md](ux-and-workflow.md) | The intended end-to-end workflow (setup → dial-in → lock → automation), the cockpit layout, and the v1 build order. |
| [two-clocks.md](two-clocks.md) | **How ImageDrip paces itself.** The Stall Budget (is it dead?) vs the Cadence (how long does a human pause?) — two timers, two questions, two statistics. Includes why the adaptive budget was briefly *worse* than the constant it replaced. **Read before touching either timer.** |

### Specifications

| Document | What it covers |
|---|---|
| [specs/webview-harness-spec.md](specs/webview-harness-spec.md) | The ChatGPT driver: embedding a logged-in session, writing with synthesized OS input, reading the DOM for completion, harvesting, the swappable selector module, acceptance criteria. |
| [specs/installability-spec.md](specs/installability-spec.md) | How ImageDrip gets scaffolded from the AppyTron boilerplate, the gaps that blocked it, and the interim path used. |

### Build & process

| Document | What it covers |
|---|---|
| [build-handover.md](build-handover.md) | The v1 build brief. **Historical** — v1 shipped — but its "critical gotchas" section is still the best list of the traps in this codebase. |
| [working-rules.md](working-rules.md) | Standing rules for how work is done on this project (light theme, no "generating" state, refine-don't-replace, confirm before building). |
| [kdd/](kdd/README.md) | **What we learned the expensive way.** Four learnings + one ADR. Read the frontend ones before touching the ChatGPT panel or any floating UI — both failures are silent and look like something else. |
| [live-uat.md](live-uat.md) | The in-app judgment-capture layer: what gets flagged, the two records, the sidecar, and what is deliberately out of scope. |
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

   each run ──► <project output dir>/<YYYY-MM-DD-HHmm-theme>/
                  images + manifest.json (the exact primer + every prompt) + provenance.jsonl
```

---

## Conventions

- Every document carries YAML frontmatter with `status:` — check it before trusting a
  doc's currency.
- One fact has one home. Documents link to each other rather than repeating content.
- `imagedrip-plan.md` is canonical for *why*; the specs are canonical for *how*; the
  user guide is canonical for *what an operator does*.
