---
doc: requirement
project: imagedrip
status: requirement — not yet built
created: 2026-08-03
purpose: a judgment-capture layer inside the cockpit, so friction and bad images are marked up at the moment they're seen
---

# Live UAT — ImageDrip

**Status:** requirement / not yet built
**Author:** 2026-08-03, via `live-uat-design`

## Why

v2 (WP1–WP5) has been built, committed, typechecked and unit-tested — and **stopped**,
because `working-rules.md` says it is *"awaiting David's in-app acceptance of WP1–WP5."*
That acceptance pass hasn't happened. The last one that did happen produced the entire
v2 requirements document, but the findings only existed in a chat transcript: David
described the pain, an agent transcribed it, and everything not transcribed died.

> "I think I had a lot of problems with it. It had a bunch of bugs… I could tell you
> what works and what doesn't work along the way." — David, 2026-08-03

Two kinds of judgment are dying on this screen, and they are **not the same kind**:

- **Cockpit friction** — "this control lies to me / I can't find the thing / this
  step is confusing." This is the WP1–WP5 acceptance signal and the WP6/WP7 backlog.
- **Image quality** — "that image is wrong for the brief." ImageDrip exists to dial
  in a look; every harvested image is a verdict on the primer that produced it, and
  `manifest.json` already records the **exact primer as posted**. The producer
  snapshot is therefore almost free — and without it, image judgments are inert.

The pattern is explicit that these two must not share a store: merging a screen anchor
with a data anchor destroys the cross-record correlation ("the primer keeps producing
washed-out backgrounds") that is the whole point of a tuning loop.

## Who holds the pen

**David only.** Single-user desktop app; there is no second role and no tenancy.

Gate: a **`uat` toggle in the top bar**, persisted, default **off**.
Deviation from the pattern's `off | on-demand | always-on` triad: ImageDrip ships
`off | on` only, where `on` behaves as `always-on`. There is no support-call scenario
and no end-user, so the third state has no distinct consumer. Revisit if that changes.

Nothing renders when the toggle is off. This is never an always-visible nag over a
cockpit that is meant to be sat in for an hour.

## What gets flagged

### Screen-anchored — `Snag`

Every region of the cockpit is flaggable. Regions are **plain strings**, so a new
surface becomes flaggable by passing a name — no schema change, no migration.

| `region` | Screen area | Built in |
|---|---|---|
| `topbar` | identity, state chip, mode switch, run controls | WP5 |
| `mode` | Dial-in ↔ Auto switch | WP4 |
| `run-entry` | Continue-in-this-chat vs fresh-chat choice | WP5 |
| `context-brand` | Brand card — select / create / edit / lock | WP2 |
| `context-project` | Project card — rename / body / autosave dot | WP2 |
| `context-output` | output dir + Reveal | WP1 |
| `context-runs` | run history list | WP1 |
| `context-copy` | Copy Primer / Copy Prompt / listing helper | WP2 |
| `queued` | QUEUED lane, import, ⚡ inject | WP3, WP4 |
| `harvested` | HARVESTED grid | v1 |
| `chatgpt` | the native ChatGPT panel and its frame | WP6 (not built) |
| `run-history-view` | an opened previous run | WP1 |

### Data-anchored — `ImageVerdict`

| Entity | Anchor | Has an editor today? |
|---|---|---|
| a harvested image | `runId` + `promptId` | n/a — it's an artifact, not a field |

## The records

Two records. **Two files.** One shared control.

### `Snag` — cockpit friction

```ts
interface Snag {
  id: string;              // `snag-<counter>` — assigned in main, never the client
  region: string;          // PLAIN STRING. may be synthetic, e.g. "config:cadenceBaseMs"
  verdict: 'down' | 'question' | 'up' | 'idea';
  note: string;            // free text — THE HIGHEST-VALUE FIELD
  snapshot: string;        // caller-composed: what was on screen at flag time
  mode: 'dial-in' | 'auto';
  phase: string;           // RunStatus.phase — idle/feeding/awaiting/paused/…
  projectId: string;
  status: 'open';          // resolution is out of scope (see below)
  createdAt: number;
}
```

`snapshot` is composed **at the call site**, so the flag stays legible after the data
changes — e.g. `"project=smoothies · outputDir=~/Pictures/ImageDrip/smoothies · 12 queued · 4 harvested"`.

### `ImageVerdict` — image quality

```ts
interface ImageVerdict {
  id: string;              // `iv-<counter>`
  runId: string;           // the app's real run key — links to <outputDir>/<runId>/
  promptId: string;        // the app's real prompt key
  file?: string;           // harvested filename, relative to the run folder
  verdict: 'down' | 'up' | 'question' | 'idea';
  note: string;
  producer: {              // MANDATORY — this is what makes the corpus a tuning signal
    primer: string;        // the EXACT primer text as posted (from the run manifest)
    promptText: string;    // the exact prompt fed
    entry?: 'continue' | 'fresh';
    mode?: 'auto' | 'dial-in';
    brandId: string;
    projectId: string;
    generationMs?: number;
  };
  status: 'open';
  createdAt: number;
}
```

**Verdicts:** 👎 wrong/missing · ❓ don't-get-it · 👍 confirmed good · 💡 idea (a wish,
not a defect).

`❓` is not decoration — its fix is usually *render where this value comes from*, not
change the data. On this app it will land on things like "why did it re-prime there?"

**No star rating.** Prose, not scalars. `reasonTags` are not in the schema at all —
if classification is ever wanted, it is written offline by an agent, never by the client.

## The lanes

Discovered from this app, not assumed. ImageDrip has an AI in the loop, so the prompt
lane is real — but it is a **primer** lane, not a system-prompt lane.

