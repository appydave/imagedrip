---
doc: audit
project: imagedrip
status: ACTED ON 2026-08-29 — the doc fixes below have been applied; see "What was fixed".
  One code fix followed separately (the queue's terminal failure state, Part 2 AF-2).
  DD-017 remains open, awaiting David.
created: 2026-08-29
part: 1 of 3
siblings:
  - audit-2026-08-29-north-star-alignment.md
  - audit-2026-08-29-provider-decision-brief.md
method: appydave:doc-drift (code is canonical, docs are derivative) — report mode
purpose: every claim the docs make, checked against the code, marked TRUE / FALSE / UNVERIFIABLE
---

# Part 1 — Documentation ↔ reality

**Scope.** Every `.md` under the repo except `node_modules/` and the two vendored
`skills/recipe/` copies: `CLAUDE.md` (= `AGENTS.md`, a symlink), `README.md`, and 43 files
under `docs/`, plus `probe/README.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

**Mode.** Report, then applied. Each finding names the cheaper fix.

> **Status, 2026-08-29 (second pass).** David directed that the documentation be updated. **17 of
> the 23 false claims have been corrected in place** — see [What was fixed](#what-was-fixed) at the
> end. The findings are kept in full rather than deleted: they are the record of *how* the corpus
> drifted, which is the thing worth not repeating. **Three findings are deliberately NOT fixed**:
> DD-013 (`north-star.md` — David's to re-ratify), DD-017 (a code change, awaiting his ruling), and
> DD-019 (`overview.html` needs regenerating, not a one-line edit).

**Why this was run again.** Commit `00c96b4` *"four places the docs said more than the code
does"* (2026-08-19) already fixed one round of exactly this. Ten days later there are more —
including one created **today**, in the most recent commit on `main`. Drift here is a standing
condition, not an incident.

---

## The rigour rule, applied to this whole document

Every finding below states what the check did **not** establish. Three limits apply to all of
them and are not repeated in each entry:

1. **A doc claim was marked TRUE only when a specific `file:line` proves it.** "I could not find
   anything contradicting it" is not TRUE — it is UNVERIFIABLE, and there are 9 of those.
2. **This audit read source and first-party runtime state. It did not drive the app.** No verb was
   invoked, no run was started, no UI was clicked. Claims about what a *user sees* are inferred
   from the renderer source, and source that renders is not source that is reachable.
3. **Nothing here establishes that a doc is complete.** Drift is one-directional: it finds
   statements that are wrong, not subjects that are missing. Coverage gaps are noted only where
   they were stumbled into.
4. **Depth is not uniform across the 46 docs, and this is the audit's own biggest limit.** Two
   tiers were applied:
   - **Claim-by-claim**, with each claim anchored to `file:line`: `CLAUDE.md`, `README.md`,
     `docs/README.md`, `north-star.md`, `user-guide.md`, `two-clocks.md`, `working-rules.md`,
     `live-uat.md`, `rulings-open.md`, `kdd/README.md` and the seven learnings, `probe/README.md`,
     and the four `spec-*.md`.
   - **Frontmatter, status and targeted verification only** — every `requirements-v*.md`, every
     `handover-*.md`, `imagedrip-plan.md`, `ux-and-workflow.md`, `research-imagedrip-architecture.md`,
     `wp4-chat-pane-research.md`, `plan-imagedrip-control-surface.md`, `ui-design-notes-jan.md`,
     `phase-0-checks/*`, `specs/*`, `findings-*`, `review-*`, `samples/*`.

   **A doc in the second tier carrying no finding here has not been cleared.** Its status field and
   dates were checked against `git log` and specific high-risk claims were followed up; its body
   was not decomposed. The long requirements documents in particular contain acceptance criteria
   that were not individually traced to tests. **Treat "not listed" for those as "not examined",
   not as "correct".**

---

## Scoreboard

| | |
|---|---|
| Docs in scope | **46** |
| Claims decomposed and checked | ~180 |
| **FALSE** | **23** — 9 critical · 10 major · 4 minor |
| **UNVERIFIABLE** | **9** |
| Load-bearing TRUE (spot-listed below) | 11 |
| Overall corpus verdict | **DRIFTING** |
| Cheaper fix = change the doc | **22 of 23** |
| Cheaper fix = change the code | **1 of 23** (DD-017) |
| **Of the 9 critical, safety claims** | **4** — DD-017, DD-021, DD-022, DD-023 |
| **Of the 9 critical, "nothing built" on shipped work** | **4** — DD-001, DD-002, DD-025, DD-026 |

**The dominant drift class is `status` / `date_stale`, not `stale_reference`.** The docs describe
the *mechanics* of this codebase accurately — the specs, the two-clocks explainer and the KDD
learnings are unusually well anchored. What they get wrong is **what has and has not shipped**.
**Twelve of the twenty-three FALSE findings are a document announcing a state of the world that its
own commit disproved**, and four of those twelve are "nothing built" banners on work that shipped.

---

## Per-doc verdicts

Only docs carrying a finding are listed. The docs not listed carried no FALSE or UNVERIFIABLE
claim that this pass could locate — which, per limit 1 above, is not the same as being correct.

| Doc | Verdict | False | Unver. | Last doc change | Newest code it describes | Note |
|---|---|---|---|---|---|---|
| `README.md` | **STALE** | 4 | 1 | 2026-07-29 | 2026-08-29 | Front door, one month behind; still calls v2 "current work" |
| `docs/live-uat.md` | **STALE** | 1 | 0 | 2026-08-07 | 2026-08-07 | Says "not yet built" about a shipped, in-use feature |
| `docs/spec-stall-budget-visibility.md` | **STALE** | 1 | 0 | 2026-08-29 | 2026-08-29 | Shipped with its own "Nothing built" banner intact |
| `docs/README.md` | **STALE** | 4 | 0 | 2026-08-19 | 2026-08-29 | Verb count, learning count, the "live progress marker" pointer, and "Every document" listing 14 of 46 |
| `CLAUDE.md` | **STALE** | 3 | 1 | 2026-08-19 | 2026-08-29 | The gating paragraph (§ below) and the parity claim contradicted by DD-017 |
| `docs/working-rules.md` (index rule) | DRIFTING | 1 | 0 | 2026-08-05 | 2026-08-29 | `overview.html` called "the index of everything"; it links 13 of ~48 |
| `docs/kdd/README.md` | DRIFTING | 1 | 0 | 2026-08-05 | 2026-08-08 | Index omits a learning that exists |
| `docs/working-rules.md` | DRIFTING | 1 | 0 | 2026-08-05 | 2026-08-29 | Its "Current state" block is stuck at v3 WP3 |
| `docs/user-guide.md` | DRIFTING | 2 | 1 | 2026-08-07 | 2026-08-29 | Self-declares v2-era; no Template, no control surface |
| `docs/north-star.md` | DRIFTING | 1 | 2 | 2026-08-10 | — | Its founding constraint is what Part 3 proposes to reverse |
| `docs/rulings-open.md` | DRIFTING | 1 | 1 | 2026-08-19 | 2026-08-29 | Counts computed on 5 manifests; there are now 11 |
| `.github/PULL_REQUEST_TEMPLATE.md` | **STALE** | 2 | 0 | 2026-08-06 | 2026-08-29 | **A checklist, not a reference.** Both findings critical — teaches a reviewer the pre-`3f274d3` architecture |
| `docs/requirements-v4-resident-chat.md` | **STALE** | 2 | 0 | 2026-08-06 | 2026-08-29 | AC-5 overstates the gate, **and the doc says of itself "nothing built, nothing decided"** while all of v4 shipped |
| `docs/requirements-v3-templates-and-repos.md` | **STALE** | 1 | 1 | 2026-08-04 | 2026-08-29 | Contradicts itself in 11 lines; WP1–WP3 all shipped |
| `docs/spec-control-surface-ui-staleness.md` | **STALE** | 1 | 0 | 2026-08-29 | 2026-08-29 | Second same-day spec shipped with a "Nothing built" banner |
| `docs/two-clocks.md` | CURRENT | 0 | 1 | 2026-08-04 | 2026-08-29 | Accurate; about to become historical (Part 3) |
| `docs/specs/webview-harness-spec.md` | CURRENT | 0 | 2 | 2026-07-29 | 2026-08-07 | Accurate to source; its *live* claims are unverifiable by design |

---

## Findings

Ordered by severity. IDs are stable — cite them when ruling.

### DD-001 · A spec shipped carrying its own "Nothing built" banner

- **Severity**: critical
- **Doc**: `docs/spec-stall-budget-visibility.md` → frontmatter
- **Claim (verbatim)**: `status: OPEN — small renderer + status-field change. Nothing built.`
- **Code truth**: commit `c2c2624` (2026-08-29) added this spec **and** its implementation in the
  same commit — `src/main/batch-runner.ts` (+40), `src/main/index.ts` (+46),
  `src/main/run-manifest.ts` (+23), `src/renderer/src/App.tsx` (+47), `src/shared/ipc.ts` (+54),
  and `test/stall-visibility.test.ts` (+265, 37th test file, passing).
- **Classification**: behavior_mismatch / date_stale
- **Cheaper fix**: **change the doc** — one frontmatter line. The code is correct and tested;
  the banner is a copy-paste survivor from the spec's drafting.
- **What this check did NOT establish**: that the *feature* works in the running app. It
  establishes that code and a test exist. `test/stall-visibility.test.ts` passes, but no test in
  this repo drives the renderer, so "the operator sees the budget burn down" is untested.

> This one matters out of proportion to its size. It is the newest commit on `main`, and the
> drift was born inside the commit that fixed the thing. Any process that catches drift only at
> review time will not catch this class.
>
> **And it is not unique — see DD-026.** A second spec dated 2026-08-29 shipped the same way, the
> same day. Two of the four specs created today carry a false "Nothing built" banner.

### DD-002 · Live UAT is documented as unbuilt; it shipped 26 days ago and has been used

- **Severity**: critical
- **Doc**: `docs/live-uat.md` → frontmatter
- **Claim (verbatim)**: `status: requirement — not yet built`
- **Code truth**: `src/main/live-uat-store.ts`, `src/shared/live-uat.ts`,
  `src/renderer/src/FlagButton.tsx`, and four published verbs — `uat.snag`, `uat.verdict`,
  `uat.counts`, `uat.reveal` (`src/main/verb-policy.ts:355-358`). Shipped in `bf44ee7`. ADR-001
  (`docs/kdd/decisions/adr-001-…`) is `status: accepted`. `docs/working-rules.md` says
  "**Live UAT built (2026-08-03)**" — the repo contradicts itself in two files.
- **Classification**: behavior_mismatch
- **Cheaper fix**: **change the doc.**
- **What this check did NOT establish**: whether the feature works end to end. On disk,
  `~/Library/Application Support/imagedrip/live-uat/` holds `snags.jsonl` with **4 records, last
  written 2026-08-07**, and **no `verdicts.jsonl` at all**. `uat.verdict` has therefore never
  written. That is *not* evidence it is broken — never-called and called-but-failing are
  indistinguishable from the filesystem, and this audit did not call it.

### DD-003 · `README.md` presents v2 as the current work; v2, v3, v4 and v5 Phase 0–1 have all shipped

- **Severity**: critical
- **Doc**: `README.md` → "Status"
- **Claim (verbatim)**: *"Current work (**v2 — Usability & Project Identity**) is not new
  capability… A wider/resizable ChatGPT panel, an account switcher and a design polish pass are
  next."*
- **Code truth**: the README has not been touched since `167e8ef` (2026-07-29); `src/` last
  changed `c2c2624` (2026-08-29). Since that README: Template became a first-class axis
  (`src/shared/domain.ts`, v3), a 34-verb loopback control surface with an MCP proxy shipped
  (`src/main/control-surface.ts`, `scripts/imagedrip-mcp.mjs`, v4), the in-app chat pane and human
  gate shipped (`src/main/chat-session.ts`, `src/main/chat-gate.ts`), and authorization moved
  beneath the adapters (`src/main/capability-guard.ts`, `3f274d3`). The resizable panel it lists
  as "next" shipped in `d6aa934` — `src/renderer/src/useResizable.tsx`.
- **Classification**: version_stale / date_stale
- **Cheaper fix**: **change the doc** — but hand the rewrite to `appydave:craft-readme`, which
  owns the README's shape. Do not patch the Status paragraph in place; the whole document
  describes a smaller product than the one that exists.
- **What this check did NOT establish**: whether an "account switcher" was ever built (no code
  found, but absence of a grep hit is not proof of absence for an unnamed feature).

### DD-004 · "33 verbs on loopback" — there are 34

- **Severity**: major
- **Doc**: `docs/README.md` → Status; and `docs/rulings-open.md` → R16 (*"one verb out of 33 has a
  dry-run"*)
- **Claim (verbatim)**: *"an external **control surface** (33 verbs on loopback)"*
- **Code truth**: **34.** `src/shared/ipc.ts` declares 53 `imagedrip:*` channels;
  `src/main/verb-policy.ts:70-178` (`NEVER_EXPOSED`) removes 19; 53 − 19 = 34. Confirmed
  independently against the live MCP tool roster of the app running right now (pid in
  `control.json`), which publishes 34 `mcp__imagedrip__*` tools. The 33→34 delta is attributable:
  `run.status` became a real pull verb, noted in the code at `src/main/verb-policy.ts:140-142`.
- **Classification**: inventory_mismatch
- **Cheaper fix**: **change the doc — by deleting the number.** A count of a derivable set is pure
  drift surface; `/v1/verbs` answers it correctly forever. This is the second time this number has
  been wrong.
- **What this check did NOT establish**: that all 34 work. It counts *registrations*. Several —
  `uat.verdict` (DD-002), `harvest.thumb`, `runs.reveal` — have no test and no log line on the
  success path, so a broken one and a never-called one look identical.

### DD-005 · Three different counts for the same set of KDD learnings: 7 on disk, 6 in the KDD index, 4 in the docs index

- **Severity**: major
- **Doc**: `docs/kdd/README.md` → "Learnings" table; `docs/README.md:76`
- **Claim (verbatim)**: `docs/README.md`: *"**Four learnings** + one ADR."* `docs/kdd/README.md`
  lists six rows.
- **Code truth**: `docs/kdd/learnings/` contains **seven** files. The one missing from the KDD
  index is `a-truncated-probe-reads-as-an-absent-flag.md` (added `8bd3694`, 2026-08-08). The KDD
  index is itself the doc that says *"never mint a duplicate — bump the existing entry instead"*.
- **Classification**: index_desync / inventory_mismatch
- **Cheaper fix**: **change the docs** — add the missing row to `docs/kdd/README.md`; delete the
  number from `docs/README.md:76` rather than correcting it to seven.
- **What this check did NOT establish**: whether the seventh learning is *good* — only that it
  exists and is unlisted. An unlisted learning is unfindable, which is the whole failure mode a
  KDD index exists to prevent.

### DD-006 · The docs index points at `working-rules.md` as "the live progress marker"; it stopped moving on 2026-08-05

- **Severity**: major
- **Doc**: `docs/README.md` → "Pick your path" table
- **Claim (verbatim)**: *"The 'Current state' block at the end of working-rules is the live
  progress marker."*
- **Code truth**: `docs/working-rules.md` last changed 2026-08-05 (`b83c819`). Its closing block
  ends at v3 WP3 and says *"**Not done: WP4 (`library.json`) and WP5**"*. Everything in v4
  (control surface, MCP proxy, chat pane, capability guard) and v5 Phase 0–1 shipped after that
  date and is absent from it. A reader routed here by the index is told to trust the staler of the
  two documents.
- **Classification**: index_desync
- **Cheaper fix**: **change the doc** — remove the pointer. `docs/rulings-open.md` and
  `git log` are both more current, and the index already leads with `rulings-open.md`. Keeping two
  "live progress markers" guarantees one is wrong.
- **What this check did NOT establish**: whether the WP4/WP5 items named there (`library.json`,
  brand-repo scaffolding, private flag) were later built under other names. No `library.json` was
  found anywhere in the repo.

### DD-007 · `CLAUDE.md`'s gating paragraph: the line reference is exact, one clause is over-general, one is incomplete

Given its own section below — see **§ The gating claim, forensically**. Summarised here for the
count: **1 major FALSE** (the "hard denial, not a prompt" clause), **1 minor FALSE** (the "only
thing in the way is a banner" clause), **1 UNVERIFIABLE**.

### DD-008 · `docs/rulings-open.md` computes three of its rulings from 5 manifests; there are now 11

- **Severity**: major
- **Doc**: `docs/rulings-open.md` → R1, R4, R6
- **Claims (verbatim)**: R1 *"three of the five manifests on disk carry no `outcome` at all"*;
  R4 *"`reprimes: []` on all five manifests"*; R4 *"your longest run ever queued **15** prompts"*.
- **Code truth (first-party runtime state, read 2026-08-29)**: `~/Pictures/ImageDrip/*/*/manifest.json`
  now numbers **11**. Re-computed:
  - manifests with no `outcome` field: **3 of 11** (the count is unchanged; the denominator is not)
  - **re-primes fired, ever, across all 11: still 0** — R4's central finding *strengthens*
  - longest run: still 15 prompts (`2026-08-03-1446-smoothies`)
  - manifests with no `finishedAt`: **7 of 11**
- **Classification**: inventory_mismatch
- **Cheaper fix**: **change the doc** — restate the denominators, or state them as "as of
  2026-08-19" so the sheet ages honestly instead of silently.
- **What this check did NOT establish**: that the recomputed numbers will hold tomorrow. They were
  read once, today, on Roamy. `docs/rulings-open.md` R6 already flags that the M4 and Roamy
  disagree about `~/dev/image-projects/`; the same machine-dependence applies to every count here.

### DD-009 · `README.md`: "`npm run typecheck` — both tsconfig projects". There are three.

- **Severity**: minor
- **Doc**: `README.md` → "Built on"
- **Code truth**: `package.json` — `typecheck` runs `typecheck:node && typecheck:web &&
  typecheck:scripts`, against `tsconfig.node.json`, `tsconfig.web.json` and
  `tsconfig.scripts.json`. The third was added with the MCP proxy.
- **Classification**: inventory_mismatch
- **Cheaper fix**: **change the doc — delete the parenthetical.** The command is right; the count
  beside it is derivable and can only drift again.
- **What this check did NOT establish**: that `npm run typecheck` passes. It was not run.

### DD-010 · `docs/user-guide.md` is the "only doc an operator needs" and does not mention Template, the control surface, or the chat pane

- **Severity**: major
- **Doc**: `docs/user-guide.md` → frontmatter and body; `docs/README.md` → "For users"
- **Claim (verbatim)**: frontmatter `status: current as of v2 WP1–WP5 (usability slice)`,
  `last_updated: 2026-07-29`; index: *"**The only doc an operator needs.**"*
- **Code truth**: Template is a first-class axis with its own card (`src/renderer/src/App.tsx:1724`,
  `CardHeading step={2} title="TEMPLATE"`) and five verbs; the guide's "three things ImageDrip
  works with" predates it. The Context｜Chat tab (`App.tsx:416`) and the 34-verb surface are
  likewise absent.
- **Classification**: coverage_gap (the frontmatter is honest; the index's claim is not)
- **Cheaper fix**: **change the doc** — but the honest minimal edit is to `docs/README.md`: drop
  "the only doc an operator needs" until the guide catches up. Rewriting the guide is real work;
  removing a false promise about it is one line.
- **What this check did NOT establish**: whether an operator actually needs the Template card
  explained. The guide's own frontmatter declares its scope correctly — it is the *index* that
  oversells it.

### DD-011 · A safety comment in `chat-session.ts` contradicts the code beside it

- **Severity**: major
- **Doc**: source comment, `src/main/chat-session.ts:247`
- **Claim (verbatim)**: *"Every gated verb, named. The allow-list above already omits them; this
  says so twice, because 'AC-5 holds' should not rest on one list being complete."* — describing
  the `extraDisallowed: deny` field.
- **Code truth**: `deny` is built at `src/main/chat-session.ts:166-175`, which pushes a verb only
  when `isPaneDenied(verb)` is true. `PANE_DENIED_VERBS` has **one** entry — `repo.attach`
  (`src/main/verb-policy.ts:267`). `GATED_VERBS` has **nine** (`verb-policy.ts:206-223`). So
  `deny` carries 1, not 9, and the allow-list deliberately *includes* the other eight — which the
  block comment 90 lines earlier (`chat-session.ts:155-165`) explains correctly and at length.
  Two comments about the same list disagree; the later one is wrong.
- **Classification**: behavior_mismatch
- **Cheaper fix**: **change the doc (the comment)** — the code is right and the *design* is right;
  gated verbs are meant to reach the pane so the human gate can fire. The comment is a leftover
  from before the gate existed. No test pins `toolPolicy()`'s output — `test/chat-session.test.ts`
  contains no reference to `extraDisallowed`, `toolPolicy` or `deny`.
- **What this check did NOT establish**: that the pane's tool surface is actually bounded at
  runtime. It establishes what the flags say. Whether the spawned CLI honours
  `mcpTools`/`extraDisallowed` was not exercised, and nothing in `test/` exercises it.

### DD-012 · `README.md` and `docs/user-guide.md` price the alternative at "roughly $0.06 an image"

- **Severity**: info (the number is defensible; it is the *framing* that is now load-bearing)
- **Doc**: `README.md` → "Why it exists"; `docs/user-guide.md` → "What ImageDrip is"
- **Claim (verbatim)**: *"Paid image APIs run about $0.06 an image."*
- **Code truth**: no code claim. Checked against vendor sources instead — Google's own pricing
  page lists Gemini 3.1 Flash Image at **$0.067 per 1K image** and Gemini 2.5 Flash Image at
  **$0.039 per image** ($0.0195 batch); David's `~/dev/ad/brains/kie-ai/` records kie.ai's
  `nano-banana-2` at **~$0.040 (1K) / $0.060 (2K)**. So $0.06 is a fair 2026 mid-point, and
  *cheaper* options now exist than when it was written.
- **Classification**: version_stale
- **Cheaper fix**: **change the doc**, but not yet — this sentence is the stated rationale for the
  entire architecture, and Part 3 proposes reversing it. Rule on Part 3 first; this line is
  downstream of that decision, not independent of it.
- **What this check did NOT establish**: kie.ai's current list price directly. `kie.ai/billing`
  and `kie.ai/nano-banana-2` both returned **HTTP 403** to an automated fetch. The figures above
  come from David's own brain (dated 2026-03-01, five months old) corroborated only by a search
  result rendering kie.ai's own page title as *"Nano Banana 2 API — Gemini 3.1 Flash 4K Image from
  $0.04"*. **Treat kie.ai pricing in this audit as unconfirmed.** Google's figures are from
  Google's primary docs and are solid.

### DD-013 · `docs/north-star.md`: "It costs nothing per image" is the founding constraint, and Part 3 proposes reversing it

- **Severity**: major
- **Doc**: `docs/north-star.md` → "What this means in practice" and "What this is NOT"
- **Claim (verbatim)**: *"**It costs nothing per image.** ChatGPT's own UI is the engine… This has
  been the founding constraint since the first commit, 2026-07-19."* and *"Not a paid-API image
  pipeline — that path exists elsewhere (kie.ai / Nano Banana for FliThumb)."*
- **Code truth**: TRUE as of today — nothing in `src/` makes a paid API call; the only network
  egress on the image path is `session.fetch(imageUrl)` inside the logged-in ChatGPT session
  (`src/main/image-harvest.ts:37`).
- **Classification**: not drift — flagged because Part 3 makes it drift
- **Cheaper fix**: **neither, yet.** This is the one place in the corpus where the doc is right
  and the *plan* is what changes. Per the doc-drift rule, never edit a doc to match a bug or a
  proposal: if David rules for the provider move, `north-star.md` needs **re-ratification by him**,
  not a patch by an agent. It is an interviewed document — its own frontmatter says *"INTERVIEWED
  from David, not derived… The code is a stale snapshot of intent, the human is not."*
- **What this check did NOT establish**: whether David considers the no-cost constraint negotiable.
  This audit did not ask. The brief in Part 3 treats it as an open question for him, not a settled
  one.

### DD-014 · `docs/imagedrip-plan.md` is labelled canonical and `status: canonical — v1 shipped`

- **Severity**: minor
- **Doc**: `docs/imagedrip-plan.md` → frontmatter; `docs/README.md` calls it "**The Northstar**"
- **Code truth**: the actual North Star is `docs/north-star.md` (`d4ded7d`, 2026-08-08), whose
  frontmatter explicitly supersedes the derived one: *"A first pass derived from 54 commits and
  the docs produced a different and wrong Star; he corrected it."* `docs/README.md` calls
  `imagedrip-plan.md` "the Northstar" in two places and lists `north-star.md` in none of its
  tables — it appears only via `CLAUDE.md`.
- **Classification**: index_desync
- **Cheaper fix**: **change the doc** — `docs/README.md` should route "why does this exist" to
  `north-star.md` and demote `imagedrip-plan.md` to "the v1 architecture and risk case, historical".
- **What this check did NOT establish**: whether `imagedrip-plan.md`'s architecture sections are
  themselves stale. They were not audited claim-by-claim; only its *standing* was.

### DD-015 · `probe/README.md` documents a re-pinning procedure whose last use predates the current selectors

- **Severity**: minor
- **Doc**: `probe/README.md`; `README.md` → "Expect maintenance"
- **Claim (verbatim)**: *"`npx electron probe/probe-c.cjs` re-pins it against the live page. That's
  expected upkeep, not a defect."*
- **Code truth**: `probe/probe-c.cjs` exists and is executable. `src/main/chatgpt-selectors.ts` was
  last changed 2026-08-07 (`9f49732`) — 22 days ago. `probe/probe-c.log` is dated 2026-07-19.
- **Classification**: not drift — the tooling requirement is real and correct (doc-drift category 4)
- **Cheaper fix**: none needed. **Protect this text.**
- **What this check did NOT establish** — and this is the important one: **whether the pinned
  selectors still match live ChatGPT.** They cannot be checked from source. Worse, the app cannot
  check either: `src/main/engine-readiness.ts:49-50` defines `indeterminate` as *"Probe timed out,
  page still loading, **or the selectors no longer match**"* — the code itself records that a
  rotted selector and a slow page are the same observation. See Part 3.

### DD-016 · `docs/specs/webview-harness-spec.md` `status: implemented — driver live-verified via Probe C (2026-07-19)`

- **Severity**: info
- **Classification**: date_stale
- **Code truth**: the spec is accurate against `src/main/webview-harness.ts` — this pass found no
  divergence between the described mechanism and the code. The *verification* claim is what has
  aged: it is 41 days old and pins to a probe run against a page that has since changed at least
  once (`9f49732` re-touched the selectors).
- **Cheaper fix**: **change the doc** — date-stamp the verification claim as historical rather than
  standing.
- **What this check did NOT establish**: the same limit as DD-015 — "live-verified" is a claim
  about ChatGPT, and no amount of source reading can confirm or refute it.

### DD-017 · Five published verbs — including all three destructive deletes — are reachable by agents but NOT by a human at the window

- **Severity**: **critical**
- **Doc**: `CLAUDE.md` → the gating paragraph; `docs/north-star.md` → the parity rule
- **Claims (verbatim)**: `CLAUDE.md`: *"A human clicking in the UI is not gated (they have already
  confirmed)."* `north-star.md`: *"**Parity: every automated step is operable by hand, and every
  manual step is automatable.** Ruled by David, 2026-08-10."*
- **Code truth**: the renderer can only reach a channel that `src/preload/index.ts` bridges. Of the
  34 published verbs, **five are not bridged and are not declared in the preload API type**:

  | Verb | Gated? | Who can call it |
  |---|---|---|
  | `brand.delete` | **GATED** | pane-agent, api-agent. **Not the human** |
  | `template.delete` | **GATED** | pane-agent, api-agent. **Not the human** |
  | `project.delete` | **GATED** | pane-agent, api-agent. **Not the human** |
  | `theme.rename` | – | pane-agent, api-agent. **Not the human** |
  | `context.get` | – | pane-agent, api-agent. **Not the human** |

  Confirmed two ways: `src/preload/index.ts` bridges 49 `IPC.*` constants and none of these five;
  and `grep -ni "delete\|forget" src/renderer/src/App.tsx` returns **no delete affordance anywhere
  in the UI** — only `window.removeEventListener` and prose. (`run.status` is also unbridged, but
  legitimately: the renderer consumes the `run:status-push` channel instead.)
- **Classification**: behavior_mismatch
- **Cheaper fix**: **change the code** — one of only two findings in this audit that points at code
  rather than prose. The parity rule is David's own ruling and it is unambiguous; three automated,
  destructive steps that a human cannot perform by hand violate it directly. The doc alternative —
  writing down that deletes are agent-only — would be recording a defect as a design.
- **Why this compounds the gating story**: `brand.delete`, `template.delete` and `project.delete`
  are in `GATED_VERBS` (`verb-policy.ts:216-218`), so the pane raises a confirm for them. But an
  **`api-agent` — MCP, Codex, or curl — returns at `capability-guard.ts:217` and gets no confirm at
  all.** So for these three verbs the effective policy is: *a terminal agent may silently delete a
  project and its entire prompt queue; the person who owns it cannot delete it from the app.*
  `project.delete`'s own description says it *"forgets a project **AND its prompt queue**… there is
  no undo inside the app"* (`verb-policy.ts:336`).
- **What this check did NOT establish**: whether this is deliberate. No doc, commit message or code
  comment found in this pass explains it, and `git log` does not record a decision to withhold
  deletes from the UI — which is consistent with an oversight but does not prove one. It also does
  not establish that the deletes are *reachable* in practice for an api-agent; the verbs are
  published and unguarded past the token, but this audit did not call them.

### DD-018 · `docs/README.md`'s "Every document" section lists 14 of the 46 documents that exist

- **Severity**: major
- **Doc**: `docs/README.md` → §"Every document"
- **Claim**: the heading itself — *"## Every document"*
- **Code truth**: `find docs -name "*.md"` returns **46**. `docs/README.md` links **14** distinct
  `.md` paths in total, across all its tables. **Every path it names resolves — there are zero dead
  links.** The failure is one-directional: present-but-unlisted. Notable omissions include
  `north-star.md` (which `CLAUDE.md` treats as the ratifying document), `rulings-open.md`'s
  siblings `research-imagedrip-architecture.md` and `review-2026-08-19-what-comes-next.md`, all of
  `requirements-v4`, `v5`, `v5.1`, all four `spec-*.md`, `plan-imagedrip-control-surface.md`,
  `wp4-chat-pane-research.md`, `ui-design-notes-jan.md`, `phase-0-checks/README.md`, and both
  2026-08 handovers.
- **Classification**: index_desync
- **Cheaper fix**: **change the doc** — but the honest edit is to the *heading*, not the table.
  Enumerating 46 documents by hand guarantees this finding recurs. Rename it "The documents worth
  reading" and the index stops making a promise it cannot keep.
- **What this check did NOT establish**: whether the 32 unlisted docs *should* be listed. Several
  are explicitly historical or superseded. The heading claims completeness either way, which is
  what makes it false.

### DD-019 · `overview.html` is called "the clickable index of everything"; it links 13 of ~48 files and stops at 2026-08-07

- **Severity**: major
- **Doc**: `docs/working-rules.md:39` — *"**Index:** `overview.html` (repo root) — the clickable
  index of everything."* Also `docs/README.md` → §Design artifacts: *"Clickable index of every doc
  and design mockup."*
- **Code truth**: `overview.html` contains **16 local `href`s**, of which 13 are markdown documents.
  It is missing `docs/north-star.md`, `docs/rulings-open.md`, `docs/two-clocks.md`,
  `docs/live-uat.md`, every `requirements-v3/v4/v5*`, every `spec-*`, and the whole of `docs/kdd/`.
  Its newest entry is `docs/handover-2026-08-07-product-fixes.md`.
- **Classification**: index_desync
- **Cheaper fix**: **change the file, not the claim** — and this is the one place in the audit where
  I would not delete. `docs/working-rules.md` rule 3 is a standing instruction from David:
  *"**Keep a real, clickable index.** One page listing every design, doc, and spec, with links that
  work."* Demoting the claim to match the file would quietly overturn a standing rule; regenerating
  the page honours it. That said, a hand-maintained index of 48 files is a machine's job — this is
  the third index in this audit to drift the same way (see DD-005, DD-018).
- **What this check did NOT establish**: whether `overview.html` renders correctly. Its source was
  read; it was not served. `docs/README.md` notes it needs a local HTTP server.

### DD-020 · `appydave:imagedrip` (the skill, outside this repo) tells agents `scripts/idrip` is "in the app repo"

- **Severity**: minor · **out of the repo's own doc tree, in scope because it is a doc about this repo**
- **Doc**: `~/dev/ad/appydave-plugins/appydave/skills/imagedrip/SKILL.md`
- **Claim (verbatim)**: *"**2. HTTP driver (fallback…).** `scripts/idrip` POSTs to
  `http://127.0.0.1:<port>/v1/call/<verb>`"*, in a section that opens by locating
  `scripts/imagedrip-mcp.mjs` "in the app repo".
- **Code truth**: `~/dev/ad/apps/imagedrip/scripts/` contains exactly three files —
  `chat-probe.mjs`, `dev-stop.mjs`, `imagedrip-mcp.mjs`. There is no `idrip` and no `harvest`.
  They live in the **skill's** own directory,
  `~/dev/ad/appydave-plugins/appydave/skills/imagedrip/scripts/`.
- **Classification**: stale_reference
- **Cheaper fix**: **change the skill** — make the path absolute or say "in this skill's
  `scripts/`". An agent that `cd`s into the app repo and runs `scripts/idrip state` gets
  "no such file", which reads as a broken app rather than a wrong instruction.
- **What this check did NOT establish**: whether the skill's `idrip` works. It was not run.

---

### DD-021 · The PR template's safety guidance describes the architecture as it was before 2026-08-11

- **Severity**: **critical**
- **Doc**: `.github/PULL_REQUEST_TEMPLATE.md:77-81` → "Safety review"
- **Claim (verbatim)**: *"**Today**, for the engine gate, the D1 human gate and
  `PANE_DENIED_VERBS`, the answer is **no** — they live inside the adapter. That is sound only
  while there is exactly one non-UI adapter. The second adapter is where it breaks, and it breaks
  silently."*
- **Code truth**: **the refactor the template warns must happen has already happened**, and the
  template is the last place still saying otherwise. `src/main/capability-guard.ts:1-30` — the
  file's own header: *"The capability guard — authorization, **beneath every adapter**… Until
  2026-08-11 three checks lived INSIDE `control-surface.ts`… So the checks move here, and both
  adapters call in."* `src/main/control-surface.ts:273`: `// ── Authorization — NOT here ──`.
  The move is commit `3f274d3`, *"authorization moves beneath the adapters — and closes a live
  hole"*, 2026-08-11 — **18 days before this audit**.
- **Classification**: stale_reference
- **Cheaper fix**: **change the doc.** The code is already in the state the template demands.
- **Why this is critical rather than major**: this is not a reference doc, it is **a checklist a
  human follows while reviewing a PR**. It currently teaches a reviewer that adapter-level
  authorization is the status quo — so a PR that puts a new check inside `control-surface.ts`
  would read as *consistent with the template* and pass review. A stale README misinforms; a stale
  checklist actively approves the defect it was written to prevent.
- **What this check did NOT establish**: whether *every* check now sits beneath the adapter. The
  engine gate (`capability-guard.ts:178`), the D1 gate (`:217-263`) and `PANE_DENIED_VERBS`
  (`:201-211`) were confirmed there. `control-surface.ts` was not enumerated line by line to prove
  no check remains in it.

### DD-022 · The PR template names two verbs as "catalogued, gated" that are neither — and reports its own adopted fix as an outstanding wart

- **Severity**: **critical**
- **Doc**: `.github/PULL_REQUEST_TEMPLATE.md:44-48` → "The physical-location rule"
- **Claim (verbatim)**: *"ImageDrip already has two of these — `project.choose-output-dir` and
  `repo.choose-root` both call `dialog.showOpenDialog`. They are **catalogued, gated**, and cannot
  succeed headlessly. Their descriptions say so, which is honest and is still the wrong resolution:
  **don't warn about it, don't catalogue it.** Do not add a third."*
- **Code truth**: both are in `NEVER_EXPOSED` — `src/main/verb-policy.ts:176-177` — so they are
  **not catalogued at all**, and neither appears in `GATED_VERBS` (`:206-223`), so neither is
  gated. `verb-policy.ts:150-177` documents the change in full and reaches the template's own
  conclusion verbatim: *"**The rule is not 'warn about it' — it is 'do not catalogue it.'**"*
- **Classification**: inventory_mismatch
- **Cheaper fix**: **change the doc** — and rewrite it as a *resolved precedent* rather than a live
  complaint. "We hit this, here is what we did" is stronger guidance for a reviewer than "we still
  have this problem", and it is also what is true.
- **What this check did NOT establish**: whether a third dialog-bound verb has since been added.
  Only these two names were checked.

### DD-023 · v4's AC-5 states a confirmation guarantee that holds for one client out of three

- **Severity**: **critical**
- **Doc**: `docs/requirements-v4-resident-chat.md:308` → §7 acceptance criteria; reinforced at
  `:262` (§6.2) and `:318` (§8)
- **Claims (verbatim)**: AC-5: *"**The run gate.** 'Start the run' must ask before feeding the live
  session, **every time**."* §6.2: `run.start` — *"Begins feeding a live ChatGPT session.
  **Never auto-run.**"* §8: *"**No autonomous runs.** The chat proposes; David disposes. **AC-5 is
  the mechanism.**"*
- **Code truth**: `src/main/capability-guard.ts:217` — `if (principal.kind !== 'pane-agent')
  return;`. The confirm is raised **only** for the in-app chat pane. A terminal Claude Code session
  through `.mcp.json`, Codex through `.codex/config.toml`, or plain `curl` starts a run with **no
  confirmation**; past the loopback bearer token and the engine precondition, the only thing in the
  way is advisory banner text in the verb description. The code says so deliberately at `:213-216`.
- **Classification**: behavior_mismatch
- **The honest verdict, because this one is genuinely ambiguous**: **FALSE as written; TRUE if read
  as scoped to the pane.** v4 is the *resident chat* requirements document, so "the chat proposes;
  David disposes" plausibly means the pane and only the pane — and for the pane the guarantee does
  hold exactly. But AC-5 says *"every time"* and §6.2 says *"Never auto-run"* as properties of the
  **verb**, with no client qualifier anywhere. A reader asking "is `run.start` safe against
  autonomous invocation?" and checking AC-5 gets *yes*, universally. **That is the wrong answer.**
- **Cheaper fix**: **change the doc** — add the client scope to AC-5 and §6.2. `CLAUDE.md` already
  carries the corrected version of exactly this fact (see § below), which means the repo currently
  holds an accurate statement and an inaccurate one about the same guard, and the inaccurate one is
  in the requirements document of record.
- **What this check did NOT establish**: whether v4's authors intended the narrow reading. §8's
  framing suggests they did; the wording of AC-5 does not carry it. Nobody was asked.

### DD-024 · `requirements-v3` contradicts itself within eleven lines, and all three of its built work packages shipped

- **Severity**: major
- **Doc**: `docs/requirements-v3-templates-and-repos.md` → frontmatter and line 11
- **Claims (verbatim)**: frontmatter — `status: approved — WP1–WP3 ready to build; WP4–WP5
  follow-on`. Body line 11 — *"**Status:** proposed. Nothing here is built."* **The document says
  two different things about itself before its first heading.**
- **Code truth**: WP1–WP3 all shipped. WP1: `src/shared/domain.ts:90` (`export interface
  Template`), `:289` (`compose(brand, template, project)`). WP2: `src/main/repo-store.ts` and
  `src/main/domain-store.ts` (`sourcePath` read/write). WP3: `src/main/git-scope.ts:23`
  (`isInsideWorkTree`), called at `src/main/index.ts:370`. Only WP4 and WP5 remain, and the code
  says so itself — `repo-store.ts:30` *"`library.json` ← WP4, not yet"* and `:356` *"repo is WP5's
  decision"*.
- **A third place repeats it**: `docs/README.md` describes v3 as *"**Proposed, not started.**"*
  So the repo asserts in three places that Template is unbuilt, while Template is a first-class
  axis with its own UI card (`App.tsx:1724`), five verbs, and `promptShape` — the feature Part 2
  scores as the clearest "widens what a run can express" in the product.
- **Classification**: behavior_mismatch / version_stale
- **Cheaper fix**: **change the doc** — one frontmatter line and one body line, plus the
  `docs/README.md` row. The frontmatter is already closer to right than the body.
- **What this check did NOT establish**: whether WP2 has ever round-tripped a real brand repo.
  `~/dev/image-projects/` **does not exist on this machine** — which `docs/rulings-open.md` R6
  already flags as an M4-vs-Roamy split. The code exists; its exercise against a real repo is
  unverified here.

### DD-025 · `requirements-v4` says of itself "nothing built, nothing decided" — and it is the document carrying AC-5

- **Severity**: **critical**
- **Doc**: `docs/requirements-v4-resident-chat.md` → frontmatter and line 11
- **Claims (verbatim)**: `status: PROPOSED — nothing built, nothing decided. Draft for David's
  review.` · body: *"**Status:** proposed. Nothing here is built."* · frontmatter
  `predecessor: requirements-v3-templates-and-repos.md (**also proposed, also unbuilt**)` — a stale
  claim about a second document, inside the first.
- **Code truth**: the whole of v4 shipped. The control surface — `src/main/control-surface.ts`
  (loopback `:47`, `control.json` `:66`, `randomBytes(32)` `:389`, `0o600` `:377`, the 404/422/409/500
  split `:261`/`:269`/`:306`/`:394`). The MCP proxy — `scripts/imagedrip-mcp.mjs`, wired in both
  `.mcp.json` and `.codex/config.toml`. The contained CLI — `src/main/claude-cli.ts`,
  `claude-stream.ts`, `npm run chat:probe`. The Context｜Chat tab — `src/renderer/src/store.ts` and
  `App.tsx:416`. The human gate — `src/main/chat-gate.ts`, with `test/chat-gate.test.ts` (14 tests).
- **Classification**: behavior_mismatch
- **Cheaper fix**: **change the doc** — two lines.
- **Why this is critical and DD-024 is only major**: **this is the document that carries AC-5**
  (DD-023). A requirements document whose own status field says *"nothing decided"* is
  simultaneously the stated source of the confirmation guarantee that §8 calls *"the mechanism"*
  for no autonomous runs. Either the document is a draft and AC-5 binds nothing, or it is the
  record and AC-5 needs its client scope. It cannot be both, and today it claims to be the first
  while being used as the second.
- **What this check did NOT establish**: whether every v4 work package shipped, or only WP1–WP5.
  Five were traced to code; the document's later sections were not enumerated.

### DD-026 · A second spec written today also shipped carrying "Nothing built" — so DD-001 is a pattern, not an incident

- **Severity**: **critical**
- **Doc**: `docs/spec-control-surface-ui-staleness.md` → frontmatter
- **Claim (verbatim)**: `status: OPEN — defect report + proposed fix. Nothing built.`,
  `created: 2026-08-29`
- **Code truth**: fixed the same day in commit `6f7993a` *"fix: the window now hears about writes
  it did not make"* — `IPC.domainChanged` declared at `src/shared/ipc.ts:48`, emitted at
  `src/main/index.ts:145`, bridged at `src/preload/index.ts:50-51`, consumed in
  `src/renderer/src/store.ts`, and covered by `test/domain-push-channel.test.ts` (5 tests, passing).
- **Classification**: behavior_mismatch / date_stale
- **Cheaper fix**: **change the doc** — one line.
- **Why this changes the audit's conclusion**: DD-001 found one spec written and implemented on
  2026-08-29 that still says *"Nothing built."* **This is the second, on the same day.** Two of the
  four specs dated today carry a false status banner, and both were falsified by the commit that
  implemented them. That is no longer a slip — it is what this repo's spec workflow currently does
  by default, and it is the strongest evidence for the structural recommendation in the Summary.
- **What this check did NOT establish**: whether the *proposed fix* in the spec is the fix that
  shipped. The channel exists and is tested; whether it resolves the staleness the spec describes
  was not exercised in the running app.

> **These three are the answer to "find any other doc claim of the same shape."** All three are
> safety claims, all three overstate a guarantee, and two of them sit in a checklist a human is
> meant to *act on* rather than read. Note the pattern: `CLAUDE.md` was corrected (commit `00c96b4`)
> and the documents around it were not, so the corpus now disagrees with itself about the same
> guard — which is worse than being uniformly wrong, because one of the two is right and a reader
> cannot tell which without reading `capability-guard.ts`.

---

## The gating claim, forensically

`CLAUDE.md` was singled out for verification. Its paragraph, verbatim:

> **But "gated" means less than it sounds, and the difference matters.** The confirm is raised for
> the **in-app chat pane only** — where it is a hard denial, not a prompt. A human clicking in the
> UI is not gated (they have already confirmed), and **every other agent client — a terminal Claude
> Code session through `.mcp.json`, Codex through `.codex/config.toml`, or plain `curl` — gets no
> confirmation at all.** For those callers the only thing in the way is a CONFIRM-FIRST banner in
> the tool description, which is advisory text. This is true of every gated verb, `run.start`
> included. See `src/main/capability-guard.ts:217`.

Clause by clause, against `src/main/capability-guard.ts` read in full:

| # | Clause | Verdict | Proof |
|---|---|---|---|
| 1 | The line reference `capability-guard.ts:217` | **TRUE — exact** | Line 217 is literally `if (principal.kind !== 'pane-agent') return;` |
| 2 | "The confirm is raised for the in-app chat pane only" | **TRUE** | Line 217 returns before the confirm for every non-pane principal. The three principals are declared at `:67-73` |
| 3 | "where it is a hard denial, not a prompt" | **FALSE — over-general** | See below |
| 4 | "A human clicking in the UI is not gated" | **TRUE, but incomplete** | Line 195 `if (!isAgent) return;` — the human skips exposure, pane-deny and confirm. It does **not** skip the engine precondition at `:178`, which is enforced for *"EVERY principal"* (`:174`). "Not gated" ≠ "unguarded" |
| 5 | ".mcp.json / .codex/config.toml / curl get no confirmation at all" | **TRUE** | All three arrive as `api-agent` (`src/main/control-surface.ts:288`) and return at 217. `.mcp.json` and `.codex/config.toml` both launch the same `scripts/imagedrip-mcp.mjs`, confirmed in both files |
| 6 | "the only thing in the way is a CONFIRM-FIRST banner… advisory text" | **FALSE for `run.start`; TRUE for `repo.attach`** | See below |
| 7 | "This is true of every gated verb, `run.start` included" | **TRUE of clause 5; FALSE if read onto clause 3** | The sentence's antecedent is ambiguous, and one reading is wrong |

**Clause 3 is wrong.** A hard denial is raised at `capability-guard.ts:201-211`, and only for verbs
in `PANE_DENIED_VERBS` — which has exactly **one** member, `repo.attach`
(`verb-policy.ts:267`). For the other **eight** gated verbs (`run.start`, `run.stop`, `run.pause`,
`run.resume`, `domain.reset-run`, `brand.delete`, `template.delete`, `project.delete`) the pane
gets a **real prompt** with three outcomes — `accept` / `decline` / `cancel`
(`capability-guard.ts:224-263`). So the confirm is a hard denial for 1 of 9 gated verbs and a
prompt for 8 of 9. Placed immediately before "This is true of every gated verb, `run.start`
included", clause 3 reads as universal, and as read it is false for 89% of the set.

**Clause 6 is incomplete for `run.start`.** Two further things stand in the way of an
`api-agent` calling it, and neither is advisory:

- **A bearer token.** Every route but `/v1/health` requires it (`control-surface.ts:32`, `:325`),
  compared in constant time (`:132`), minted fresh with `randomBytes(32)` on each listen (`:389`),
  and bound to `127.0.0.1` (`:47`, `:406`). A caller that cannot read `control.json` in the app's
  `userData` cannot call anything.
- **The engine precondition.** `run.start` and `run.resume` are in `ENGINE_REQUIRED_VERBS`
  (`verb-policy.ts:199`) and are refused `409` for **every** principal at `capability-guard.ts:178-191`
  — including when no probe is wired at all, which is treated as UNKNOWN and refused
  (`:117-122`, `:180`). This is a real, enforced, non-advisory block.

For `repo.attach`, clause 6 **is** accurate: it is not engine-required, so past the token there is
genuinely nothing but the banner. Since `repo.attach` is the verb the paragraph is warning about,
the sentence is right where it matters and wrong where it generalises.

**Recommended correction (change the doc — one sentence, no code change):**

> The confirm is raised for the **in-app chat pane only**. There it is a *prompt* for the eight
> gated verbs and a *hard denial* for `repo.attach` alone — the one verb a yes/no confirm cannot
> honestly describe. A human clicking in the UI meets no confirm (they have already confirmed) but
> still meets the engine precondition. Every other agent client — `.mcp.json`, `.codex/config.toml`,
> plain `curl` — arrives as `api-agent` and gets no confirmation at all; past the loopback bearer
> token, the only thing in the way of `repo.attach` is an advisory CONFIRM-FIRST banner.
> `run.start` additionally requires a signed-in engine, for every caller.

**What this check did NOT establish.** It read the guard, the policy and the transport. It did not
call a gated verb from any client. In particular, it did not verify that `control-surface.ts`
actually routes an `.mcp.json` caller to `{kind:'api-agent'}` at runtime — only that line 288
constructs it that way, and that `test/control-surface-gate.test.ts` and
`test/capability-guard.test.ts` exist and pass. And it did not establish that the **pane** is
correctly identified: `isPane` turns on a second credential (`control-surface.ts:52-56`), and a
failure there would silently downgrade the pane to `api-agent`, removing its gate. Nothing logs a
principal downgrade, so that failure and normal operation would look identical.

### Other doc claims of the same shape

Searched for, and found: **one** (DD-011, `chat-session.ts:247`). Two more places make gating
claims and both check out —

- `CLAUDE.md`: *"`repo.attach` is **knowingly defective** — it publishes every unsourced project
  and template into whichever repo you point at, stamped with the active brand. Do not un-gate
  it."* **TRUE**, and load-bearing: `verb-policy.ts:247-267` and `verb-policy.ts:330-331` both
  carry the same reasoning, and `docs/working-rules.md`'s KNOWN GAP block names the mechanism in
  `src/main/domain-store.ts`. **Protect this text** — it is a category-3 pitfall that no reader
  derives from source.
- `verb-policy.ts:95-124`: the `chat.gate-decide` note (*"published for three days before anyone
  noticed"*). **TRUE** — the channel is in `NEVER_EXPOSED` at `:125`, and
  `test/verb-policy.test.ts` pins the published set, exactly as claimed. Praise.

---

## The UNVERIFIABLE register

Nine claims that no reading of this repository can settle. They are listed rather than scored,
because scoring them would manufacture confidence.

| # | Claim | Doc | Why it cannot be settled here |
|---|---|---|---|
| U1 | The pinned ChatGPT selectors still match the live page | `specs/webview-harness-spec.md`, `probe/README.md` | Requires a signed-in browser. The app's own `indeterminate` state conflates this with "page slow" (`engine-readiness.ts:49`) |
| U2 | "Driver live-verified via Probe C" still holds | `specs/webview-harness-spec.md` | A claim about 2026-07-19, restated in the present tense |
| U3 | The human-paced feed, rate-limit pause and STOP actually mitigate ToS risk | `README.md`, `docs/imagedrip-plan.md` §7 | The docs already call these *"mitigations, not guarantees"*. Nothing observable would distinguish a working mitigation from an unenforced one until an account is actioned |
| U4 | `uat.verdict` works | `docs/live-uat.md`, ADR-001 | No `verdicts.jsonl` exists. Never-called and called-but-failing are the same filesystem observation |
| U5 | The re-prime anti-drift mechanism works | `README.md`, `docs/README.md` diagram, `two-clocks.md` | **It has never fired.** 0 re-primes across 11 manifests; default `chunkSize` is 18 and the longest run ever queued 15. The mechanism has never been *reachable*, so there is no evidence either way. This is `rulings-open.md` R4's own finding, and it still stands |
| U6 | Style drift is real and the primer re-post fixes it | `two-clocks.md`, `imagedrip-plan.md` | Same as U5 — the fix has never executed. `docs/phase-0-checks/RUNBOOK.md` exists precisely to settle this and has not been run |
| U7 | The bearer-token + pane-credential split correctly distinguishes pane from api-agent at runtime | `CLAUDE.md`, `capability-guard.ts` header | A downgrade would be silent; nothing logs the principal on the success path (`capability-guard.ts:273` skips audit for non-gated OK calls) |
| U8 | Reference-image paste survives in live ChatGPT | `rulings-open.md` R5 | R5 says so itself: *"a stand-in that behaves as expected and a ChatGPT that does not are indistinguishable from here"* |
| U9 | The app works on any machine other than Roamy | `README.md` "Get started", `docs/user-guide.md` | `rulings-open.md` R6 already records the M4/Roamy split for `~/dev/image-projects/`. Every claim in this audit was checked on Roamy only |

---

## Load-bearing claims confirmed TRUE

Listed so a future pass does not re-litigate them.

| Claim | Doc | Proof |
|---|---|---|
| `packageManager` pinned to `npm@11.11.0`; pnpm 10+ blocks the postinstall that downloads Electron | `CLAUDE.md`, KDD learning | `package.json` `"packageManager": "npm@11.11.0"` and its `_packageManager_why` field. Category-4 tooling requirement — **protect** |
| `@appydave/core` is a local path dep needing a sibling checkout | `CLAUDE.md`, `README.md` | `package.json` `"file:../appydave-foundation/packages/core"`; the path resolves on this machine |
| `npm run dev` against a running app silently surrenders to the single-instance lock; use `dev:clean` | `CLAUDE.md` | `scripts/dev-stop.mjs`; `dev:clean` = `dev-stop && dev:watch`. Category-3 pitfall — **protect** |
| `repo.attach` is knowingly defective and must stay gated | `CLAUDE.md`, `working-rules.md` | `verb-policy.ts:247-267`, `:330-331` |
| `chat.gate-decide` was exposed for three days and is now denied + pinned by test | `verb-policy.ts:95-124` | `NEVER_EXPOSED` includes it; `test/verb-policy.test.ts` pins the set |
| `run.stop` / `run.pause` are deliberately NOT engine-gated | `verb-policy.ts:190-194` | `ENGINE_REQUIRED_VERBS = ['run.start','run.resume']` (`:199`) |
| Native file pickers are deliberately unpublished because they cannot work headlessly | `verb-policy.ts:150-177` | Both in `NEVER_EXPOSED` (`:176-177`) |
| Harvested images cannot be written outside the output root | `README.md` | `FileAuthor` refuses escaping `relPath`; `image-harvest.ts:12`, `test/file-author.test.ts` (10 tests) |
| The MCP proxy holds no policy; the two tool-name functions are pinned to agree | `verb-policy.ts:273-292` | `test/mcp-proxy.test.ts` |
| The stall budget and the cadence are two separate timers on two statistics | `two-clocks.md` | `src/main/stall-budget.ts`, `src/main/cadence.ts`, 16 + 9 tests. Category-1 hard-won lesson — **protect** |
| The KDD's seven learnings each still have their fix in place | `docs/kdd/learnings/*` | Spot-checked: UA override, `NEVER_EXPOSED` pickers, `Popover` (`App.tsx:608`, `:1289`), `packageManager` |

---

## Summary

**The corpus is DRIFTING, and the drift is almost entirely about status and inventory rather than
substance.** Seventeen false claims: **sixteen are cheaper to fix by changing the doc**, and of
those, **eight are cheapest to fix by deleting the sentence rather than correcting it** — every
count (DD-004 verbs, DD-005 learnings, DD-009 tsconfigs, DD-018's "Every document"), every "live
progress marker" pointer (DD-006), and the stale status banners a reader can get from `git log`
anyway.

**Three of the four indexes in this repo have drifted in exactly the same direction** — the KDD
index omits a learning (DD-005), the docs index lists 14 of 46 documents (DD-018), and
`overview.html` links 13 of ~48 (DD-019). None of them has a dead link; all of them are missing
entries. **Hand-maintained completeness claims are the single most reliable drift generator in this
corpus**, and they will keep generating findings until they are either machine-generated or stop
claiming completeness.

**The safety claims are the worst-drifted class in the corpus, and that inverts the usual
assumption.** Four of the seven critical findings are safety claims that overstate a guarantee
(DD-017, DD-021, DD-022, DD-023) — and **two of them sit in `.github/PULL_REQUEST_TEMPLATE.md`, a
checklist a human follows while approving a change.** A stale reference doc misinforms a reader; a
stale checklist approves the very defect it exists to catch. The template currently tells a
reviewer that authorization *"lives inside the adapter"*, 18 days after commit `3f274d3` moved it
beneath every adapter, and flags an already-adopted fix as an outstanding wart.

**Worse than being wrong: the corpus states the same guard three times and gets it right twice.**

| Doc | Says | Verdict |
|---|---|---|
| `CLAUDE.md` | the confirm is raised "for the in-app chat pane only" | **right** (corrected in `00c96b4`) |
| `docs/requirements-v5-unattended-and-portable.md:109` | *"D1 makes `run.start` human-approved **from the pane**. From any other client it stays advisory — an autonomous agent on the control surface can still start a run without a human. That is D1 as decided… recorded here as a known residual, not reopened."* | **right, and the best-written of the three** |
| `docs/requirements-v4-resident-chat.md:308` (AC-5) | *"must ask before feeding the live session, **every time**"* | **wrong** |

Two correct, one wrong — **and the wrong one is the acceptance criterion**, which is precisely the
line someone checks to verify the guarantee. A reader cannot tell which is authoritative without
opening `capability-guard.ts`. **When a fact is corrected in one document, the documents that
repeat it need finding.** v5 §1.4 shows the project already knows how to write this fact honestly,
including naming the residual risk rather than hiding it; v4 §7 simply never got the amendment.

**One finding points at code, and it is the most serious in the audit.** DD-017: `brand.delete`,
`template.delete`, `project.delete` and `theme.rename` are reachable by a terminal agent over
loopback — with **no confirmation** for an `api-agent` — and are not reachable by the human at the
window at all. That contradicts `CLAUDE.md`'s gating paragraph and violates David's own parity
ruling of 2026-08-10. **It should be ruled on independently of the provider decision**, since it is
about who may destroy work, not about how images are made.

**The mechanism docs are good and should be protected.** `two-clocks.md`, the seven KDD learnings,
the `verb-policy.ts` and `capability-guard.ts` headers, and the `repo.attach` warnings are all
category 1–4 content — hard-won lessons, rationale, pitfalls and tooling requirements — and all of
them verified TRUE. This repo's problem is not that it documents badly. It is that **every document
carries a status field, and nothing updates them.**

**The one structural recommendation.** `status:` frontmatter is a promise that rots, and this
corpus now has 43 of them. DD-001 shows the failure at its purest: a spec was written, implemented,
tested and committed in a single commit, and shipped saying *"Nothing built."* A convention that
requires a human to remember to flip a field will keep producing DD-001s. Either derive status from
`git log` (a spec whose named source files changed after it was written is not "OPEN"), or drop the
field from specs and let the commit history answer. **This is a suggestion, not a finding — it is
process, and process is David's call.**

**Handoffs, per the doc-drift boundary.** `README.md` needs regeneration, not patching — that
belongs to `appydave:craft-readme`. `docs/README.md`'s internal contradictions (two Northstars, two
progress markers) are navigation quality, which is `appydave:doc-review`, not this skill.

**Nothing in this document has been applied.** No doc was edited, no line deleted, no status flipped.

---

## What was fixed

Applied 2026-08-29, second pass, on David's instruction to update the documentation. **No source
code was changed.**

### Corrected

| Finding | Doc | What changed |
|---|---|---|
| DD-001 | `spec-stall-budget-visibility.md` | `Nothing built` → shipped in `c2c2624`, with the files named |
| DD-026 | `spec-control-surface-ui-staleness.md` | `Nothing built` → shipped in `6f7993a`, with the wiring named |
| DD-002 | `live-uat.md` | `not yet built` → built 2026-08-03, with the modules and verbs named |
| DD-024 | `requirements-v3-templates-and-repos.md` | Frontmatter **and** the contradicting body line → WP1–WP3 shipped, WP4–WP5 not, each anchored |
| DD-025 | `requirements-v4-resident-chat.md` | `PROPOSED — nothing built, nothing decided` → SHIPPED, with a pointer to the two amendments inside it |
| DD-023 | `requirements-v4` §7 AC-5 | Now reads *"from the in-app chat pane"*, with an amendment block naming the residual: an agent on the control surface can start a run with no human. Matches how `requirements-v5:109` already states it |
| DD-023 | `requirements-v4` §6.2 | `Never auto-run` scoped to the pane. Also corrected the row naming `project.set_output_dir` / `project:choose-output-dir` — neither exists; the capability shipped as `domain.save-project`. Added a note that the three shipped destructive verbs are unreachable from the UI (DD-017) |
| DD-021 | `.github/PULL_REQUEST_TEMPLATE.md` | The authorization test now says the answer **is** yes and must stay yes, names `capability-guard.ts` and `3f274d3`, and reframes the checkbox as a regression check |
| DD-022 | `.github/PULL_REQUEST_TEMPLATE.md` | The two picker verbs are recorded as a **settled precedent** (`NEVER_EXPOSED`, `verb-policy.ts:176-177`) rather than an outstanding wart, and it says what replaced them |
| DD-007 | `CLAUDE.md` | The gating paragraph rewritten: prompt for eight verbs, hard denial for `repo.attach` alone, the human still meets the engine precondition, and the token + engine gate named alongside the advisory banner |
| DD-017 | `CLAUDE.md` | **Added** — the agent-only deletes are now written down as an open, unruled gap rather than being absent |
| DD-003 | `README.md` | The Status block replaced: v2/v3/v4/v5-Phase-0-1 shipped, current work is decisions, and the provider review is flagged |
| DD-009 | `README.md` | "both tsconfig projects" → "every tsconfig project" (the number deleted, not corrected) |
| DD-004 | `docs/README.md` | "33 verbs on loopback" → the number **deleted**; `/v1/verbs` answers it correctly forever |
| DD-005 | `docs/README.md` + `kdd/README.md` | "Four learnings" → number deleted; the missing seventh learning added to the KDD index |
| DD-006 | `docs/README.md` + `working-rules.md` | The "live progress marker" pointer replaced with `git log`; the `overview.html` "index of everything" claim marked stale with what it is missing |
| DD-010 | `docs/README.md` + `user-guide.md` | "The only doc an operator needs" removed; the guide's own status now says it was written at v2 and never extended |
| DD-014 | `docs/README.md` | `north-star.md` **added to the index** (it was absent entirely) and made canonical for *why*; `imagedrip-plan.md` demoted to the v1 architecture record |
| DD-018 | `docs/README.md` | "Every document" → "The documents worth reading", with a line saying `find` is the exhaustive list. The heading no longer promises completeness it cannot keep |

### Deliberately not fixed

| Finding | Why |
|---|---|
| **DD-013** — `north-star.md`'s "costs nothing per image" | **David's to re-ratify, not an agent's to patch.** It is an interviewed document; its own frontmatter says *"The code is a stale snapshot of intent, the human is not."* It becomes wrong only if he rules for the provider move, and then it needs his words |
| **DD-017** — the agent-only destructive verbs | **A code change, and an unruled one.** Now documented in `CLAUDE.md` as an open gap so nobody mistakes it for a decision, but no buttons were added and no verb was unpublished |
| **DD-019** — `overview.html` | Needs regenerating against the real tree, not a one-line edit. `working-rules.md` rule 3 still stands; the claim is now marked stale so it stops being believed |
| **DD-011** — the `chat-session.ts:247` comment | Source file. Left for whoever next edits that file, and recorded here |
| **DD-020** — the `appydave:imagedrip` skill's `scripts/idrip` path | Outside this repo |
| **DD-008, DD-012, DD-015, DD-016** | Info-level or superseded by Part 3's pending ruling |

### What this second pass did NOT do

- **It did not re-audit.** Fixes were applied to the findings as written; no new claims were
  checked, so the corpus has not been re-verified end to end.
- **It did not touch the second tier.** The `requirements-v*` documents other than v3 and v4, every
  `handover-*`, `imagedrip-plan.md`, `ux-and-workflow.md` and the research/review documents were
  never decomposed (limit 4 above) and were not edited. **Their status fields are unverified, not
  verified-and-correct.**
- **It fixed status lines, not bodies.** `requirements-v3` and `v4` now declare themselves shipped;
  their *contents* still describe the work as future tense throughout. That is normal for a
  requirements document read as a historical record, and it is why both now carry a pointer to the
  amendments rather than a claim of currency.
