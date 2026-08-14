---
doc: research
project: imagedrip
status: RESEARCH — analysis only, nothing built. For David's ruling.
created: 2026-08-14
purpose: settle the domain model, the folder strategy, the agent surface and the drift story
  that the David × Jan design session opened but could not close
pairs_with: docs/ui-design-notes-jan.md
authority: docs/north-star.md — Star interviewed 2026-08-08, bearing ruled 2026-08-09,
  parity rule ruled 2026-08-10
---

# ImageDrip — the unresolved architecture

> ### 🟢 Phase 1 has landed (2026-08-14) — five findings below are now FIXED
>
> This document is analysis, and analysis that describes code which has since changed is
> just wrong. Corrections are marked **✅ FIXED** inline where they occur, rather than
> deleted — what the defect *was* is the reason the fix has the shape it has.
>
> | Was | Now |
> |---|---|
> | `outcome` absent on 3 of 3 manifests; absence meant four different things | Written as `open` at start, so absence can only mean a pre-0.3 file (§2.8) |
> | Two conflicting `PromptStatus` unions; a refusal was inexpressible in the model the UI reads | One shared union, `refused` expressible in both (§2.8) |
> | `FileAuthor.commit()` collapsed *gitignored*, *not-a-repo*, *no-change* and *failed* into one `{committed:false}` | Five distinguishable reasons, and only a genuine failure is logged (§4.7) |
> | A timed-out confirm reached the agent as *"a human was asked and said no"* | Three-way `accept`/`decline`/`cancel`; `403 confirm_unanswered` says nobody answered (§8) |
> | Two unguarded preload paths straight to the harness | Renderer bridges deleted; handlers run-state guarded (§3.3) |
>
> Phase 0's checks are prepared and two already returned real results — see
> [`phase-0-checks/README.md`](phase-0-checks/README.md).

**Read with [`ui-design-notes-jan.md`](ui-design-notes-jan.md).** That file records *what was said*
in the David × Jan design session; this one records *what is true* and what follows from it. Where
the design notes say "open", this file either closes it or says why it cannot be closed.

**Nothing here is implemented.** No code was changed, no `run.*` or config behaviour touched,
nothing committed.

---

## 0 · The headline, before the detail

The design session diagnosed four problems. Reading the code changes the shape of three of them.

| Session's claim | What the code says |
|---|---|
| *"We can't express that two or more ChatGPT conversations produced one set of images"* | **The app already does this**, every run over 18 images. `batch-runner.ts:544` — *"Chunk boundary → re-prime a fresh chat to fight drift."* What is missing is not the behaviour; it is the **record**. |
| *"There's no button that sends one prompt across"* | **There is.** Per-row `⚡ inject`, shipped 2026-08-10 (`1a77ba2`), always visible in Dial-in. Jan's Design 1 **drops it.** The parity gap is a regression in the mock, not a gap in the app. |
| *"Where does the variation count live — not template, not project?"* | The repo asked this itself on 2026-08-09 (v5 §5 Q4) and sketched the home on 2026-08-07 (`Template.promptShape` + `Prompt.variables`). It is **deferred, not unknown.** |
| *"Global vs brand-scoped templates"* | **Templates are already global** in the code — a top-level array, unscoped. Jan's mock proposes brand-scoping that does not exist. The 350-template scale problem David raised is **created by the mock**, not solved by it. |

The one thing the session found that the repo had *not* already named: **a deliverable can span
several runs, and today nothing on disk connects them.** That is real, it is visible in David's own
output folder right now, and it is the blocker.

**And five findings the session could not have reached:**

- **🔴 OpenAI's prompting guide contradicts ImageDrip's founding assumption.** The guide says
  *"repeat the preserve list on each iteration to reduce drift."* `domain.ts:243` says *"Short
  prompts inherit this; they are **NOT re-baked**."* The whole primer architecture is a bet against
  the vendor's stated advice — and re-baking a short invariant block into every prompt is the
  cheapest, best-supported drift fix on the table, attacks **both** drifts, and is the only one that
  touches limes/lemons at all. §5.3, §5.5.

- **The folder conflict resolves as a split verdict, not a winner.** Option A (`~/Pictures/ImageDrip`)
  is not Jan's proposal — it is **shipped behaviour**, and it is a **git repo with 62 commits and a
  40 MB `.git` for 18 images**. Option B (`i-<brand>`) is already in the schema and half-implemented
  in `repo-store.ts`. **A's dated run folder is right; A's root is wrong; B is right but has no
  interior.** §4.
- **A fourth drift option nobody raised: ChatGPT Projects.** Officially documented to let chats
  reference other conversations in the same project. If it carries *visual* style — unverified, and
  the decisive question — it beats both Jan's and David's proposals and removes work. **Ten minutes
  by hand would settle it.** §5.5.
- **The MCP spec independently prescribes Strand 1's model.** *"Servers that need to maintain state
  across calls should do so by returning an explicit handle from a creation tool and accepting that
  handle as an argument on subsequent calls."* That is a reopenable Run, arrived at from the protocol
  side. §3.5.
- **The `NEVER_EXPOSED` denylist has already leaked one verb** — `chat.gate-decide`, the human-gate
  answer channel, is published to agents. Not exploitable today, and safe by accident rather than by
  design. §3.2.

**Where the research is thin, it says so.** Every OpenAI claim in §5.3 is search-synthesis, not
wording I read — `help.openai.com` returns 403 to direct fetch. The unanswerable questions are listed
as unanswerable at the end of §8 rather than filled in.

---

## 1 · Ground truth — what is actually on this machine

Read directly, 2026-08-14, not inferred from any document.

**The live store** — `~/Library/Application Support/imagedrip/domain.json` (v4, modified 2026-08-11):

```
brands:     2   (beauty-joy "Beauty & Joy", ai-tldr "PhilipinoStyle")
templates:  0
projects:   1   (smoothies — 9 prompts, 6 harvested)
activeBrandId:    ai-tldr
activeProjectId:  smoothies
smoothies.outputDir: /Users/davidcruwys/Pictures/ImageDrip/smoothies
smoothies.brandId:   ABSENT (the key is not present — "never bound")
```

The probe litter described in v5.1 §1.4 (8 projects, 7 templates) **has been cleared since**. No
template exists at all, so the `character-sheet` in Jan's mock is not a real record.

**The runs on disk** — three, all under one project:

| Folder | mode | outcome | counts | reprimes | pauses | actual content |
|---|---|---|---|---|---|---|
| `2026-08-03-0943-smoothies` | auto | **absent** | 12/12 | `[]` | 4 | 12 Australian animals |
| `2026-08-03-1233-smoothies` | auto | **absent** | 3/6 | `[]` | 1 | 3 Filipino heroes |
| `2026-08-05-1245-smoothies` | auto | **absent** | 3/6 | `[]` | 1 | 3 more Filipino heroes |

Five things fall out of that table, and they are the whole argument of this document:

1. **Six Filipino heroes, one intent, two run folders, nothing connecting them.** This is exactly
   David's *"you don't want to have to go into multiple folders to find images that are actually the
   same project."* It is not hypothetical; it happened on 3 and 5 August.
2. **Every manifest lacks an `outcome`.** v5 Phase 0.3 debt, still open. All three runs look, on
   disk, like they are still going.
3. **`reprimes: []` everywhere.** No run has ever crossed the 18-image chunk boundary. *This check
   establishes only that these three runs never re-primed* — it does **not** establish the re-prime
   path is broken, and it does not establish it works. **The multi-conversation path has never been
   exercised in real data.** Treat it as BELIEVED, not BUILT.
4. **A project named `smoothies` contains Australian animals and Filipino heroes.** The project is
   not functioning as the organising concept; it is functioning as a folder someone stopped
   renaming.
5. **`~/Library/Application Support/imagedrip/harvest/` holds 25 loose images** — flat, no run
   folder, no manifest, no provenance. The v1 harvest location. Twenty-five images with no record
   of how they were made.

**Incidental, flagged not diagnosed:** `<userData>/logs/` does not exist, although v5 Phase 0.2
(`706f7e7`, 2026-08-09 15:17) tees the logger there and the app was run on 2026-08-11. `npm run dev`
does not set `APPYTRON_HOME`, so the isolated-run redirect (`create-console.ts:61`) should not
apply. **My check — one `ls` — rules out only "a log file is at that path now."** It does not
establish the tee is broken; the directory could have been removed, or the 11 Aug session may have
been something other than a normal launch. Worth thirty seconds of verification, and out of scope
here.

---

## 2 · Strand 1 — the domain model

### 2.1 What exists

`src/shared/domain.ts` and `src/shared/ipc.ts`:

```
Brand      { id, name, body, sourcePath?, repoRoot? }
Template   { id, name, body, importFormat, listPrompt?, negatives?, sourcePath? }
Project    { id, name, body, templateId?, brandId?, sourcePath?, outputDir? }
Prompt     { id, subject, text, status: 'queued'|'harvested', savedPath?, refImage? }
Theme      { name, prompts[] }
Run        { themeName, startedAt, chunkSize, harvested }   ← declared, NOT driven
```

Persisted per run to `<outputDir>/<runId>/manifest.json`:

```
RunManifest { runId, projectName, themeName, mode: 'auto'|'dial-in',
              startedAt, finishedAt?, outcome?: 'complete'|'stopped',
              primer, prompts: RunPromptRecord[],
              counts { total, harvested, refused },
              reprimes: number[],           ← harvested-counts at each boundary
              pauses: { at, reason }[] }
```

Plus `<outputDir>/<runId>/provenance.jsonl`, one line per harvest.

**The unit is `Project`**, ruled and shipped 2026-08-10 (`82d9dde`). A project carries brand,
template, subject, prompt list and output folder, and switching it moves all five.

### 2.2 The five requirements, scored against the code

David's own list, from the design session:

| # | Requirement | State | Evidence |
|---|---|---|---|
| 1 | A run producing images for one style-of-usage is **one data structure** | ⚠️ **Half.** `RunManifest` is one structure per *run*. A **deliverable spanning runs has no structure at all.** | The two Filipino-hero folders, §1 |
| 2 | **Two or more conversations** may have produced those images | ⚠️ **Behaviour yes, record no.** `chunkSize: 18` (`batch-runner.ts:57`); boundary → `harness.newConversation()` + re-post primer (`:387`, `:544`). Recorded only as `reprimes: number[]` — an **ordinal**, not an identity. No conversation id anywhere in `src/`. | `grep -rn "conversation" src/` — the only id-like thing is the Claude CLI's own session id, unrelated |
| 3 | A conversation can be **paused mid-way** for manual reshaping and drift control | 🔴 **Worse than not expressible — actively prevented.** See §2.2a. | `batch-runner.ts:472-483` (verified) |
| 4 | A second conversation may need **primers plus reference images** | ❌ **Declared, never built.** `Prompt.refImage?: string` exists and is commented *"Deferred (model allows it)."* No harness path attaches an image. | `domain.ts:35`; and see Strand 4 |
| 5 | Work can be **manual for a while and then flow-run** | ❌ **Not expressible.** `mode: 'auto' \| 'dial-in'` is a property of the **whole run**. `closeManualRun()` finishes the dial-in run when Auto starts. Mixing modes therefore produces **two run folders**. | `run-manifest.ts:37`; `batch-runner.ts:370–376` |

**Score: one half-yes, one behaviour-without-record, three noes.** David's *"we don't have enough
relational shape"* is correct, and more precisely correct than he could have known — the shape that
is missing is **one level below the run**, not above it.

### 2.2a Requirement #3 has a definite answer, and it is a deliberate NO

David, on harvesting images he produced by talking straight into ChatGPT: *"that can be a little bit
of a problem, because they're not in the queue. So how does that work? I have no idea."*

**The code knows exactly how it works, and the answer is that it refuses.** `batch-runner.ts:472-483`
— verified:

```ts
private async onImageDone(url: string): Promise<void> {
  if (!url) return;
  if (this.stopped || !this.awaiting) {
    // Passive learning (WP4): an image finishing while we are NOT awaiting
    // (e.g. hand-driven dial-in) is remembered, so a later DOM re-fire of its
    // src can never be mis-attributed to an injected prompt.
    if (!this.feedInFlight) this.seen.add(url);
    return;
  }
```

An image that finishes while the runner is not `awaiting` — i.e. **every image David creates by hand
during a repair** — is banked into `seen` and thereby made **permanently unharvestable**. Not
dropped by oversight: banked *on purpose*, so its src can never be mis-attributed to a later prompt.

**This is the correct decision for the problem it was solving**, and it is the same instinct that
runs through the whole codebase — a wrong image under a right filename is worse than no image. But
it means Flow A is not an unimplemented feature. **The images David wants to keep are precisely the
ones the runner is engineered to ignore.**

**That reframes requirement #3 from a gap to a model boundary.** ImageDrip's unit of truth is *one
queued prompt → one attributable image*. Flow A asks for *images with no prompt, from a conversation
the app did not drive*. Nothing in the schema holds that, and the harvest path actively rejects it.

Candidate A's `freehand` segment with a `promptId`-less Entry (§2.4) is the fix — but note what it
costs: **it requires relaxing the very gate that prevents mis-attribution.** The safe version is that
a freehand image is harvested *only* while an explicit "I am repairing" mode is on, so the operator
has asserted the attribution the runner cannot infer. **That is a real design constraint, not a
detail**, and it is the reason this requirement is harder than the other four.

### 2.3 The vocabulary — settled where it can be

David ruled **"theme" → "flow"**. Taking that with the code:

- **`Theme` should simply go.** It is `{ name, prompts[] }`, exactly one per project
  (`ProjectRecord = { project, theme }`), and its name is used for nothing but minting the run id
  (`makeRunId(now, themeName)`). It is a vestigial wrapper around the queue. Renaming it "flow"
  preserves a concept that carries no information. **Recommend: the queue belongs to the project;
  the word `theme` is retired rather than renamed.**
- **A "flow" is best spent on the thing that has no name today: one ChatGPT conversation's worth of
  work.** That is the unit that re-primes, that drifts, that gets paused for repair, and that may
  need seeding with reference images. It is the missing entity.
- **A "run" stays what it already is**: one attempt at delivering a queue into a folder, with a
  manifest. Not the conversation — a run already spans conversations by design.

So: **run = the collected image set and its folder. Flow = one conversation inside it.** That
answers the design notes' §5.3 vocabulary question, and it answers it the way the code already
behaves.

> **Naming caveat.** "Flow" reads as *process*, not *session*, and David floated it for the button
> currently labelled `▶ Run theme`. If the button becomes `▶ Run flow` while `flow` also names a
> conversation segment, the word does two jobs — the exact failure `Template` was extracted to fix
> (`domain.ts:13`). **Recommend `▶ Run` for the button and a different word for the segment.**
> `Leg`, `Pass` and `Session` are all free. **David's to name.**

### 2.4 Candidate model A — Segments (recommended)

Widen the run downward. Nothing new above `Project`; one new record below `Run`.

```
Project  ── the unit (unchanged: brand × template × subject × queue × outputDir)
  │
  └── Run  ── one deliverable attempt · one folder · one manifest · REOPENABLE
        │      { runId, target, outcome, counts, seen[] }
        │
        └── Segment  ── ONE ChatGPT conversation                      ★ NEW
              { index, startedAt, endedAt?,
                mode: 'auto' | 'dial-in' | 'freehand',
                primerAsPosted,          ← may differ from the run's
                seedImages: string[],    ← reference images carried in
                conversationRef?: string,
                entries: Entry[] }

Entry  ── one thing that happened in a segment
  { promptId?: string,          ← ABSENT for an off-queue repair image
    subject: string,
    outcome: 'harvested' | 'refused' | 'abandoned',
    file?: string, generationMs?: number }
```

**How it scores on the five:**

| # | Expressed? | How |
|---|---|---|
| 1 | ✅ | The Run is the one structure. It becomes **reopenable** (v5.1 Item 1 §2.5.3), so one deliverable = one run = one folder, across days and conversations. `reprimes: number[]` is deleted — the count is `segments.length - 1`. |
| 2 | ✅ | By construction. Each conversation is a Segment with its own primer as posted. |
| 3 | ✅ | `mode: 'freehand'` plus an Entry with **no `promptId`**. The image David produced by talking directly to ChatGPT gets a home, a file, and a line in the manifest — instead of being a mystery harvest. |
| 4 | ✅ | `Segment.seedImages[]`. Note this is **the plan's own 2026-07-18 wording** finally modelled: *"every ~15–20 images → new conversation, re-post the primer (and carry reference images from the prior chat) to fight drift"* (`imagedrip-plan.md:56`). |
| 5 | ✅ | `mode` moves from Run to Segment. Manual segment, then auto segment, then manual again — one run, one folder. |

**What Candidate A cannot express:**

- **The same subject list through a different template.** v5 §5 Q4 named this on 2026-08-09:
  *"'the same twelve subjects through a different template' is a natural request, and today that
  means a new project. This may be the next modelling error."* A still means a new project. **Say
  this plainly rather than pretending otherwise.**
- **Variation counts** (§5.2). Orthogonal — see §2.6.
- **A deliverable deliberately assembled from two brands.** Out of scope of anything anyone asked
  for; noted so it is not discovered later as a surprise.

**What it costs:** `seen` must persist into the run record anyway — v5.1 §2.3 already proves that is
a **correctness precondition of resume, not a refinement**. Segments give it a natural home
(per-run, since a re-fired `src` can cross a conversation boundary). No operator-visible control is
added: segments are a record, not a screen.

### 2.5 Candidate model B — a Job above the Project

```
Job { target, brand, template, projectRefs[] } → Runs[] → Conversations[]
```

**Argued and rejected — twice, and the second time is not mine.** v5.1 §1.3 considered *"introduce a
new container ('Set' / 'Job' / 'Stack')"* and rejected it: *"(b) adds a concept to learn, which is
the Star's stated failure condition, and it would leave `Project` still doing most of the job."*

**What B can do that A cannot:** the v5 §5 Q4 case — one subject list, several templates, one
deliverable. That is a genuine capability, not a nicety.

**What B costs:** a fourth axis in a product whose entire pitch is three chips. The Star's own
failure condition is *"if it needs learning, that is the defect."* And B does not remove the need
for Segments — a Job still has to know which conversation made which image, so **B is A plus a
container**, not an alternative to it.

**Recommend A.** Take B only if and when the "same subjects, different template" request arrives
from real work rather than from analysis. It is a widening that A does not block.

### 2.6 §5.2 — where the variation count lives

David's problem, restated precisely: a *product detail card* for `mango` needs one main image plus
N variations; N differs per subject (durian may support two, matcha seven); N cannot live on the
Template (it would lock every card) and cannot live on the Project (the project may be the whole
menu, or the video characters).

**Both of them are right that it belongs between the two. Both of them missed that the home is
already sketched.** From the 2026-08-07 handover, carried into v5 §1.7 as Phase 1.2:

> Shape on `Template.promptShape`, values on `Prompt.variables`, resolved at feed time.

N is a variable. It lives on the **subject row**, which is neither the template nor the project —
it is the per-item layer Jan asked for, and it already has a name and a sketch.

**But there is a second, harder half nobody named, and it is not free.** Today the cardinality is
fixed: one Prompt → one image. `Prompt.savedPath?: string` is singular, and the run loop's
`awaiting` / `seen` gate assumes exactly one image per feed. "One main plus N variations" is
**one queue row producing many images**, which means:

- `Prompt` needs `results[]`, not `savedPath?`;
- the harvester must know **how many images to expect** before it can declare a row done;
- and until it does, a row that delivered 2 of 3 looks identical to a row that delivered 3 of 3 —
  which is precisely the silent failure this repo forbids.

**So the honest answer is: half of §5.2 is a deferred feature with a design; the other half is a
cardinality change in the hottest, most safety-critical loop in the app.** Do not let the first
half's cheapness imply the second's.

> **North Star note, once:** a per-subject variation count is a control the operator has to learn.
> By the Star's test that is **cockpit, not parity** — it lets a person express something new, not
> perform a step the machine already performs. Recorded, not vetoed: David's own worked example
> demands it, and the Star does not get to decide that his real workload is wrong.

### 2.7 §5.1 — global vs brand-scoped templates

**The code is already on David's side, and neither participant knew.**

`Template` is a **top-level array on the document**, unscoped to any brand. `Project.templateId`
points at one. There is no brand→template relation in `src/shared/domain.ts` at all. **Templates are
global today.**

Consequences for the argument as it was had:

- **The 350-template scale problem is created by Jan's mock, not solved by it.** Under the current
  global model the list is however many templates exist in total — 3, or 10. David's *"if I clicked
  on Joy Juice and saw 350 templates, that would be a problem"* describes a world where templates
  are per-brand, which is the world the mock proposes and the code does not implement.
- **`character-sheet` being brand-independent is already how it works.** David's instinct matches
  the schema.
- **Jan's brand-scoped list is a narrowing**, and it would need the brand→template relation built
  before the UI could show it.

**The crossover case** — a global template customised for one brand — has three shapes:

| | Shape | Cost |
|---|---|---|
| (a) | **Fork on customise** — copy the global template into a brand-owned one | Free to build; **drifts**, and drift is the thing `Template` was extracted to stop |
| (b) | **Overlay record** `{ templateId, brandId, bodyDelta }` | No drift; a fourth concept, and a diff to reason about |
| (c) | **Use the Brand body, which already composes first** | **Free — it already works.** `compose()` puts brand → template → project, so brand text already conditions how the recipe is read |

**Recommend (c) until it demonstrably fails.** It costs nothing, it is already shipped, and it is
the only one of the three that adds no concept. If a brand needs to change a template's *structure*
rather than its tone, (c) will not stretch — and that is the signal to build (b), not (a).

**⚠️ David parked this and has not ruled.** Recorded as research, not as a decision.

### 2.8 How a partially-delivered run is represented

The repo's hardest rule — *a run that did not deliver must never look like one that did* — and the
one place the current model is not merely thin but **actively misleading**.

**✅ FIXED in Phase 1 (1a + 1b).** What it was, and why the fix looks as it does:

- `PromptStatus` in the shared model was `'queued' | 'harvested'`. **Two states.**
- `RunPromptRecord` in the manifest was `'queued' | 'harvested' | 'refused'`. **Three.**
- They were not the same type, and the shared one **could not express a refusal at all**.
- `outcome` was `'complete' | 'stopped'` and was **absent on all three real manifests**.

So a prompt that was refused, a prompt never reached, and a prompt still waiting were all `queued`
in `domain.json`. A run that stopped at 3 of 6 and a run still going were both `outcome: undefined`.
**Absence and success looked identical**, in the file that exists to prove they are different.

**What shipped:** one shared `PromptStatus` including `refused`, used by both the live queue and
`RunPromptRecord`; and `RunOutcome = 'open' | 'complete' | 'stopped'`, written as `open` on the
first flush of every run. Absence now has exactly one meaning — a pre-0.3 file.

**Deliberately NOT shipped:** nothing writes `refused` to the live queue yet, so a refused prompt
still stays `queued` in `domain.json` and IS retried next run. That retry behaviour is a product
decision (refusals can be transient), not a type fix — **David's to rule.** The type permits it; the
runtime does not yet do it.

**Proposed, under Candidate A:**

```
Run.outcome:  'complete' | 'stopped' | 'failed' | 'abandoned' | 'open'
              ← 'open' is written at start, so absence can only mean a crash,
                and a crash is then distinguishable from an unfinished run

Entry.outcome: 'harvested' | 'refused' | 'abandoned'
              ← every prompt the run TOUCHED gets an entry
Prompt.status: 'queued' | 'harvested' | 'refused'
              ← the two enums are unified; one type, one meaning
```