| Lane | The judgment says | The fix |
|---|---|---|
| **primer** | "the images are wrong" | tune `Project.md` (and, rarely, `Brand.md`) |
| **app** | "the cockpit is wrong / confusing" | change the React + main code — WP6/WP7 |
| **missing control** | "this is wrong and there's no way to change it" | **build the editor** — see the gap map |
| **provenance** | "I don't understand where this came from" | render the source inline |
| **driver** | "ChatGPT changed and detection broke" | re-pin `chatgpt-selectors.ts` via `probe/` |

Auto-routing: an `ImageVerdict` is **always** the primer lane. A `Snag` is triaged by
hand — but `region` carries most of the signal already.

## The sidecar

```
<userData>/live-uat/snags.jsonl
<userData>/live-uat/image-verdicts.jsonl
```

On macOS that resolves to `~/Library/Application Support/imagedrip/live-uat/`.

**Transport: file store, append-only JSONL.** The lightest thing that works here.
There is no server, no tenancy and no concurrency — a single desktop process appending
lines. JSONL over JSON specifically so a crash mid-session cannot corrupt the corpus,
and so `wc -l` is a live count.

**It is a sidecar.** It is *not* a field on `domain.json`, not a key in the run
manifest, and not a file inside the harvested image folders. Deleting the whole
`live-uat/` directory must leave ImageDrip working exactly as before.

**Links on:** `runId` + `promptId` (the app's real keys, as written by `RunRecorder`)
for image verdicts; `region` + `projectId` for snags.

**Readable by an agent without an API:** `cat ~/Library/Application\ Support/imagedrip/live-uat/*.jsonl`.
That is the entire read path. The consumer is an in-session agent running
`live-uat-process`, not an HTTP client.

## Decision channel

**None.** ImageDrip's real decisions — import, run, stop, switch project, save
Project.md — already have their own home in `domain.json` and the run manifests. No
judgment captured here changes what the app does. The channels are already separate
by construction; the build must keep them that way (a Live UAT write must never touch
`domain.json`).

## Surfaces to build

1. **`uat` toggle** — a small ⚑ in the top bar. Off by default, persisted. When off,
   every surface below renders `null`.
2. **`<FlagButton region=… snapshot={fn} />`** — one reusable component. Hover-reveal
   ⚑ in the corner of each region, matching the existing hover-reveal ⚡ pattern in
   the queue rows. Click → a small inline composer: four verdict buttons, a note
   textarea (**autofocused** — the note is the point), ⌘↵ to save.
3. **Image verdict on the harvested grid** — hover-reveal 👍/👎 on each thumb, with
   an optional note. Pulls the producer snapshot from the run manifest.
4. **Group verdict on the harvested grid** — in `uat` mode, thumbs become
   multi-selectable; one verdict + one note applies to all selected. Built up front
   because a single run is ~18 images and retrofitting this is painful. *This is the
   one item to cut if the build overruns.*
5. **Count + reveal** — the ⚑ toggle shows `snags + verdicts` as a badge, and
   clicking through reveals the `live-uat/` folder in Finder. Proof the capture
   landed; no inbox.

## Out of scope

- **Acting on the flags.** That is `live-uat-process` — a session reading the corpus
  off disk. The app's only job is to capture clean data.
- **An inbox — list / resolve / reopen / delete / bulk clear.** Deliberately deferred:
  the corpus is drained by an agent within the hour, so a pile that becomes wallpaper
  is not yet a risk. `status` is written as `'open'` and never changes. **If Live UAT
  survives past this session, build the inbox — this is the known debt.**
- **A classifier / `reasonTags`.** Volume nowhere near justifying it.
- **Telemetry.** Clicks, dwell and paths are machine-captured usage, not human
  judgment. Different thing, different store, not this.

## Gap map (the free roadmap)

Fields that exist in the data or the runtime with **no editor in the UI**. Snags
landing here are the strongest signal about which editor to build next.

| Field | Where it lives | Why it stings |
|---|---|---|
| `RunConfig.primerSettleMs` / `loadSettleMs` | `shared/ipc.ts` | These were bumped **in source** to fix the paste-without-enter symptom. David cannot tune the fix that fixed his bug. |
| `RunConfig.cadenceBaseMs` / `cadenceJitterMs` | `shared/ipc.ts` | The human-pacing dial — the ToS mitigation — has no UI. |
| `RunConfig.chunkSize` | `shared/ipc.ts` | Re-prime frequency is the main lever against style drift. Hard-coded from the UI's point of view. |
| `Project.sourcePath` | `shared/domain.ts` | Dial-in copy-back is modelled and never wired or exposed. |
| `Prompt.refImage` | `shared/domain.ts` | Declared, deferred, no control. |
| `Theme.name` | `shared/domain.ts` | Defaults to the project id; no rename. Run folders inherit it. |
| brand / project **delete** | `domain-store.ts` | Create and switch exist. Nothing can ever be removed. |
| ChatGPT panel width | `App.tsx` | WP6, not started — the known worst ergonomic complaint. |

---

## Build order (≈20 minutes)

1. `shared/live-uat.ts` — the two record types + the IPC channel names.
2. `main/live-uat-store.ts` — append-only JSONL writer, id counters seeded from the
   files on disk, `<userData>/live-uat/`.
3. Two IPC registrations + preload surface: `window.imagedrip.uat.snag(...)`,
   `.verdict(...)`, `.counts()`, `.reveal()`.
4. `renderer/src/FlagButton.tsx` — the shared control + composer.
5. Wire the toggle, the region flags, and the harvested-grid verdicts into `App.tsx`.
6. `npm run typecheck && npm test` must stay green. No existing test may change.
