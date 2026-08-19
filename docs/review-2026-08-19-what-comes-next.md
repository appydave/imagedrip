---
doc: review
project: imagedrip
status: FINDINGS — analysis only, nothing built, nothing committed beyond this file
created: 2026-08-19
purpose: recover the design thinking of 2026-08-06 → 08-14, reconcile it against the code,
  and rank what comes next — separating David's own prior rulings from new proposals
authority: docs/north-star.md — Star interviewed 2026-08-08, bearing ruled 2026-08-09,
  parity rule ruled 2026-08-10
pairs_with: docs/research-imagedrip-architecture.md, docs/requirements-v5-unattended-and-portable.md
---

# ImageDrip — what comes next, and what was already decided

## 0 · The headline

**The thinking was not lost. It is consolidated, extensive, and already in this repo.** The sweep
recovered four requirement documents, a 1,619-line architecture research report, a North Star with
a ruled bearing, and 40 commits. Nothing had to be reconstructed from session transcripts.

**What is actually wrong is different, and simpler: ImageDrip has been stalled for five days
waiting on David.** The 2026-08-14 research closed with **seven questions only he can rule**, three
of them blocking the domain model. Since then the repo has taken exactly one commit
(`8bd3694`, 2026-08-19), and it was a chore. There are **no ImageDrip sessions on Roamy since
2026-08-14** and none on the M4.

**The bottleneck is a ruling, not a build.**

Second headline, and it is the one that costs real work: **v5 Phase 1 — the North Star core, "make
a run something you can walk away from" — is entirely unbuilt.** All five of its items verified
absent from the code today, despite a commit on 2026-08-14 titled *"Phase 0 probes + Phase 1"*.
That commit implements the **research document's** Phase 1 (truthfulness fixes), which is a
different numbering from **v5 §3's** Phase 1. Two plans, two "Phase 1"s, one of them silently
unstarted.

---

## 1 · Timeline — what was decided, when, with evidence

| Date | Event | Evidence | State |
|---|---|---|---|
| 08-06 | **Control surface + MCP proxy + headless probe designed** | `docs/plan-imagedrip-control-surface.md` | ✅ shipped `3fbe28a` |
| 08-06 | v4 resident-chat requirements (WP1–WP3) | `585d9a5` | ✅ shipped |
| 08-07 | Product judged as a product — usability matrix, ranked gaps | `5c1302f` | ✅ analysis |
| 08-08 | **North Star INTERVIEWED from David** (a derived first pass was wrong; he corrected it) | `d4ded7d`, `docs/north-star.md` | ✅ ruled |
| 08-08 | WP4 in-app chat pane + human gate (D1) + tool restriction (D2) | `23dd822`, `e0fdfd8` | ✅ shipped |
| **08-09** | **BEARING RULED**: *unattended leads, distribution follows* | `north-star.md:bearing_source` | ✅ **David's ruling** |
| 08-09 | Q3 answered — *"being installed by other people is not needed just yet"*; **nobody is waiting for a second install** | v5 §5 Q3 | ✅ ruled |
| 08-09 | Phase 0.1 (`running` false on completion), 0.2 (log file) | `5f80eca`, `706f7e7` | ✅ shipped |
| **08-10** | **PARITY RULE RULED**: every automated step hand-operable, every manual step automatable — *"you cannot test what you cannot drive yourself"* | `north-star.md` | ✅ **David's ruling** |
| 08-10 | v5.1 proposed — the unit, the resume, the manual path | `1ad28e7` | proposed |
| 08-10 | v5.1 Item 2 (manual path / parity) | `1a77ba2` | ✅ shipped |
| 08-10 | v5.1 Item 3 model — brand travels with project (= v5 Phase 2.1 `Project.brandId`) | `82d9dde` | ✅ shipped |
| 08-11 | **Authorization moved beneath the adapters; `chat.gate-decide` hole closed; published surface pinned by test** | `3f274d3` | ✅ shipped |
| 08-11 | PR template so the agent-first rules fire | `0b4d2ee` | ✅ shipped |
| 08-11 | `agent-first-architecture` brain created, citing ImageDrip session `2dba3c1e` | brain `field-notes.md` | ✅ |
| **08-14** | **David × Jan design session** (Open Design mockups), then a **4-strand parallel research run** on the M4 (session `a3bea582`, 12 MB) | `docs/ui-design-notes-jan.md`, `docs/research-imagedrip-architecture.md` | ✅ analysis |
| 08-14 | Research Phase 0 probes + Phase 1 truthfulness fixes | `3a701bd` | ✅ shipped |
| 08-14 | `Template.promptShape` — the template shapes every prompt | `ede7b46` | ✅ shipped |
| 08-14 | David: *"I think that shape is right"* — the last substantive ruling recovered | M4 session `a3bea582`, 11:14 | ✅ ruled |
| **08-14 →** | **Seven questions raised for David's ruling. None answered.** | research §8 | 🔴 **open, 5 days** |
| 08-19 | AGENTS.md / agent-agnostic conventions | `8bd3694` | ✅ chore |