And the derived truth a UI can show without arithmetic: **`target` vs `delivered`, per run, always
present.** Jan's `RUNS` panel already draws this — the dark-red *"Stopped after 6. 18 of 24 images
were never delivered"* row is the best expression of this rule in either design, and it should
survive whatever else changes. It cannot be drawn honestly from today's manifests, because three of
three have no outcome to draw.

### 2.9 What Strand 1 needs from David

1. **Ratify or reject Candidate A** (Segments below Run; Run becomes reopenable).
2. **Name the segment.** "Flow" collides with the button label — §2.3.
3. **Confirm `Theme` is retired** rather than renamed.
4. **Rule §5.1** — global templates with brand tone as the override channel (option c), or build the
   relation Jan's mock implies.
5. **Accept or defer the §5.2 cardinality change** — one prompt → many images — knowing it touches
   the harvest gate.

---

## 3 · Strand 2 — the agent surface

### 3.1 David's claim, verified against the code

David's framing: *CQRS, plus a REST surface, plus a chatbot bound either externally (over the API)
or internally (calling the command/query functions).* He believes ImageDrip already works this way.

**Three of those four are not what the code does.** *(Everything in this subsection I re-verified
personally, not on the agent's word.)*

| Claim | Verdict | Evidence |
|---|---|---|
| **CQRS** | ❌ **No.** One flat registry. | `HandlerDef` (`ipc-router.ts:4-10`) is `{ channel, input?, handle }` — **no read/write discriminator exists**, and nothing dispatches on one. Of 36 published verbs: 8 pure reads, 18 domain writes, 5 OS side-effects, 4 run-control, 1 leaked. The split is **conventional, never enforced.** |
| **REST** | ❌ **RPC-over-HTTP.** | `POST /v1/call/:verb` addresses a *procedure*, not a resource. Four routes total. Calling it REST sets the wrong expectations about idempotency and caching. |
| **Internal binding** | ❌ **Does not exist.** | Even the in-app chat pane is an **external** client: CLI child process → stdio MCP proxy → loopback HTTP → main. **Three processes** to reach a function in the same app. Two transports (renderer IPC, HTTP), one handler set. |
| **MCP server is real** | ✅ **Yes.** | `scripts/imagedrip-mcp.mjs` (341 lines), `npm run mcp`, `npm run chat:probe`, a committed `.mcp.json`, and `test/mcp-proxy.test.ts` (13 tests). |

**This is not a criticism dressed as a finding.** The error mapping is genuinely good: 422 / 409 /
403 are classified by **stage** rather than by error type, which is what lets an agent distinguish
*"you sent garbage"* from *"you may not do that right now"* from *"a human said no."* That
distinction is the single most useful thing this surface does for an agent driver, and it is rarer
than it should be.

**What the naming costs.** "CQRS" and "REST" are load-bearing words in David's mental model, and if
the plan says the app already has them, the work of actually getting them never gets scheduled.
Naming it accurately — **a flat, Zod-validated, policy-gated RPC verb registry** — is not a demotion;
it is what makes the next decision honest.

### 3.2 The `NEVER_EXPOSED` denylist has already failed once — verified

**Finding: `imagedrip:chat:gate-decide` is published to agents.** I verified every link in this
chain myself:

- The channel is defined (`shared/ipc.ts:138`) and **registered** (`index.ts:846-852`).
- `isExposed()` (`verb-policy.ts:155-158`) publishes **any** `imagedrip:*` channel **not** in
  `NEVER_EXPOSED` — it is a **denylist, not an allowlist**.
- `NEVER_EXPOSED` (`verb-policy.ts:70-95`) lists `chat:send`, `chat:state`, `chat:stop` — **and not
  `chat:gate-decide`.**

`chat.gate-decide` is the **D1 human-approval gate's answer channel** — `handle: ({id, allow}) =>
gate?.decide(id, allow)`. An agent that could call it with a pending gate's id could **approve its
own gated call**.

**Is it exploitable? No, on today's code.** The gate id is `randomUUID()` (`chat-gate.ts:141`), and
the channel that would reveal a pending id — `chat:state` — *is* in `NEVER_EXPOSED`. So the attack
needs an unguessable v4 UUID and there is no published way to learn it. **What this check did NOT
establish:** that no *future* verb leaks a gate id, and that no log or error message does. The
safety here is one accident away, and it is accidental safety, not designed safety.

**The real finding is the shape, not the instance.** Three of the four `chat:*` channels were
enumerated by hand into the denylist and the fourth was missed. That is exactly the failure mode a
denylist has and an allowlist does not. **Recommend `isExposed()` invert to an allowlist**, which is
also the change that makes a genuine command/query split enforceable rather than conventional —
one mechanism, two problems.

### 3.2a Gating is pane-only — a terminal agent deletes projects unchallenged

**Verified.** `control-surface.ts:348` reads `if (isPane && isGated(verb))`, and the comment above it
states the design plainly:

> *"Only the PANE is held. Every other client keeps the advisory behaviour, which is what leaves
> `chat:probe` headless and **leaves an agent driving the surface directly un-blocked** — there is no
> human at those."*

So the 11 gated verbs — including `project.delete`, `brand.delete`, `template.delete` and
`repo.attach` — are confirm-first **for the in-app chat pane only**. Any other client holding the
bearer token calls them with no confirmation at all.

**This is a decided trade-off, not a bug** (it is what keeps `chat:probe` headless), and v5 §1.4
already records it as a *"known residual"*. It is repeated here because **"ImageDrip gates
destructive verbs" is true of one of its two clients**, and the sentence is usually said without the
qualifier.

### 3.3 The §4 hard constraint — enforced, with two latent holes

The v4 §4 constraint (*nothing but the CadenceEngine / WebviewDriver writes to the ChatGPT webview*)
**is enforced in code at four layers, not merely asserted in a document.** Every webview writer —
`harness:attach`, `set-bounds`, `set-visible`, `new-conversation`, `feed`, `stop` — plus both dial-in
injects sits in `NEVER_EXPOSED`, so no control-surface client and no MCP tool can reach them.

**✅ FIXED in Phase 1 (1e).** The renderer bridges for both were deleted and the main handlers
gained a run-state guard. What they were:

**Two latent holes, both in the preload, both unreachable today:**

| Path | Chain | What it bypasses |
|---|---|---|
| `window.imagedrip.feed()` | `preload/index.ts:127` → `index.ts:902-906` → `harness.feed()` | The `busy` and `feeding` latches, `seen`, `awaiting`, the manifest, the stall budget. Called mid-run it is the observed `"EmuEmu"` double-paste (`batch-runner.ts:418-423`) |
| `window.imagedrip.newConversation()` | `preload/index.ts:126` → `index.ts:898-901` → `harness.newConversation()` | Everything above, **plus the live conversation itself** |

**The second is arguably worse, and it is the one nobody had noticed.** Calling it mid-run navigates
the webview out from under a live `awaiting`. There is no double-paste and no visible symptom — just
a generation that never lands and a run that sits until the stall cap fires. **A run destroyed this
way and a run merely being slow look identical**, which is this repo's named cardinal sin.

Neither is called from anywhere in `src/renderer/`. **What that check does not establish:** that
nothing reaches them via DevTools, dynamic dispatch, or a future component. An unused-but-exposed
API and a never-noticed API look identical to a grep. Both should be guarded with the
`runner?.running` check every sibling handler has, or deleted.

### 3.4 Half C — the parity question, answered

**First, the §5.4 claim from the design session is confirmed false against the app.** The per-row
`⚡ inject` button exists, is always visible in Dial-in, and routes through `injectOne(promptId)` →
the same verified `feed()` path Auto uses. **Jan's Design 1 drops a shipped control.** That is a
regression in the mock, not a gap in the product — and it means the fix is "put the button back in
the design", not "build a button".

**Second, the live question — can the re-prime parity gap be closed without breaching §4?**

Commit `1a77ba2` named this as the one remaining parity gap: *"the Auto loop opens a fresh
conversation and re-primes at the chunk boundary, and there is no manual equivalent."*

**Answer: yes, and exposing it as a verb does not breach §4 — provided it is runner-mediated.**

The reasoning turns on a distinction nobody had drawn: **`newConversation()` writes nothing.**
`webview-harness.ts:218-222` is a `loadURL` — no keystrokes, no clipboard, no submit. It *navigates*
the view; it does not *type into* it. The ToS mitigation is about who feeds prompts at what cadence,
and navigation is not feeding.

So:

- A **raw `harness.new-conversation` verb would breach §4** — not because navigation is dangerous,
  but because it hands an agent the ability to desynchronise the runner from the view it believes
  it is driving. The runner's `chatPrimed` flag (`batch-runner.ts:95`) would go stale, and the next
  fed prompt would land in an unprimed chat that the manifest records as primed. **A wrong image
  under a right filename** — the forbidden failure, reached by a route nobody guarded.
- A **mediated `run.reseat`** — the runner opens the conversation, re-posts the primer, records the
  boundary, updates `chatPrimed` — **does not breach it.** The runner remains the only writer and
  the only authority on state.

**A correction to the commit's own reasoning, worth recording:** `1a77ba2` says *"building one would
mean a renderer path to `harness.newConversation`, which is outside the sanctioned dial-in path."*
**That path already exists** (`preload/index.ts:126` → `index.ts:898-901`) and is unguarded; nothing
calls it. So the blocker was never the path's absence — it is that the path is the *wrong* one,
being raw rather than mediated. The correct work is not to build a renderer path but to build
`run.reseat` and leave the raw one unexposed.

**This is also the Segment boundary from Strand 1 (§2.4).** `run.reseat` and "start a new segment"
are the same operation. The parity fix and the model change are one piece of work, not two.

**The discriminator, stated so it can be reused:**

> **Does the caller reach `harness.*` directly, or does it ask the single owner to perform one of its
> own steps?**

Every published run verb is the latter. `run.start` *already* causes `newConversation()` — via
`primeThenContinue(true)` — and is on the allow list. **There is no coherent reading of §4 under
which `run.start` is safe and a mediated `run.reseat` is not.**

**A doc/code disagreement this exposes.** `run.inject-primer` and `run.inject-prompt` are in
`NEVER_EXPOSED` on the justification *"Dial-in injects type the primer / a prompt straight into the
live chat"* (`verb-policy.ts:77-79`). **That is true of `harness.feed` and false of them** — both go
through `feedGuarded()`, the same latches, the same `seen` set, the same manifest. They were put on
the deny list before this distinction had been drawn. **The deny list should name the *unmediated*
writer, not the mediated step** — and `run.start`, which writes far more, is already allowed.

**Why mediation is a positive argument, not a grudging one.** Auto opens a fresh conversation roughly
every 18 images. A button lets a person do it every ten seconds, and *rate* is the genuinely
ToS-adjacent dimension here. The **mediated** path can enforce a floor — the runner already owns
cadence, the stall budget and `rate-limit-guard.ts`. A raw harness verb could not. **Exposing it
through the runner is what makes it controllable.**

**And it pays a slice of §5.3 immediately.** If `reseat()` keeps the dial-in run record *open*
rather than calling `closeManualRun()`, images from conversation 1 and conversation 2 land in **one
folder with a boundary marker** — directly serving David's *"you don't want to go into multiple
folders to find images that are actually the same project."* That is requirement #2, delivered by a
button.

**One more thing the mock hides, and it is the real lesson of §5.4.** The inject button is
**mode-conditional** — it renders only when `dialIn` is true, and the mode defaults to **Auto**
(`store.ts:153`), held in in-memory zustand so it never persists. So the app's default state hides
its own parity control. The parity rule's own justification — *"a control that only exists where the
cursor happens to be cannot be shown to anyone"* — applies to mode-conditionality for exactly the
same reason it applied to hover-conditionality. **A mode is a cursor position that lasts longer.**
That, not Jan's mock, is why this gap keeps being rediscovered.

### 3.5 Half B — the current state of the art, from primary sources

*I fetched the MCP pages myself before the assigned agent's Half B arrived; it then delivered in
full and independently reached the same version finding, plus the Anthropic tool-design sources and
the annotation schema below.*
Sources fetched directly: [MCP versioning](https://modelcontextprotocol.io/specification/versioning) ·
[MCP tools, rev 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) ·
[ToolAnnotations schema](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-06-18/schema.ts) ·
[Anthropic: define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) ·
[Anthropic: writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) ·
[Anthropic: building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

**Two sourcing caveats carried from the agent, not laundered away:** its RFC 9110 quotes came from a
search-indexed excerpt rather than one clean raw fetch (the raw RFC truncates), and its claims about
MCP progress / cancellation / the **removal of `Last-Event-ID` resumability** came via search
summaries of `modelcontextprotocol.io` rather than direct fetches. **If the resumability removal is
real it raises the stakes on idempotency declarations considerably** — a re-issued non-idempotent
call is a duplicate side effect. Treat as a lead.

#### The protocol has moved three revisions and changed shape

**Current MCP revision is `2026-07-28`** (fetched and read). `scripts/imagedrip-mcp.mjs:35-36` pins
`2025-06-18` and knows `2024-11-05`, `2025-03-26`, `2025-06-18`.

The change is not cosmetic. Version negotiation **moved out of the `initialize` handshake**: every
request now declares its version via an `io.modelcontextprotocol/protocolVersion` key in `_meta`,
servers accept or reject per request, and there is a new mandatory `server/discover` RPC. The spec
explicitly documents **backward compatibility with "handshake-based protocol revisions (`2025-11-25`
and earlier)"** — so **ImageDrip is not broken; it is on the legacy model within a documented
compatibility path.** Worth scheduling, not worth panicking about.

#### The spec validates the D1 gate in its own words

> *"For trust & safety and security, there **SHOULD** always be a human in the loop with the ability
> to deny tool invocations."* Applications **SHOULD** *"present confirmation prompts to the user for
> operations, to ensure a human is in the loop."*

ImageDrip's confirm-first gating and the D1 human gate are **exactly what the spec asks for**, and
the 403-on-denial path is the right shape. This is the strongest-served part of the whole
architecture and it should be said plainly.

The spec also warns: *"clients **MUST** consider tool annotations to be untrusted unless they come
from trusted servers."* Not a problem here — the server is the app itself — but it is the reason the
**allowlist** recommendation in §3.2 matters: on a local server, the client's only real protection
*is* the server's own discipline about what it publishes.

#### ⭐ The spec's "Stateful Tools" guidance is the answer to Strand 1's agent-facing half

This is the most useful thing in the fetch, and it lands squarely on the domain model:

> *"MCP has no protocol-level session, so a server cannot rely on implicit per-connection state to
> relate one tool call to the next. Servers that need to maintain state across calls — a shopping
> cart, an open browser context, a database transaction — should do so by **returning an explicit
> handle from a creation tool and accepting that handle as an argument on subsequent calls**."*

**A reopenable Run and a Segment are precisely this pattern.** Today `run.start` returns nothing an
agent can hold onto; the run is implicit per-connection state, which the spec says a server cannot
rely on. Under Candidate A, `run.start` returns a `runId` handle, and `run.reseat`, `run.resume` and
`run.export` take it. **The model change and the agent-surface change are the same change**, and the
spec independently prescribes it.

The spec's handle-design guidance transfers directly, and two items are worth adopting verbatim:

- **Opacity** — *"handles that encode internal structure invite parsing or guessing."* ImageDrip's
  run id is `YYYY-MM-DD-HHmm-<theme-slug>`, which is the opposite of opaque. That is **correct for a
  folder name and wrong for a handle**; if the folder name doubles as the agent-facing handle, an
  agent will construct one. Keep the readable folder name; do not let it be the only identifier.
- **Expiry errors** — *"a call against an expired or unknown handle should return a tool execution
  error that says so."* This is the silent-failure rule arriving from the protocol side.

#### Error semantics — ImageDrip is already aligned, with one gap

The spec splits **protocol errors** (unknown tool, malformed request — *"models are less likely to
be able to fix"*) from **tool execution errors** (`isError: true`, *"actionable feedback that
language models can use to self-correct"*), and says clients **SHOULD** feed the second kind to the
model.

ImageDrip's 404 / 422 / 409 / 403 mapping maps onto this cleanly — a 409 run-state lock is exactly a
self-correctable tool execution error, and surfacing the handler's message verbatim is what makes it
actionable.

**The gap: `outputSchema`.** The spec provides it so *"clients **SHOULD** validate structured
results against this schema."* ImageDrip generates `inputSchema` from its Zod defs
(`zod-to-json-schema.ts`) but there is no output side. An agent calling `domain.get` gets shape it
must infer. **Cheap to add, and it is the read half of the read/write split** — another argument for
§3.2's allowlist inversion doubling as the CQRS fix.

#### Tool annotations — the standardised slot for the split ImageDrip only has as a convention

The [`ToolAnnotations`
schema](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-06-18/schema.ts)
defines exactly the metadata §3.1 found missing: `readOnlyHint` (*"the tool does not modify its
environment"*), `destructiveHint`, `idempotentHint`, `openWorldHint`. They are **hints, not
enforcement** — *"clients should never make tool use decisions based on ToolAnnotations received
from untrusted servers"* — which validates both halves of what ImageDrip does: its enforcement is
correctly in code, where hints cannot reach; its *declaration* is simply absent.

**The defaults are the problem.** Per the [official MCP
blog](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/): *"a tool with no
annotations is assumed to be non-read-only, potentially destructive, non-idempotent, and
open-world."* ImageDrip emits no annotations, so **`domain.get` and `project.delete` are
indistinguishable to any client safety layer, and both are assumed destructive.**

The mapping is free to adopt and needs no model change:

| Verbs | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
|---|---|---|---|
| `context.get`, `domain.get`, `domain.compose-primer`, `runs.list`, `runs.manifest`, `run.chat-state`, `harvest.thumb`, `uat.counts` | `true` | — | — |
| the switches and saves — `brand.switch`, `template.switch`, `project.switch`, `theme.rename`, `domain.save-*`, `template.save` | `false` | `false` | **`true`** |
| the deletes plus `domain.reset-run`, `repo.attach`, `domain.import-prompts` in `replace`/`clear` | `false` | **`true`** | `false` |
| `run.start`, `run.resume` | `false` | `false` | `false` |
| **`run.stop`, `run.pause`** | `false` | `false` | **`true`** |

**That last row matters more than it looks.** `run.stop` is idempotent and deliberately
always-reachable (`verb-policy.ts:107-111` argues that gating it *"would make a run un-stoppable in
exactly the situation where stopping matters most"*). **Stopping is the one thing an agent should
retry freely, and nothing currently tells it so.**

#### Where ImageDrip is already above the state of the art

Against Anthropic's tool-design guidance — *"aim for at least 3–4 sentences for each tool
description"*, *"explain… when it should be used (and when it shouldn't)"* — `VERB_DOCS`
(`verb-policy.ts:220-279`) is close to a worked example. `context.get` opens *"Call FIRST, before
anything else, every session."* `run.start` names both the precondition and the recovery. The
proxy's error labels do the same job for failures: *"DECLINED BY THE USER… This is FINAL. Do not
retry it, and do not look for an alternative route to the same outcome."*

That distinction — a run-state lock clears itself, an engine lock clears only when a human acts — is
exactly right, and telling an agent to wait on the second would leave it polling a condition no
amount of waiting can change.

**The one guideline it does not follow is consolidation** (*"rather than creating a separate tool for
every action… group them"*). 36 tools, CRUD-per-noun. **But this is a knowing trade, not an
oversight:** the verbs are 1:1 with IPC channels, and that 1:1 is what buys no-drift, inherited
locks and a zero-logic proxy. Collapsing them would need a mapping layer — a second source of truth,
the exact thing the architecture exists to avoid. **If tool count ever becomes a measured problem,
the cheap move is a task-shaped verb added to the registry itself** (`domain.import-prompts` already
is one), not a translation layer over it.

*(Related, unmeasured: most mutating verbs return the entire `DomainState` by design. Good instinct
that becomes a token problem as brands × templates × projects × queue grows. Claude Code warns above
10,000 tokens of MCP output. **Nobody has measured an actual response size** — only that the growth
direction is unbounded and nothing caps it.)*

#### Is a stdio MCP proxy over a loopback HTTP API a layer too many?

**No primary source rules on topology** — the spec is deliberately transport- and
deployment-agnostic, and I found nothing addressing a local single-user desktop app versus a shared
service. So this stays an engineering judgement, and I will label it as mine:

The three-hop chain (CLI → stdio proxy → loopback HTTP → main) costs latency and failure modes, but
it buys the containment boundary that D1 depends on, and the spec's *"MCP has no protocol-level
session"* note means **the proxy being a stateless pass-through is correct rather than lazy**. The
layer is justified. What is *not* justified by anything is that there is **no** in-process path at
all (§3.1) — the app's own pane pays the full three-hop cost to call a function in its own address
space.

#### What these checks did NOT establish

- I fetched two spec pages. **I did not audit `imagedrip-mcp.mjs` against the 2026-07-28 schema** —
  "three revisions behind" is a version-string comparison, not a conformance test.
- `help.openai.com` and `openai.com` **403 to direct fetch**, so every OpenAI-sourced claim in this
  document (all of them in §5.3) is search-synthesis, not read wording.
- I found **no primary source** on how a chatbot should be bound to a CQRS surface specifically, or
  on read/write splits for agent drivers. The Stateful Tools guidance is the closest the spec comes,
  and it is about handles, not about command/query separation. **Recorded as not found rather than
  inferred.**

## 4 · Strand 3 — where image files live

### 4.0 The brief was stale — three of four premises are false

The design notes recorded `~/dev/image-projects/` as *seven directories, completely empty, no git,
no jump alias, absent from `locations.json`*. Checked directly on 2026-08-14, **and re-verified by
me personally** because it contradicts the record:

| Claim | Disk |
|---|---|
| seven directories | **five** — `i-aitldr`, `i-appydave`, `i-beauty-and-joy`, `i-challenge-dv`, `i-voz` |
| completely empty, zero files | **seven files** — container `README.md` + `CLAUDE.md`, plus one `README.md` per child |
| no jump alias, absent from `locations.json` | **six entries registered** — `ji`, `ji-ad`, `ji-aitldr`, `ji-joy`, `ji-voz`, `ji-cdv` |
| no git | ✅ **true** — `find … -name '.git' -maxdepth 3` returns nothing, over an exhaustive enumeration |

Every child README opens `**Status**: PLACEHOLDER — directory registered, no assets yet`, and the
container README explains why: *"An empty directory with no README reads as finished infrastructure;
an empty directory that says PLACEHOLDER reads as what it is."*

**Container docs are dated today, 10:26; child READMEs 09:33.** Something brought this container up
to standard during this session. **I have not established what**, and I am not going to guess: the
research agents on this job were instructed read-only, and the most plausible author is the
`open-design-workflow` session (`c88b926d`) that David named as designing exactly this structure.
**Attribution unconfirmed.**

`i-joy-juice/` and `i-shared/` are gone — the container README records a 2026-08-14 ruling that
Beauty & Joy absorbs Joy Juice, and `~/dev/media-shared/DECISION.md` records `i-shared` created and
deleted the same day.

**A layer nobody mentioned:** `~/dev/media-shared/` (`jms`, registered, not a git repo) is a new
cross-container index — `registry/containers.json` (a machine-readable roster of the video / image /
design containers with prefix, jump alias, GitHub org, asset policy, children), a status script and
a dashboard. It records **`image.asset_policy: "PLACEHOLDER — not yet decided"`**. That is precisely
the decision this strand exists to close, and it already has a file waiting for the answer.

### 4.1 Option A is not a mock — it is live, and it is a git repository

`~/Pictures/ImageDrip/smoothies/` is what the app does today, and it is worse than the design notes
suggested. **Verified by me directly:**

```
~/Pictures/ImageDrip/smoothies/     80 MB total
├── .git/                           62 commits · first 2026-08-03 · NO REMOTE · 40 MB
├── 2026-08-03-0943-smoothies/      12 png + manifest.json + provenance.jsonl
├── 2026-08-03-1233-smoothies/       3 png + manifest.json + provenance.jsonl
└── 2026-08-05-1245-smoothies/       3 png + manifest.json + provenance.jsonl
```

18 PNGs, 39.5 MB (avg 2.25 MB). **62 commits for 18 images** — 18 harvest, 17 provenance, 27
manifest, ≈3.4 commits per image. `.git` is 40 MB, larger than the images it protects, and PNGs do
not delta-compress so it never shrinks.

**The path is hard-coded**, not a preference: `domain-store.ts:50-52` —
`outputRoot() = join(app.getPath('pictures'), 'ImageDrip')`. No env var, no setting.

**An image lands at `~/Pictures/ImageDrip/<project-slug>/<YYYY-MM-DD-HHmm-theme>/<subject-slug>.png`
right now.** Jan's mock is *describing shipped behaviour*, not proposing it. Its `change… / reveal`
buttons are parity — `domain.pick-output-dir` already exists (`verb-policy.ts:259`).

### 4.2 The third convention is dead, not competing

`docs/ux-and-workflow.md:57,100` specifies `<project>/output/` with `<subject-slug>.png`. **The
filename half shipped** (`batch-runner.ts:512`); **the `output/` half never did** — the dated run
folder replaced it. Zero instances on disk, zero references in `src/`. There are **two** live
conventions, not three. Say so, so it stops being cited.

### 4.3 The organising concept

David's ruling — `Pictures`, `ImageDrip` and `movies` are all wrong — is one principle stated three
times:

> **A body of work is organised by whose it is and what it is for. Never by what kind of file the OS
> thinks it is, and never by which tool happened to produce it.**

- `Pictures/` organises by **OS media type** — no brand, no client-confidentiality boundary, no sync
  story, and adjacency to `Photos Library.photoslibrary`.
- `ImageDrip/` organises by **producing tool** — and fails hardest against the named use case. A
  folder named after the first tool is lying the moment a second one touches the work.
- `<project>/output/` organises by **direction of flow**, which says nothing about ownership and does
  not survive a project spanning runs.

**The corollary that decides the strand: ImageDrip does not own the folder. It writes into a folder
the estate owns.** `locations.json` and `containers.json` already own brand naming, jump aliases,
GitHub orgs and privacy defaults for every other media type. An app inventing its own root outside
that registry is a fourth, unregistered estate — and **the 71 MB of unattributable PNGs in
`userData/harvest/` is what that looks like after three weeks.**

ImageDrip's legitimate ownership is the **interior of a run**: the run id, `manifest.json`,
`provenance.jsonl`. It already does that part well.

### 4.4 The precedent, read directly

`~/dev/video-projects/` — container, **not** a repo, registered as `jv`. Seven children, all real
repos with real remotes under `git@github.com:appydave-video-projects/*`. Inside a child
(`v-aitldr`): `brand/` (DESIGN.md, VERBAL-STYLE.md) → `templates`-equivalent → `projects/<slug>/`,
plus `projects.json` — a per-repo manifest that records **where heavy binaries actually live**
(`storage: {ssd, s3, local}`) while `.gitignore` keeps them out of git.

Distilled: **container (not a repo) → one repo per brand (the privacy boundary) → brand identity,
reusable recipes, `projects/<slug>/` as the unit → metadata in git, binaries gitignored and tracked
by manifest → a registry JSON + dashboard above it all.**

Also relevant: `~/dev/design-projects/CLAUDE.md` already states the maturity rule — *"Create
`d-<client>/` only when its first export is ready to land… Make it a git repo only when someone else
needs it."*

**`locations.json` marks reality with `git_remote`:** every `video-*` entry carries one; no
`image-*` or `design-*` entry does. And **ImageDrip itself is in neither `locations.json` nor
`apps.json`** — the app that produces the assets is absent from both registries.

### 4.5 The proposal

```
~/dev/image-projects/                       ji         container, NOT a repo        [exists]
├── README.md  CLAUDE.md                                                            [exists]
└── i-aitldr/                               ji-aitldr  ← GIT REPO BOUNDARY   [dir exists, no git]
    ├── .gitignore                          runs/**/*.png ignored
    ├── brand/DESIGN.md                     synced from the `brand` skill; app never writes it
    ├── templates/character-sheet/{template.md, template.json, examples/}
    ├── projects/
    │   └── filipino-heroes/                ← THE UNIT
    │       ├── project.md  prompts.md  project.json
    │       ├── library.json               cross-run index (v3 WP4, unbuilt)
    │       ├── runs/
    │       │   ├── 2026-08-03-0943-filipino-heroes/
    │       │   │   ├── 01-jose-rizal.png … manifest.json  provenance.jsonl
    │       │   │   └── …
    │       │   └── 2026-08-05-1245-filipino-heroes/
    │       └── exports/
    │           └── 2026-08-14-character-sheet/   ← the deliverable that LEAVES ImageDrip
    │               ├── images/  export.json  README.md
    └── library.json
```

**Most of this is already implemented.** `repo-store.ts` writes `templates/<id>/`,
`projects/<id>/{project.md, prompts.md, project.json}`, `runs/`, `_template/` scaffolds, and has
whole-repo rehydration via `readRepo()`. `index.ts:319-323` already refuses to `git init` inside a
brand repo, with the comment *"The git boundary for the v3 layout is the BRAND REPO
(`~/dev/image-projects/i-<brand>`), not `projects/<x>/runs/`."* **The gap is binding, not design.**

Two naming changes it recommends:

- **Project folders lose the date prefix** — `filipino-heroes`, not
  `2026-08-04-spring-gallery`. This corrects v3 §3. A project spans dates by definition; dates
  belong on runs.
- **Image filenames gain the queue index** — `<nn>-<subject-slug>.png`. This fixes a real silent
  failure: `batch-runner.ts:512` is bare `slugify(subject).png` with **no existence check**, so two
  queue rows with the same subject in one run produce **one file while the manifest claims both
  harvested**. A "nothing may fail silently" violation living in the naming convention.

Run-folder naming (`YYYY-MM-DD-HHmm-<theme>`, `-2` on collision, seeded from disk on every start)
**ships, works and is collision-safe across restarts — keep it verbatim.**

### 4.6 The verdict on A and B

**Option A is invalidated as a *root* and confirmed as a *leaf*.** `~/Pictures/ImageDrip/` fails the
organising-concept test. But the dated run subfolder inside it is already exactly the v3
`runs/<run-id>/` convention and its collision handling is better than anything proposed to replace
it. **Jan's mock is right about the leaf and wrong about the root** — split the verdict rather than
discarding the mock. *(Also: `/Users/janreyes/Pictures/ImageDrip/smoothies` is a per-person absolute
path; a portability bug if it ever reaches code.)*

**Option B is NOT invalidated, and the case against it was factually wrong.** `i-<brand>` is right,
is registered, is in the schema (`domain.ts:52`), is what `repo-store.ts` implements and what
`index.ts:319` names, and was settled as v3 Decision 1 on 2026-08-04.

But B is **incomplete in the way that matters**: `i-<brand>` names a bucket and says nothing about
the unit inside it. Five empty brand directories are not an answer to *"where does a run go."* The
interior — `templates/`, `projects/<p>/`, `runs/`, `exports/` — is what makes B usable, and nothing
on disk instantiates it.

**The binding between the app and Option B is exactly one defective, gated verb wide.** `repo.attach`
is the only verb that would set `brand.repoRoot`; it is gated, hard-denied to the chat pane, and
knowingly defective. Zero brands carry a `repoRoot`; zero records carry a `sourcePath`. Until that
verb is fixed, **all of `repo-store.ts` is dead code in production.**

### 4.7 Should generated images be in git? — recommend no, and it comes with a trap

**Recommendation: metadata in git, run PNGs gitignored, explicit promotion for images that earn it.**

The measurements are the argument: 2.25 MB average, 40 MB of `.git` for 18 images, 3.4 commits per
image, disk at 86% with 63 GB free — and a North Star whose whole point is *unattended generation on
repeat*, i.e. **unbounded volume by design**. v3 Decision 5 ("generated images go in git") borrowed
v-aitldr's *small-and-reusable* rule, which was calibrated against video, where 2.25 MB genuinely is
small. Against a repo of text and config it is not. `~/dev/media-shared/storage-policy.md` reaches
the same conclusion independently for **generated batches** specifically.

> **✅ FIXED in Phase 1 (1c) — this trap is now disarmed, and 4c is unblocked.**
>
> `FileAuthor.commit()` wrapped `git add` / `git commit` in **one bare `catch`** returning
> `{committed: false}`, commented *"Not a git repo, or nothing to commit."* It did not mention the
> third case — the path is gitignored — and that case was indistinguishable from the other two. The
> instant run PNGs were gitignored, every harvest would silently become uncommitted with no way to
> tell intended policy from broken git.
>
> `AuthorResult` now carries a `reason`: `git-disabled` · `not-a-repo` · **`ignored`** ·
> `no-change` · `failed`, plus git's own message when it is `failed` — **the only one that is
> logged**, because it is the only one nobody intended. Diagnosis runs only on the failure path, so
> the happy path still costs the same three execs.
>
> **4c may now proceed** — but note the ordering is load-bearing and was nearly missed: had the
> gitignore landed first, every harvest would have gone quiet and looked like policy.

**A live contradiction on shared templates, ten days apart:** v3 Decision 2 (2026-08-04) relies on
`i-shared` for universal templates — naming `character-sheet`, the exact template in the export use
case. `media-shared/DECISION.md` (2026-08-14) records `i-shared` created and deleted the same day,
and `containers.json` now says `"shared_child": null` for image. **Resolution: do not resurrect
`i-shared`.** Templates are text, not assets; put them in `~/dev/media-shared/templates/`. v3
Decision 4 already says shared templates are **copied on create, never symlinked**, so the shared
location only ever needs to be readable at create time — it never needs to be a sibling repo.

### 4.8 Export — blocked on one field, not on a screen

**`Project.outputDir` is a single optional string** (`domain.ts:144`), and `listRuns(outputDir)`
scans **one directory** (`run-manifest.ts:195-219`).

**A project therefore cannot represent "my images are in more than one place."** That is David's own
requirement #1 restated from the file-system side, and it means export is blocked in the data model.
Fix: `library.json` (v3 WP4, spec'd, unbuilt) or `Project.runLocations: string[]`. Either way the
project must carry a **set** of run locations.

**What export should do** — fold over manifests, never walk the filesystem (the manifest is the
index; `listRuns` already ignores directories without one): gather every `manifest.json` under the
project *plus* every run location the project record knows about, filter to
`status === 'harvested'`, optionally filter to a positive live-UAT verdict, and copy into
`projects/<p>/exports/<YYYY-MM-DD>-<slug>/`:

- `images/` — **flat**, named `<subject-slug>--<run-id>.png`. **The disambiguator is mandatory**:
  today's filenames are unique only *within* a run, so flattening two runs **will** collide, and
  `FileAuthor.write` overwrites without complaint.
- `export.json` — a manifest of manifests: per image, its source run, prompt text, the exact primer
  that produced it, generation time, verdict.
- `README.md` — addressed to the receiving human or tool, in the spirit of `design-projects`'
  `DESIGN-HANDOFF.md`.

Properties: **a copy, not a move** (runs stay put, provenance survives); **not a git operation** (it
is a handoff to a tool that has never heard of this repo — which is also why it must work under the
gitignore policy above); **no ImageDrip-specific structure inside `images/`**; and **if a manifest
references a missing file, `export.json` records the miss** — a partial export that looks complete
is exactly the forbidden failure.

`run.export` does not exist as a verb, and `exports/` is not in the v3 layout. Both are new.

### 4.9 What Strand 3's checks did NOT establish

- **The app was never run.** Every statement about current behaviour is source-reading plus the
  on-disk residue of past runs.
- **This is the M4 Mini only.** Roamy is the declared source of truth for media and refuses port 22.
  An empty `i-*` here is **not** evidence it is empty on Roamy or the M2.
- **GitHub was not queried.** Whether the `appydave-image-projects` org exists is unknown — **an
  absent org and an empty org look identical from here.** The seven `v-*` remotes are verified only
  as *configured origins*; no fetch was performed, so they are not proven to resolve.
- **No sync/status script was executed** — content verified, behaviour not.
- **The 62-commit / 40 MB figures are one project over three runs** — a rate, not a projection.
- **The `find` over `~/dev/image-projects` IS exhaustive** for this machine — "five children, seven
  files, no git" is conclusive here and only here.

## 5 · Strand 4 — drift

> **Provenance note.** Mixed, and worth stating precisely. I did the first pass of this strand
> myself after the assigned agent went idle three times; it then delivered in full, and its report
> materially improved several conclusions here (the prompting-guide contradiction, the upload
> ceiling, the two-metric experiment, the CDP mechanism).
>
> **Source quality is uneven and is marked at each claim.** `help.openai.com` and `openai.com` return
> **HTTP 403 to direct fetch**. Claims from those domains reached this document either through a
> search tool's synthesis or through the `r.jina.ai` text proxy — **in neither case is it wording
> read directly from the page.** The `developers.openai.com` cookbook and the CDP/Electron docs
> **were** fetched directly and are the strongest sources in the strand. Two help-centre URLs 404'd
> *through the proxy*, and **article-moved and proxy-failed are indistinguishable** from here.
>
> **No one has run the app or looked at a generated image.** Both drift phenomena are taken as David
> reported them. Nothing in this section is empirical evidence about ImageDrip's actual output.

### 5.1 The app's existing anti-drift mechanism — which nobody in the design session knew about

**ImageDrip already implements the exact thing the session spent its longest stretch designing.**

- `chunkSize: 18` (`batch-runner.ts:57`), commented *"re-prime a fresh chat every ~15–20 (plan §3)."*
- `batch-runner.ts:544-548`: **"Chunk boundary → re-prime a fresh chat to fight drift"** — at every
  18 harvested images, `primeThenContinue(false)` runs.
- `primeThenContinue` (`:380-400`) calls `harness.newConversation()`, waits for load, re-posts the
  primer, waits for it to settle, and resumes feeding.
- The boundary is recorded — `recorder.reprime(harvestedCount)` (`:383`).

So the answer to *"how do you fix drift from a new conversation?"* is already in the product: **you
re-post the primer.** Jan proposed it in the session; the app has done it since v1.

**And it has never once run.** All three real manifests carry `reprimes: []` (§1) — no run has
exceeded 18 images. **My check establishes only that these three runs never re-primed.** It does not
establish the path works, and it does not establish it is broken. **Treat re-prime as BELIEVED, not
BUILT** — which matters, because the whole drift strategy rests on it.

**Two numbers for one mechanism.** Jan proposed 6–8 per run; the code says 18. Nobody in the room
knew they were arguing about a tunable that already exists (`RunConfig.chunkSize`, `ipc.ts:263`).

### 5.2 David's reference-image proposal — already specified twice, never built, and closer than it looks

Not a new idea. It is in the plan from **day one**:

- `imagedrip-plan.md:56` (2026-07-18): *"Chunking + carry-forward — every ~15–20 images → new
  conversation, re-post the primer **(and carry reference images from the prior chat)** to fight
  drift."*
- `ux-and-workflow.md:101-102` (2026-07-19): *"**Re-prime carry** — v1 re-primes with Brand+Project
  text; carrying prior reference images into the new chat is a **fast-follow** once ref-image support
  lands."*
- `domain.ts:35`: `refImage?: string` — *"Deferred (model allows it)."*

**Can the harness attach an image today? No.** The harness's entire public surface is `attach`,
`setBounds`, `setVisible`, `newConversation`, **`feed(prompt: string)`**, `harvest`, `stop`,
`probeEngine`, `setStallMs` and four event subscriptions. There is no file-attach method, no
`input[type=file]` handling, no `DataTransfer`. The only file-shaped references in
`chatgpt-selectors.ts` concern ChatGPT converting a **large text paste** into a "Pasted text" chip.

**But the gap is much smaller than "not buildable", and this is the strand's most useful finding.**
Read `feed()` (`webview-harness.ts:255-287`):

```
clipboard.writeText(prompt)     ← the ONLY text-specific line
locateInput() → click()
paste()                         ← webContents.paste() — the real Edit>Paste command
await composer has text OR hasAttachment    ← already understands attachments
submit()
await composer is empty AND !hasAttachment
```

Three things follow:

1. **`paste()` is payload-agnostic.** It runs `webContents.paste()`, deliberately chosen over a
   synthesized Cmd+V because the latter is *"a NO-OP into a contenteditable composer"*
   (`:471-476`). It pastes whatever is on the system clipboard. Electron's `clipboard` module has
   `writeImage()` alongside `writeText()`.
2. **The composer reader already reports attachment state** —
   `hasAttachment: Boolean(document.querySelector(S.composerAttachment))`
   (`webview-preload.ts:161`). The post-condition machinery for "something non-text landed in the
   composer" exists.
3. **The ToS posture is unchanged.** A pasted image travels the same trusted-input pipeline as a
   pasted prompt. This is not a new class of write.

So a reference-image feed is plausibly: `clipboard.writeImage(...)` → click → paste → await
`hasAttachment` → `writeText(prompt)` → paste → submit.

**What this analysis does NOT establish**, and each of these could sink it:

- **That ChatGPT's composer accepts a pasted image at all**, rather than requiring the file picker.
  Empirical; untested.
- **That `S.composerAttachment` matches an *image* chip.** It was written for the "Pasted text"
  chip. If it does not match, `feed()`'s post-condition sees an empty composer and throws — and the
  failure would look like the known paste-didn't-land bug, not like an unsupported feature.
- **That the submit post-condition survives** — it requires `!hasAttachment` after Enter. If an
  image chip clears on a different schedule, a successful send could read as a failure.

**Two candidate mechanisms, both grounded in vendor primary sources:**

| | Mechanism | Cost | Risk |
|---|---|---|---|
| **(a)** | **CDP `DOM.setFileInputFiles`** via `webContents.debugger` — [CDP DOM domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/) (not marked experimental), [Electron debugger](https://www.electronjs.org/docs/latest/api/debugger) | A new `fileInput` selector, one preload channel, one `WebviewInbound` variant | Bypasses the paste question entirely. **Open:** whether a CDP-set file satisfies the repo's invariant #1 (trusted input, never JS `.value=`). The page's change handler fires naturally, so it probably holds — **unverified, and this is exactly the class of thing this repo insists on proving** |
| **(b)** | **`clipboard.writeImage()`** + the existing `wc.paste()` — [Electron clipboard](https://www.electronjs.org/docs/latest/api/clipboard) | ~10 lines | Reuses the mechanism `feed()` already probe-verified. **Unverified:** whether ChatGPT's composer accepts a *pasted* image |

**Two hazards that bite on day one:**

1. **`paste()` calls `selectAll()` first** (`webview-harness.ts:482`). Order matters — attach the
   image, *then* paste the text. A `selectAll` in the contenteditable *should not* touch a chip
   outside it. **Unverified, and getting it wrong silently destroys the attachment.**
2. **The submit post-condition inverts.** `feed()` requires `!hasAttachment` after Enter
   (`webview-harness.ts:276`), and `composerAttachment` is marked **⚠️ UNVERIFIED** in
   `chatgpt-selectors.ts:76` on the reasoning that erring broad is safe because *"a false positive
   only means `feed` accepts a paste it could not see as text."* **That reasoning inverts the moment
   attachments are real.** An over-matching selector makes `!hasAttachment` never true, so **every
   attached feed reports "Enter did not submit it" on a message that was actually sent** — the exact
   absence-looks-like-failure bug `feed()`'s verification was written to end. Pin that selector
   against a live attachment before anything else.

**Verdict: buildable, contained, and gated on two ten-minute probes.** There is direct precedent for
running them — `probe/probe-feed.cjs` is cited at `webview-harness.ts:471` as how the team
discovered that synthesized Cmd+V was a no-op. **Probe before estimating**, and it is David's ruling
either way, because it touches the surface this repo guards hardest.

**A quota ceiling that decides the design.** OpenAI's File Uploads FAQ documents **80 file uploads
per 3 hours** (via proxy — see §5.3 warning). At ImageDrip's ~90s/image, per-prompt reference images
would need ~120 uploads per 3 hours — **over the limit**. Attaching only at chunk boundaries costs
2–7. **So the boundary-only design is not merely tidier; per-prompt `refImage` breaches a documented
ceiling.** It is also better targeted: the boundary is precisely where image context is lost, and
mid-chunk the conversation still has it.

**A design decision the proposal hides: *which* image?** The **first** image of the previous flow
anchors to where the look started; the **last** anchors to where it had already drifted. Nobody has
said. **Anchor to the first, or to an operator-blessed one — never "the most recent", which is the
drifted end by definition**, and would laminate the drift in place rather than correct it.

### 5.3 What the official documentation actually supports

⚠️ **All items in this subsection come from a search tool's synthesis of `help.openai.com` /
`openai.com` pages that returned 403 to my direct fetch. I have not read the source wording myself.
Treat them as leads to confirm in a browser, not as citations.**

| Mechanism | What was surfaced | Bearing on ImageDrip |
|---|---|---|
| **Reference / style images** | Officially supported in ChatGPT — applying one image's style to another "while keeping the same layout and objects" | **Supports David's proposal.** The mechanism is documented as a product feature, not a hack |
| **In-conversation consistency** | Native 4o image generation "can build upon images and text in chat context, ensuring consistency" | This is what the primer already exploits |
| **Drift is acknowledged officially** | Guidance that "repeating the most important details can help prevent the image from drifting as you refine it," with step-by-step revision | **Supports re-priming as the correct strategy** — and supports repetition *within* a conversation, which ImageDrip does not currently do |
| **ChatGPT Projects — project-only memory** | Chats **can reference other conversations in the same project**, but not outside it; project files and instructions are shared across all chats in the project | **See §5.5 — this is the third option nobody raised** |
| **`input_fidelity`** | An **API** parameter controlling how strongly input-image detail is preserved | ❌ **Out of reach.** ImageDrip cannot use the API — founding constraint |

#### 🔴 OpenAI's own prompting guide contradicts ImageDrip's founding assumption

**This is the single most important primary source in the strand, and it was fetched directly — not
through a proxy.** From the [GPT image models prompting
guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide):

> *"describe what must stay consistent (style cues) and what must change (new content), and add hard
> constraints like background, framing, and 'no extra elements' to prevent drift."*
>
> *"For edits, use 'change only X' + 'keep everything else the same,' and **repeat the preserve list
> on each iteration to reduce drift**."*

Now ImageDrip's founding assumption, `src/shared/domain.ts:243`:

> *"Short prompts inherit this; they are **NOT re-baked**."*

**These are head-on opposed, and only one of them is documented.** The whole primer architecture —
post once, then feed short prompts that inherit — is a bet against the vendor's stated advice.

The API guide's [Limitations
section](https://developers.openai.com/api/docs/guides/image-generation) says the same thing from
the failure side:

> *"**Consistency:** While capable of producing consistent imagery, the model may occasionally
> struggle to maintain visual consistency for recurring characters or brand elements across multiple
> generations."*

⚠️ **That bullet documents the API models (`gpt-image-*`).** OpenAI does not publish a statement that
ChatGPT's in-UI generation uses the same family, so **applying it to the hosted UI is an inference**
— reasonable, still an inference.

#### There is no seed. Anywhere.

Checked against the API parameter list specifically: **no seed parameter exists in the API, and
therefore certainly not in the UI.** There is no reproducibility knob in this product family at any
level. **Any drift plan premised on "pin the seed" is premised on a control that does not exist.**

#### Context windows, and the unknown that decides the batch question

From [ChatGPT pricing](https://openai.com/chatgpt/pricing/) (via proxy): total context is **54K on
Plus**, 27K Free, 128K Pro (instant models).

> **The load-bearing unknown: does an in-chat generated image consume context tokens, and how many?**
> Nothing official says. If ~zero, an 18-image run (primer ~900 tokens plus 18 short prompts) is
> trivially inside 54K and **context pressure cannot be the drift mechanism**. If images cost 1–2K
> each as re-entrant context, 18 images is 18–36K and a Plus account is near the wall by image 18.
> **These two worlds predict opposite answers to the batch-size question, and documentation cannot
> distinguish them.**

**On long-conversation behaviour I found no usable primary source.** Searches returned Realtime-API
truncation semantics and community forum threads, neither of which describes the ChatGPT web UI. One
line was surfaced suggesting that when a conversation grows too long OpenAI **summarises and
continues** rather than truncating. **If that is true of the image UI it is a strong candidate
explanation for the lime/lemon failure** — a summary of "smoothie images in this style" is exactly
the kind of compression that would discard the distinction between two similar subjects while
preserving the style. **I could not confirm it, and I am recording it as a hypothesis, not a
finding.**

### 5.4 The batch-size intuition, assessed honestly

#### They are two ends of one dial, pointed opposite ways

**This is the sharpest correction to the session's framing.** David said the two drifts are *"both
the same problem."* At the level of *"the operator didn't get what they specified"* he is right.
**Mechanically they are opposites:**

- **Intra-conversation drift = *too much* shared context.** The chat locked onto a pattern and
  samples near it. Limes-vs-lemons is exactly that.
- **Cross-conversation drift = *too little* shared context.** The new chat lacks the images that
  were holding the look.

**The remedy for each causes the other.** And ImageDrip already ships the dial: `chunkSize`. Turning
it down cuts intra-drift by re-priming sooner and **multiplies the conversation boundaries**, i.e.
multiplies cross-drift exposure. **Jan's "6–8" is `chunkSize: 7`. It buys one drift by paying for
the other**, and nobody has measured which side of the trade they are on.

**One genuine difference worth preserving, because it is not about drift at all.** Jan's is a **run
cap** — stop, operator inspects, re-runs. `chunkSize` is an **automatic re-prime** — nobody looks.
**The inspection gate is real value and it needs no drift evidence whatsoever.** If a review gate
every 6–8 images is what Jan actually wants, it should be argued that way and it wins on its own
merits. *(Note it would be a new field: `RunConfig` has no `limit`, so `run.start` runs the entire
queue. v5 Phase 1.1 records `RunConfig.limit` as valid and unbuilt.)*

**Jan's 6–8 is folklore. So is the code's 18.** Neither has documentary support and neither has been
measured. `imagedrip-plan.md` gives no derivation for ~15–20; it simply asserts it. The design
session's 6–8 was likewise asserted. **Nobody is wrong, because nobody has evidence.**

Note the asymmetry: re-priming is not free. Every boundary costs a `newConversation()`, a load
settle, a primer post and a primer settle, and it **discards the in-conversation consistency the
primer bought**. Too small a chunk trades drift for churn. That is a real curve with a minimum, and
nobody knows where it sits.

**A cheap experiment David could actually run** — one project, one primer, one afternoon:

| | |
|---|---|
| **Variable** | `chunkSize` ∈ {6, 12, 24} — already a `RunConfig` field, no code change |
| **Control** | Same brand, same template, same 24-prompt queue, same day, same account |
| **Runs** | 3 (one per chunk size) = 72 images |
| **Observables** | **Two metrics, and one will not do** — collapse and wander have opposite signs, so a single "consistency score" nets them to zero. **`D_prev(i)`** = distance(image *i*, image *i−1*) is the **collapse** metric; falling `D_prev` within a chunk is the limes/lemons signature. **`D_first(i)`** = distance(image *i*, first image of its chunk) is the **wander** metric; rising `D_first` is style drift. Distance by perceptual hash or colour histogram — no ML dependency, computed offline over the PNGs already sitting in `<outputDir>/<runId>/`. You want a **trend and a discontinuity**, not an absolute |
| **Reads as** | In the `chunkSize: 6` arm, `D_prev` should decline across positions 2→6 *within* each chunk and **jump at the boundary** (7-vs-6, 13-vs-12). **That reset is the whole test.** No within-chunk trend and no boundary jump ⇒ position-in-conversation is not driving drift and 6-vs-18 is a non-question |
| **Free bonus** | `D_first(7)` measured against chunk 1 shows how far the re-prime *itself* moved the look. **A large boundary jump is simultaneously evidence that intra-drift is real and that cross-drift is expensive** — the §5.4 trade-off, in one plot |
| **Confound to kill** | **Prompt order.** An alphabetical or thematically clustered list makes adjacent prompts semantically adjacent, and `D_prev` falls for reasons that have nothing to do with drift. Shuffle once, reuse that exact order in every arm |
| **Prerequisite** | `reprimes` must actually fire — currently unproven (§5.1). Run the `6` arm first: it is the only cell guaranteed to cross a boundary |

**This experiment also settles David's *"they're both the same problem."*** If drift is
within-conversation, re-priming more often helps and reference images are optional. If it is
between-conversation, re-priming more often makes it **worse**, and reference images become the
whole answer. **They are not the same problem, and the experiment tells them apart.**

### 5.5 The three proposals, and a fourth

**Jan's "re-share the first conversation's context."** This is what the app already does
(`primeThenContinue`). **His self-doubt is well founded, and the documentation implies why:** the
primer is *text*, and the thing being preserved is *visual*. Re-posting a description reconstructs
the instruction, not the result. Two conversations given identical text will agree on "warm daylight,
pale oak bench" and can still disagree on everything the text does not pin down. **Jan talked himself
out of the right answer for the right reason.**

**David's "primer + one or two reference images."** Better grounded — it carries the *output*, not a
description of it, and reference-image style transfer is a documented ChatGPT feature (§5.3). It is
also his own plan from 2026-07-18. Buildable per §5.2, unverified.

#### ⭐ The fourth option, and on the evidence the strongest: re-bake the invariants into every prompt

**Nobody raised it, it is the cheapest thing on the table, and it is the only remedy here that a
primary source states imperatively** (§5.3): *"repeat the preserve list on each iteration to reduce
drift."*

Concretely: a short **invariant block** — two to four lines of non-negotiables — appended to *every*
prompt, not just the primer. The precedent is already in the schema: `Template.negatives`
(`domain.ts:84`) is composed into the primer under a named heading (`NEGATIVES_HEADING`,
`domain.ts:209`). A sibling `Template.preserve`, composed into every **prompt**, is a small change
with an existing pattern to copy.

Why it outranks both proposals:

- **It is the only one OpenAI states as an instruction** rather than implies.
- **It attacks both drifts at once, which nothing else here does.** Intra: the invariants are
  restated before the pattern can dominate. Cross: **the invariants travel with each prompt**, so a
  fresh conversation never runs on a primer it half-remembers — *exactly the gap Jan doubts his own
  answer over.*
- **No webview change, no attachment path, no CDP, no new selector, no probe.** String
  concatenation.
- A few hundred tokens per prompt against 54K. Effectively free.

**And it is the only thing on the table that addresses limes/lemons at all.** That failure is
**subject collapse**, not style drift — the model stopped honouring the difference between two
similar subjects. Per the same guide, the remedy is stating what must *change*: a per-subject
differentiator (*"must read unmistakably as a lime — green skin, not yellow"*). ImageDrip's prompts
today are bare labels — `parsePromptList` derives the subject from the first three words
(`domain.ts:299`) — giving the model nothing to hold the distinction with. **Neither Jan's proposal
nor David's touches this**, because both aim at cross-conversation drift and limes/lemons is
intra-conversation.

**The fifth option, which nobody raised: ChatGPT Projects.** Project-only memory means chats inside
a project **can reference other conversations in the same project**, and project files and
instructions are shared across all of them. That is a first-party, documented mechanism for exactly
the thing ImageDrip fakes by re-pasting a primer — and it operates at the level of the *conversation
container*, which is the level David's model is missing.

**Do not get excited yet.** Three hard caveats:

1. **Unverified as a fetch** — surfaced by search, page 403s (§5.3 warning applies in full).
2. **Unknown whether it carries *visual* style** or only textual context. The documented claim is
   about conversation reference, not image consistency. **This is the whole question, and I could not
   answer it.**
3. **Unknown whether the harness can create or navigate into a project.** `newConversation()` is a
   `loadURL`; whether a project-scoped chat URL is reachable the same way is untested.

**If it does work, it is strictly better than both proposals** — it is the platform doing the
carrying, with no primer re-post and no image paste. **It is worth one manual test before any code
is written**: put two conversations in one ChatGPT project, prime only the first, and see whether the
second holds the look. That is a ten-minute check by hand, and it could invalidate a fortnight of
building.

### 5.6 The gap neither proposal addresses

Both proposals are about **starting** a new conversation well. Neither addresses David's Flow A —
**repairing drift inside a live conversation** by talking to ChatGPT directly, then harvesting the
corrections. The app has no representation for that (§2.2, requirement #3), and the images it
produces arrive with no queue row to attach to. **That is a modelling gap, not a drift gap**, and
Candidate A's `freehand` segment is the fix.

## 6 · Where the strands disagree

Left visible rather than reconciled.

### 6.1 One folder, or a set of folders? — Strand 1 vs Strand 3

**Strand 1** wants a run to become **reopenable**, so one deliverable is one run in one folder. That
is what keeps the Star's *"a run is the unit"* literally true (§7.2).

**Strand 3** wants `Project.runLocations: string[]` — a **set** — because a project already cannot
represent "my images are in more than one place," and export is blocked on that single field.

**These are not the same instinct.** A pulls toward consolidation; the other accepts scatter as
permanent and indexes it.

**They are both right, about different time directions.** Reopening fixes *future* runs. The set
fixes *existing* history, which is already scattered across three run folders, 25 orphans in
`userData/harvest/`, and — under the proposed layout — a `~/Pictures` corpus that a prior decision
says will not be migrated. **Build both, and say which is which:** reopen is the going-forward
model; `runLocations` is the archaeology. If only one gets built, `runLocations` is the one that
unblocks export today.

### 6.2 The Segment model rests on a mechanism that has never run — Strand 1 vs Strand 4

Candidate A makes the **conversation boundary** a first-class record. The boundary is the re-prime.
**The re-prime has never fired in real data** (`reprimes: []` on all three manifests, §1, §5.1).

So Candidate A would formalise, persist and build UI on top of a code path with **zero production
evidence**. That is not a reason to reject it — the path is straightforwardly readable and clearly
intended — but it does reorder the work: **prove the re-prime fires before modelling it.** A single
24-image run at `chunkSize: 6` does that, and it is the same run Strand 4's experiment needs (§5.4).
One afternoon serves both.

### 6.3 What a segment *does* at its boundary is unresolved — Strand 4 vs itself

If ChatGPT **Projects** genuinely carry visual style across conversations (§5.5), a segment boundary
becomes cheap: open a new chat *inside the project* and carry on. If they do not, the boundary must
re-post the primer and — per David — paste reference images.

**The Segment record is correct either way**; only its behaviour changes. So the model is safe to
ratify before the Projects question is answered, and the boundary behaviour is not. **Do not let the
second block the first.**

### 6.4 A convergence worth naming — Strand 1 and Strand 2 arrived at the same object

Strand 1 called it a **Segment boundary**. Strand 2 called it **`run.reseat`**, the runner-mediated
verb that closes the last parity gap without breaching §4.

**They are the same operation, reached from opposite ends** — one from "what can the data model not
express", the other from "what can a person not do by hand". When a model gap and a parity gap name
the same missing thing, that is the strongest signal in this document about what to build first.

### 6.5 Where the design session disagrees with the repo

Not a strand conflict, but the most consequential disagreement of all: **three of the four problems
the session raised were already diagnosed in this repo, and in two cases already fixed** (§0). The
session was reasoning from Jan's mock and from memory of the app, not from the app.

**That is a process finding, not a fault.** The mock is a fair reading of a product David has not
used since 2026-08-11, and the two shipped fixes landed on 2026-08-10 with no UI change to announce
them. But it means **the mock should be re-based on the current build before any more design time
goes into it** — otherwise the next session re-solves Item 2 and Item 3 as well.

## 7 · Does any of this contradict the North Star?

David opened the door to challenging the Star. Taking that seriously: **Strand 1 produces one
genuine finding about the Star, and it is not a contradiction — it is an internal tension the Star
already contains and does not resolve.** The rest is the app failing the Star, not the Star being
wrong. *(Strands 2–4 may add to this section.)*

### 7.1 The Star's test has two halves that can both fire, with no precedence rule

> *"If it removes a manual step, **widens what a run can express**, or lets an agent do something a
> human had to do — it fits. **If it adds a control to learn, it does not.**"*

A per-subject variation count (§2.6) satisfies the first clause exactly — it widens what a run can
express — and violates the second exactly — it is a control the operator must learn. The Star gives
no rule for which wins.

This is not new. **v5 §1.7 hit the same fork over interpolation variables** and resolved it by
argument rather than by rule: *"pure less-touching — twelve near-identical blocks collapse to one
shape plus twelve value sets."* The same argument carries variations. But an argument used twice is
a missing rule.

**Proposed amendment, for David to rule:** add a precedence line to the Star's test —

> *When both clauses apply, the widening clause wins if the control replaces work the operator is
> doing by hand today. A control that collapses repetition is not a control to learn; a control that
> exposes a new dimension is.*

Under that rule, variation counts fit (David is hand-authoring the variations today), and the rule
also cleanly excludes the kind of settings panel v5 §4 already rules out.

**This is a question, not a change.** The Star's parity clause was ruled four days ago and the Star
itself is six days old; a real tension in it is news.

### 7.2 "A run is the unit" — survives, conditionally

> *"A run is the unit. Images are harvested automatically and land in a project folder belonging to
> that run."*

The research shows the **deliverable** is not the run — six Filipino heroes, two run folders (§1).
That reads as a contradiction, and it is not, **provided Candidate A is taken**: making a run
reopenable means one deliverable becomes one run again, and the Star's sentence stays literally
true. **A fixes the Star's claim rather than challenging it.**

**It breaks conditionally.** If David ever wants v5 §5 Q4 — *the same twelve subjects through a
different template* — the deliverable spans projects, and then both "a run is the unit" and "a
project folder belonging to that run" fail at once. That is Candidate B territory (§2.5), and it
would need the Star amended, not just the code. **Not a live conflict. Flagged so it is recognised
if that request ever arrives.**

### 7.3 The parity rule is satisfiable only under the new model — a supporting finding

The parity rule (ruled 2026-08-10) says every automated step is operable by hand. **One automated
step has no manual equivalent, and the repo already knows it.** From commit `1a77ba2`:

> *"One parity gap remains and is NOT built here: the Auto loop opens a fresh conversation and
> re-primes at the chunk boundary, and there is no manual equivalent."*

That step is precisely the segment boundary. Under Candidate A a segment is a first-class record, so
"start a new segment" becomes a nameable button with a nameable record behind it. **The model makes
the parity rule reachable; today it is not.**

**Parity runs both ways, and the return leg has a hole.** *Every manual step is automatable.*
David's freehand repair — typing a correction straight into ChatGPT — is a manual step, and it is
automatable in principle (the app can compose and feed a correction through the same `feed()` path).
But when **he** types it, ImageDrip does not know it happened. The image may or may not be harvested
depending on the `seen` gate, and no record says which. That is not a ToS problem — a human at a
keyboard is exactly what the mitigation models — it is a **state problem**, and it is requirement #3
(§2.2) restated from the parity side.

### 7.4 "Agents are first-class operators… through API endpoints they can drive directly"

**Not a contradiction, but the word *directly* is carrying weight it has not earned.** There is **no
internal binding** (§3.1): the app's own chat pane reaches its own handlers through a CLI child
process, a stdio MCP proxy and a loopback HTTP hop — three processes to call a function in the same
address space. That is a real cost in latency and failure modes, and it is invisible in the Star's
sentence.

It is also the *correct* topology for the pane, because the containment boundary is the point. **No
amendment needed** — but if "directly" ever comes to mean "in-process", that is a second binding to
build, not a tightening of the first.

### 7.5 "Single-user, distributed widely" — Strand 3 serves the Star rather than straining it

The folder proposal (§4.5) puts one private git repo per brand under a GitHub org, registered in
`locations.json`. That is precisely the mechanism the Star's *"it goes to clients, to Mary, to Jan,
and to David"* requires, and it is the same mechanism `video-projects` already uses for seven
brands. **Reported as alignment, not tension** — the folder decision is quietly also the
distribution decision, and it is cheaper to make now than after a second person has an install.

### 7.6 "Nothing may fail silently" — the Star is right and the app does not honour it

No tension. The finding is that the current model **cannot** honour the rule (§2.8): two conflicting
status enums, no failure state in the shared one, and `outcome` absent on three of three real
manifests. The Star is not what needs changing here.

## 8 · Questions only David can rule

Ordered by what they block. Every one of these is a question this research **could not** answer for
him, either because it is a preference, a risk appetite, or a fact about the world nobody has
measured.

### Blocking — the model cannot be built without these

| # | Question | Why it is his |
|---|---|---|
| **1** | **Ratify or reject Candidate A** — a `Segment` record below `Run`, and `Run` becomes reopenable (§2.4). | It is the load-bearing choice. Everything in §2, §3.4 and §6 assumes it. |
| **2** | **Name the segment.** "Flow" collides with the `▶ Run flow` button label and would make one word do two jobs — the exact failure `Template` was extracted to fix (§2.3). | A naming ruling, and he ruled "theme → flow" without knowing about the collision. |
| **3** | **Is `Theme` retired or renamed?** It is a vestigial `{name, prompts[]}` wrapper used only to mint run ids (§2.3). | Deleting a concept is his call. |

### Blocking the folder decision

| # | Question | Why it is his |
|---|---|---|
| **4** | **Ratify the layout in §4.5** — container → `i-<brand>` repo → `templates/` + `projects/<p>/` → `runs/` + `exports/`. It confirms Option B's shape and invalidates Option A as a *root* while keeping its dated run folder as the *leaf*. | It commits the estate, not just the app. |
| **5** | **Do generated images go in git? Recommend no** (§4.7) — this **reverses v3 Decision 5**, which he made on 2026-08-04. 40 MB of `.git` for 18 images is the evidence. | Reversing his own decision. |
| **6** | **`i-shared` — resurrect or not?** v3 Decision 2 depends on it for universal templates; it was created and deleted on 2026-08-14. Recommend not, with shared templates in `~/dev/media-shared/templates/` (§4.7). | Two of his own decisions contradict each other ten days apart. |
| **7** | **What happens to the 25 orphans** in `userData/harvest/` — 71 MB, unattributable, currently load-bearing as a thumbnail fallback (§1). | Deletion. |

### Blocking the drift strategy

| # | Question | Why it is his |
|---|---|---|
| **7a** | **Adopt `Template.preserve` — re-bake a short invariant block into every prompt?** (§5.5) Cheapest item in this document, best-supported by primary sources, attacks both drifts, needs no webview change. **But it reverses `domain.ts:243`, a founding assumption.** | Reversing a founding assumption. |
| **8** | **Run the chunk-size experiment?** (§5.4) One afternoon, 72 images, and it settles whether drift is within- or between-conversation — which are **opposite strategies**, not the same problem. | Nobody can answer it from documentation. It must be measured. |
| **9** | **Test ChatGPT Projects by hand first?** (§5.5) Ten minutes: two chats in one project, prime only the first. If Projects carry the look, it beats both proposals and removes work. | It could invalidate a fortnight of building, and only he has the signed-in account. |
| **10** | **Authorise a reference-image paste path?** (§5.2) Buildable and small — `clipboard.writeImage` through the existing verified paste pipeline — but it touches the one surface this repo guards hardest, and three of its post-conditions are unverified. | It is a change to the ToS-mitigation surface. |

### Needed, but not blocking

| # | Question | Why it is his |
|---|---|---|
| **11** | **Amend the Star's test with a precedence rule?** (§7.1) Its two halves both fire on the same feature and it says which wins for neither. | It is his Star, ruled six days ago. |
| **12** | **Rule §5.1 of the design notes** — global templates with brand tone as the override channel (recommended, free, already shipped), or build the brand→template relation Jan's mock implies (§2.7). He parked this himself. | Parked by him, explicitly. |
| **13** | **Accept the §5.2 cardinality change** — one prompt → many images — knowing it touches the harvest gate and is cockpit by the Star's test (§2.6). | It is his workload that demands it and his Star that objects. |
| **14** | **Invert `isExposed()` to an allowlist?** (§3.2) The denylist has already leaked one verb. Not exploitable today; accidentally safe rather than designed safe. | A security posture change. |
| **15** | **Re-base Jan's mock on the current build** before more design time goes into it (§6.5). | It is a call about someone else's work. |
| **16** | **Guard or delete the two unguarded preload paths** — `feed` and `newConversation` (§3.3). Both latent, both bypass every latch. | Touching the guarded surface. |
| **17** | **Show mode-conditional controls disabled rather than absent?** (§3.4) The app defaults to Auto, which hides its own parity control — which is why this gap keeps being rediscovered. | A UX ruling with a parity-rule justification behind it. |

### Small honesty bugs found in passing — not rulings, just fixes

- ~~**"Declined" and "expired" are the same 403.**~~ **✅ FIXED in Phase 1 (1d).** `ask()` now
  returns MCP elicitation's three-way `accept` / `decline` / `cancel`; only a human pressing
  something can produce `decline`. A timeout, a missing window, a superseded confirm and a throwing
  renderer are all `cancel`, and the surface answers **`403 confirm_unanswered`** whose message
  opens *"This is NOT a refusal: do not tell the user they declined."* All three still deny — what
  changed is that the denial stopped inventing a human decision. `ChatGateDecision.allow` stays a
  boolean, because the *renderer's* channel genuinely is binary; it is the caller's channel that
  needed the third case.
- **`server/discover` is a mandatory RPC in MCP 2026-07-28** and the proxy answers `-32601 Method
  not found` to it. The documented back-compat path for handshake-based revisions should cover it;
  **untested.**
- **No MCP tool annotations at all.** `readOnlyHint` / `destructiveHint` / `idempotentHint` are the
  standardised slot for the read/write split ImageDrip has only as a naming convention — and the
  spec's default for an unannotated tool is *"non-read-only, potentially destructive, non-idempotent,
  open-world."* So today `domain.get` and `project.delete` look identical to any client safety layer.
  Worth noting `run.stop` is idempotent and always-reachable **by design**, and nothing tells an
  agent that — stopping is the one thing it should retry freely.

### Named as unanswerable, rather than filled in

- **Whether ChatGPT Projects carry *visual* style across conversations.** The documented claim is
  about *conversation reference*, not image consistency. No primary source addresses the image case.
  **Only an experiment answers this.**
- **Whether the ChatGPT web UI summarises or truncates a long conversation**, and therefore whether
  the lime/lemon failure is a compression artefact. One search result suggests summarisation; the
  page 403s. **Hypothesis, not finding** (§5.3).
- **Whether ChatGPT's composer accepts a pasted image**, and whether `S.composerAttachment` matches
  an image chip. Both empirical, both untested, and either one sinks §5.2 (§5.2).
- **Whether the `appydave-image-projects` GitHub org exists.** Not queried. **An absent org and an
  empty org look identical from here** (§4.9).
- **Whether `~/dev/image-projects/` is empty on Roamy or the M2.** Checked on the M4 Mini only, and
  Roamy is the declared source of truth for media (§4.9).
- **What wrote the `image-projects` container docs at 10:26 today.** Most plausibly the
  `open-design-workflow` session; **not established** (§4.0).
- **The correct chunk size.** 6–8 and 18 are both folklore. Neither has ever been measured (§5.4).