**Sessions recovered.** Roamy: 9 ImageDrip sessions 08-06 → 08-08, including `2dba3c1e` (the one
the brain cites) and `e6c867c4` (an agent driving the MCP tools end to end). M4: 6 sessions, the
substantive one being `a3bea582` (08-14, 22 user turns, 4 research strands). The design thinking
lives in the **documents those sessions wrote**, not in the transcripts — which is why it was
recoverable at all.

---

## 2 · Divergences — where the sources disagree

Three, all named with the primary record preferred over the synthesis.

### 2.1 🔴 The brain is factually wrong about ImageDrip's control surface

`~/dev/ad/brains/agent-first-architecture/INDEX.md` states:

> *"ImageDrip is the sharpest test — it is the verified **inverted** case, with **no external
> control surface of any kind**."*

**False, and false when it was written.** ImageDrip shipped a loopback HTTP control surface, an MCP
stdio proxy and a headless probe on **2026-08-06** (`3fbe28a`) — five days before that INDEX was
created on 08-11. Verified in the code today: `src/main/control-surface.ts`, `scripts/imagedrip-mcp.mjs`
(341 lines), a committed `.mcp.json`, `test/mcp-proxy.test.ts`.

**The brain contradicts itself**: its own `field-notes.md` §0 grades ImageDrip's Track C status as
*"**Implemented** — and the implementation is ahead of this brain."* The INDEX sentence and the
field note cannot both be true.

*Charitable reading*: "inverted case" plausibly means ImageDrip **hosts its own agent** (the
resident-chat-operator direction) rather than only being driven from outside — which is true and
interesting. But the clause *"with no external control surface of any kind"* is wrong as written,
and it is the clause that would mislead anyone choosing a first recipe target.

**→ The brain needs a correction.** Out of scope for this pass (it is not this repo), but it should
not stand.

### 2.2 🟡 The research document's §3.2 is stale

`docs/research-imagedrip-architecture.md` §3.2 (dated 08-14) states that `imagedrip:chat:gate-decide`
is published to agents, that `NEVER_EXPOSED` lists `chat:send` / `chat:state` / `chat:stop` **and not
`gate-decide`**, and adds *"I verified every link in this chain myself."*

**It was closed three days earlier.** `git log -S` puts `'imagedrip:chat:gate-decide'` into
`NEVER_EXPOSED` in commit `3f274d3`, **2026-08-11**. Today it sits at `verb-policy.ts:125` with a
pinning test at `test/verb-policy.test.ts:336` asserting `isExposed(...) === false`.

The document's own "Phase 1 has landed" banner lists five corrected findings; this is not among
them. **The finding was real and is fixed; the document still reads as if it is live.**

*What I cannot establish*: whether the M4's working copy was behind at the time (which would make
the strand's verification honest but stale) or whether the check was mis-run. Both look identical
from here.

### 2.3 🟡 A recommendation was made and not taken

Research §3.2 recommends inverting `isExposed()` from a **denylist to an allowlist**, on the
grounds that three of four `chat:*` channels were enumerated by hand and the fourth was missed —
*"exactly the failure mode a denylist has and an allowlist does not."*

**Not done.** `verb-policy.ts` still reads: not in namespace → false; in `NEVER_EXPOSED` → false;
otherwise **publish**. A new `imagedrip:*` channel is exposed by default. The pinning test catches
it in CI, which is a real mitigation — but it catches it *after* someone wrote it, not *before*.

---

## 3 · Current vs needed — the capability surface

**Physical-location audit first**, per the brain's rule for Electron: *capabilities living in the UI
process are not externally reachable no matter what a CLI claims.*

| Where it lives | Externally reachable? |
|---|---|
| **Main process** — `IpcRouter` registry, `control-surface.ts`, `domain-store.ts` | ✅ Yes. 55 `imagedrip:*` channels; 18 in `NEVER_EXPOSED`; the rest published via `/v1/verbs` |
| **Main, deliberately withheld** — every ChatGPT-webview writer (`harness:*`, `run:inject-*`) | ❌ By design, and correctly. v4 §4 is the ToS mitigation; a second writer voids it |
| **Renderer only** — the `⚡ inject` per-prompt buttons, the LIST PROMPT card | ❌ Not reachable, and **intended** — they are buttons, not verbs (v5.1 §0) |
| **Spawned CLI child** — the pane's own agent | n/a — it is an *external* client of its own app |

**The topology finding worth carrying forward** (research §3.1, verified): ImageDrip has **no
internal binding**. Its own chat pane reaches its own handlers through *three processes* — CLI child
→ stdio MCP proxy → loopback HTTP → main. That is correct for containment, and it is a real latency
and failure-mode cost that the Star's word *"directly"* hides.

### The table

| Capability | Verb | Class (`agent-safety.md` §1) | Preview / dry-run | Process | State |
|---|---|---|---|---|---|
| Describe the surface | `GET /v1/verbs` | `read-only` | n/a | main | ✅ exists — schemas projected from the same Zod, zero-logic proxy |
| Read app context | `context.get` | `read-only` | n/a | main | ✅ exists — expires ~5 min, returns `{active:false, hint}` never an error |
| Read domain | `domain.get` | `read-only` | n/a | main | ✅ exists |
| Start a run | `run.start` | `destructive` (consumes queue, drives live chat) | ❌ **none** | main | ⚠️ exists, gated **pane-only** |
| Stop a run | `run.stop` | `idempotent`, always-reachable by design | n/a | main | ✅ exists — but nothing *tells* an agent it is safe to retry |
| Delete project/brand/template | `project.delete` etc. | `destructive` | ❌ **none** | main | 🔴 exists, gated **pane-only** — see §4.2 |
| **Limit a run to N prompts** | `run.start {limit}` | `destructive` | inherits `run.start` | main | 🔴 **UNBUILT** — `RunConfig` has no `limit` field (`ipc.ts:253`) |
| **Edit one queued prompt** | `prompt.update` | `reversible-write` (return prior text) | return before/after | main | 🔴 **UNBUILT** — zero occurrences in `src/` |
| **Interpolation variables** | `Template.promptShape` + `Prompt.variables` | `reversible-write` | render without feeding | main | 🔴 **half-built** — `promptShape` shipped `ede7b46`; `variables` has **zero** occurrences |
| **End-of-run signal** | native notification | `read-only` (a signal, not a mutation) | n/a | main | 🔴 **UNBUILT** — no `Notification` in `src/` |
| **Reopen a run / segments** | `run.reopen`, `segment.*` | `reversible-write` | list what would attach | main | 🔴 **UNRULED** — research Candidate A, blocking Q1 |
| **Export a run** | `export_run(runId, dest)` | `reversible-write` | list files + destination | main | 🔴 blocked on one field (research §4.8) |
| **Publish to a brand repo** | `repo.publish` (per-record) | `destructive` (writes outside the app) + `external-side-effect` | ✅ must dry-run | main | 🔴 **UNBUILT** — v5 Phase 2.2; `PANE_DENIED_VERBS` still present, which the plan says it deletes on landing |
| **Tool safety annotations** | `readOnlyHint` / `destructiveHint` / `idempotentHint` | metadata | n/a | MCP proxy | 🔴 **ZERO** in `imagedrip-mcp.mjs` |

---

## 4 · Ranked recommendation

Ranked by what unblocks the most. **Each item says whether it is David's own prior conclusion or a
new proposal from this pass.**

### 1. Rule the seven questions — 🔵 **DECIDED TO ASK, AWAITING DAVID** (research §8, 08-14)

Nothing below moves without Q1. The three blocking ones:

- **Q1 — ratify or reject Candidate A**: a `Segment` record below `Run`, and `Run` becomes
  reopenable. *Everything in §2, §3.4 and §6 of the research assumes it.*
- **Q2 — name the segment.** "Flow" collides with the `▶ Run flow` button label.
- **Q3 — is `Theme` retired or renamed?** It is a vestigial `{name, prompts[]}` wrapper used only
  to mint run ids.

Plus four on the folder/estate decision, two of which **reverse David's own earlier rulings** (Q5
reverses v3 Decision 5 on images-in-git; Q6 concerns `i-shared`, created and deleted the same day).

**This is the whole bottleneck.** Five days of stall trace to it.

### 2. v5 Phase 1 — "make a run something you can walk away from" — 🔵 **DECIDED 08-09, UNBUILT**

This is the **North Star core** under a bearing David ruled himself, and **all five items are
absent from the code**. It does not depend on Q1.

1.1 `RunConfig.limit` · 1.2 interpolation variables · 1.3 end-of-run notification · 1.4 retire the
LIST PROMPT card (still at `App.tsx:2103`) · 1.5 `prompt.update`

1.3 is the one that makes "walk away" *safe* rather than optimistic, and it is the smallest.

**Why this ranks above the agent-surface work**: the Star's test is *"does it get more images out
with less of the operator touching it?"* — and unattended running is the ruled bearing. The agent
surface already works; the walk-away run does not exist.

### 3. MCP tool safety annotations — 🟢 **NEW PROPOSAL** (seeded by research tail)

`imagedrip-mcp.mjs` emits **zero** annotations. The MCP spec's default for an unannotated tool is
*"non-read-only, potentially destructive, non-idempotent, open-world."*

**So today `domain.get` and `project.delete` look identical to any client-side safety layer.**

This is the cheapest high-leverage change on the list: the proxy already derives everything from
`/v1/verbs`, so add three booleans to `VerbInfo` in `verb-policy.ts` and let them travel. It also
directly implements `agent-safety.md` §1 classification on a surface that currently carries none —
and it tells an agent that `run.stop` is idempotent and always safe to retry, which is the one
thing it should retry freely.

### 4. Gate destructive verbs for **every** client, not just the pane — 🟢 **NEW PROPOSAL** (from a known residual)

`control-surface.ts:348` reads `if (isPane && isGated(verb))`. So `project.delete`, `brand.delete`,
`template.delete` and `repo.attach` are confirm-first **for the in-app pane only**. Any other client
holding the bearer token deletes unchallenged.

This is a **decided trade-off**, not a bug — it is what keeps `chat:probe` headless, and v5 §1.4
records it as a known residual. It is ranked here because the brain's field note is precisely about
this shape: joy-media moved a real photo because a mutating verb was reachable with no preview, and
ImageDrip's own §2.4 lesson is *"a capability under test is still a capability."*

**The fix that preserves the headless probe**: give the gated verbs a `dryRun` / preview form rather
than a confirmation prompt. A probe can call the preview freely; a real delete still needs the
explicit second call. That satisfies `agent-safety.md` §4 without a human in the loop.

### 5. Invert `isExposed()` to an allowlist — 🔵 **RECOMMENDED 08-14, NOT TAKEN**

Research §3.2's recommendation, still open. Publishing-by-default already leaked one verb. The
pinning test makes this less urgent than it was — it catches a leak in CI — so this ranks below the
items that change what the app can do.

### 6. Correct the brain — 🟢 **NEW PROPOSAL**

`agent-first-architecture/INDEX.md` should stop calling ImageDrip *"the verified inverted case, with
no external control surface of any kind."* It is the reference the next recipe author will read.

---

## 5 · Not recovered — stated as unknowns, not as absences

**A sweep that finds nothing proves the search missed it, never that the discussion did not happen.**
Everything below is an open unknown.

- **The M4's `a3bea582` session was read via its 22 user turns only.** It is 12 MB; I did not ingest
  the assistant turns or tool output. Decisions reached inside that session but never written to a
  document would not appear here.
- **Four research strands ran as separate agents** (`strand2-agent-surface`, `strand3-file-layout`,
  `strand4-drift`, and one unnamed). Their full reports arrived as teammate messages **inside**
  `a3bea582`. I read their conclusions as consolidated into `research-imagedrip-architecture.md` —
  **I did not verify that the consolidation is complete.** A strand finding that was dropped during
  synthesis is invisible to this pass.
- **`docs/ui-design-notes-jan.md` was not read in full.** Jan's design rationale is summarised here
  only through the research document's account of it. **The design session's own record is a primary
  source I did not open**, and Jan's reasoning may contain conclusions the research did not carry.
- **No M2 or Jan/Mary machine was swept.** Only Roamy and the M4. Sessions on `mac-mini-m2`
  (offline, last seen 1 day ago), `jans-mac-mini` or `marys-mac-mini` were not searched.
- **Transcript retention is 30 days by default.** The 08-01 → 08-19 window is inside it, so nothing
  should have been pruned — but I did not verify retention settings on either machine.
- **Whether the M4's checkout was current on 08-14** — which decides whether §2.2's stale finding was
  an honest read of stale code or a mis-run check. Both look identical from here.
- **Whether Q1–Q7 were ruled verbally and never written down.** The repo shows no ruling; David's
  memory is the only place that could contradict this, and it is the first thing to check before
  acting on §4.1.

### Checks that were run, and what they do NOT establish

- `grep` over `src/` establishes a symbol is **absent from the source**. It does not establish the
  capability is absent — a feature could exist under a name I did not guess. The `limit` probe
  initially returned 8 files and was a **false positive on a common word**; the definitive check was
  reading `RunConfig` at `ipc.ts:253`. Items 1.2, 1.3, 1.5 were confirmed by symbol absence only,
  which is weaker.
- `git log -S` dates a string's arrival in a file. It does not prove the *behaviour* arrived then.
- The session sweep searched **project-scoped** transcripts for ImageDrip. A design discussion held
  in a `brains` or `appydave-plugins` session would rank only on keyword, and three such sessions
  did surface — but I read none of them in full.
