---
doc: research
project: imagedrip
created: 2026-08-08
for: the session that builds v4 WP4 — the in-app `Context ｜ Chat` pane
status: research complete. Two containment decisions taken 2026-08-08 (§0.4) — the build is unblocked.
  No pane code was written; `src/renderer/src/App.tsx` was not touched.
---

# WP4 — the in-app chat pane: research brief

**Read this before designing anything.** WP4 is a *consumer* of a surface that already exists and is
already proven headlessly. Most of what looks like new work is wiring. The genuinely new parts are
few, and one of them — the human gate — is load-bearing and does not exist in any form yet.

---

## 0 · Located paths

The three things the brief was asked to find, with what was actually established rather than assumed.

### 0.1 · The brain on integrating chat clients into applications ✅

**`/Users/davidcruwys/dev/ad/brains/software-factory-research/`** — a deliberate set of three, and
the set is the answer rather than any single file:

| Absolute path | What it holds |
|---|---|
| `/Users/davidcruwys/dev/ad/brains/software-factory-research/resident-chat-operator-pattern.md` | ⭐ **The primary.** "The app hosts its own chat operator." §2 is load-bearing and overturns the obvious assumption: Open Design uses **no** `@anthropic-ai/*` dependency — it spawns the user's own installed CLI. Verified at source, 2026-08-06. |
| `/Users/davidcruwys/dev/ad/brains/software-factory-research/chat-operated-workbench-pattern.md` | Defines the three panes — the shape WP4's UI lands in. |
| `/Users/davidcruwys/dev/ad/brains/software-factory-research/external-control-surface-pattern.md` | The API underneath the panes — this is WP1, generalised. |

**Secondary, and worth reading for the gate specifically:**
`/Users/davidcruwys/dev/ad/brains/vercel/agent-ux-components.md` — chat UI components, AG-UI vs A2UI,
and **HITL approval flows**. It is the only located material about *approval gates rendered in a UI*,
which is exactly WP4's hardest piece (§5 below).

*Honest note:* the request said "the second-brain covering how chat clients are integrated into
applications." Two readings are defensible — `software-factory-research` (how an app hosts a chat
operator) and `vercel/agent-ux-components.md` (how chat client UIs are built). Both are recorded
because they answer different halves and the next session needs both.

### 0.2 · The two tickets ❌ NOT FOUND

**No two discrete tickets for this work exist.** Searched: the ImageDrip repo (`docs/`, `docs/specs/`),
all 100 brains under `/Users/davidcruwys/dev/ad/brains/`, `brains/plans/`, every `stories` /
`tickets` / `backlog` / `epics` directory under `~/dev/ad` and `~/dev/kybernesis`, and GitHub issues
on `appydave/imagedrip` (`gh issue list --state all` returns empty).

Rather than invent them, here is what does exist and plays the role:

| Found | Path | What it actually is |
|---|---|---|
| **WP4 and WP5** | `docs/requirements-v4-resident-chat.md` §9.5 | The closest match, and probably what was meant: exactly **two** deferred work packages — *WP4 — the Context｜Chat pane* and *WP5 — ImageDrip skills*. Work packages in a requirements doc, not standalone tickets. |
| The §7 acceptance criteria | `docs/requirements-v4-resident-chat.md` §7 | AC-1…AC-5. Ticket-shaped in substance — each is one testable turn. |
| The three pattern brains | §0.1 above | Design patterns, not tickets. |

**Recommendation:** treat §9.5's WP4/WP5 and §7's AC-1…AC-5 as the specification. If David meant
something else, he will know where it is — this should be asked, not guessed.

### 0.3 · The Open Design codebase ⚠️ NOT ON THIS MACHINE

- **Roamy:** `/Users/davidcruwys/dev/kybernesis/open-design` — **does not exist.**
- **M4 Mini (`100.82.235.39`):** `~/dev/kybernesis/open-design` — **exists**, at
  `blog-indexed-prod-11-g798a85e8d`.

This is the **second** cross-machine gap found in two days (the first was
`flilaunch/docs/flithumb-brief.md`, resolved by a `git pull` on 2026-08-07). Read it over Tailscale,
or clone it, before relying on it.

**It may not be needed.** Everything Open Design was the source *for* — the invocation, the five
mechanics, the stream protocol, the four traps — is already transcribed into
`docs/requirements-v4-resident-chat.md` §3 **and already implemented and tested** in
`scripts/claude-cli.mjs` + `scripts/claude-stream.mjs`. Go to the source to resolve a contradiction,
not to re-derive what is built.

---

## 0.4 · Decisions taken (David, 2026-08-08) — build to these

The two containment questions this brief opened with are **decided**. They were the stop boundary in
the original launch line; that boundary is now cleared and the next session builds.

### D1 · The gate is a per-client credential ⭐

**Chosen: option (a).** The in-app pane's MCP proxy gets its **own** credential, distinct from the
one in `control.json`. Main uses it to tell callers apart, which it currently cannot do at all.

```
pane's MCP proxy  ──▶ gated verb ──▶ main HOLDS the request
                                     ──▶ push a confirm to the renderer
                                     ──▶ human clicks Allow / Deny
                                     ──▶ proceed, or 403
terminal / curl / chat:probe ──▶ gated verb ──▶ today's behaviour (advisory metadata)
```

Why not (b) "gate every client": it would block `npm run chat:probe`, and the probe is the only thing
standing between WP4 and a false green. Why not (c) "ship advisory": `run.start` feeds a paid session
against OpenAI's ToS, and a gate the model can decline is not a gate.

**This is not a hole in AC-5.** The two mechanisms test different things and both are needed:

- The **UI gate** enforces that a *human* approves a gated verb originating from the pane.
- **`chat:probe` AC-5** tests that the *model* does not reach for a gated verb unprompted — model
  discipline, not transport. Unchanged by this decision, and must keep passing.

Implementation notes that fall out:

- The pane credential should be **per pane-session and passed to the proxy out of band** (env var),
  not added to `control.json` — the point is that possessing the file's token does *not* make you the
  pane.
- The held request needs a timeout, and it must **DENY on expiry, never allow**. A confirm that
  defaults open under load is the failure this is preventing.
- The confirm UI must account for the ChatGPT `WebContentsView` compositing **above all HTML**
  (`harness.setVisible(false)` exists for exactly this). A confirm the webview paints over is a
  confirm nobody sees.

### D2 · The CLI gets Read + MCP, no Bash and no Write

**Chosen: option (c).** Concretely, via the existing `buildArgs()` support:

| | |
|---|---|
| **Allowed** | `Read`, `Glob`, `Grep` + every MCP verb tool |
| **Disallowed** | `Bash`, `Write`, `Edit`, `NotebookEdit` |
| **Scope** | `--add-dir <brand-repo>` stays — Read is scoped and useful |

Rationale: §5.2's risk is that §4 ("the operator chat must never touch the ChatGPT webview") is
**structural at the MCP layer and absent at the Bash layer**. Removing Bash is what turns §4 from a
promise into a property. Reading the brand repo is most of the post-v3 value and is retained; the
chat still *writes* through the app's own verbs (`template.save`, `domain.save-project`), which carry
their own run-state locks.

> ⚠️ **This must fail CLOSED, and today's code would fail open.**
> `buildArgs()` gates every optional flag on `probeCapabilities()` (mechanic 3) — so on a CLI that
> does not understand `--disallowed-tools`, the flag is **silently omitted** and the agent spawns
> with **full tools including Bash**. That is the exact inverse of this decision.
> **WP4 must refuse to spawn** when the capability probe cannot confirm the tool-restriction flags,
> and say so in the pane. A containment control that quietly disappears on an old CLI is worse than
> none, because it is believed.

---

## 1 · What WP1–WP3 already give WP4

All built, all committed, all green. **None of it is throwaway scaffolding — WP4 consumes it.**

| Piece | Path | What WP4 gets |
|---|---|---|
| Control surface | `src/main/control-surface.ts` | Loopback HTTP, bearer-authed, publishes every `imagedrip:*` verb from the live IPC registry. 35 verbs today. |
| Verb policy | `src/main/verb-policy.ts` | `NEVER_EXPOSED`, `GATED_VERBS`, `ENGINE_REQUIRED_VERBS`, and per-verb "when to call" docs. |
| MCP proxy | `scripts/imagedrip-mcp.mjs` (324 ln) | A stdio MCP server with **zero logic** — every tool resolves to a `fetch()`. Tool list, schemas and confirm-first flags all come from `GET /v1/verbs`. |
| CLI spawn | `scripts/claude-cli.mjs` (248 ln) | `probeCapabilities()`, `buildArgs()`, `userMessageLine()`, `startClaude()`. All five §3 mechanics implemented. |
| Stream parser | `scripts/claude-stream.mjs` (313 ln) | Reduces JSONL to the **six** UI-facing events and handles all four traps. Exposes `sessionId`. |
| Headless proof | `scripts/chat-probe.mjs` (320 ln) | `npm run chat:probe` replays AC-1…AC-5 with no human, **checking every claim against the control surface rather than against what the agent said it did.** |
| Parser tests | `test/claude-stream.test.ts` + `test/fixtures/stream-{partial,nopartial,tooluse}.jsonl` | Recorded from the **real CLI (2.1.223)**, not hand-written. The recording immediately caught trap 2: the `assistant` wrapper arrives *before* `content_block_stop`, which a first-one-wins parser renders with its arguments missing. |

The parser already emits exactly the six events §3 specifies: `status`, `text_delta`,
`thinking_delta`, `tool_use`, `tool_result`, `usage`.

### Wiring vs genuinely new

**Wiring** (the surface exists; connect it):
- Spawning the CLI from main instead of from a script
- Rendering six event types in React
- Reading `sessionId` off the parser and persisting it
- Pointing the CLI at `.mcp.json` (already committed at the repo root)

**Genuinely new:**
1. **The human gate.** §5 — the only piece with no existing implementation at any layer.
2. **A push channel** for stream frames (§3).
3. **Session/transcript persistence** (§4).
4. **CLI child lifetime + teardown** (§2).
5. **The tab chrome** in the CONTEXT column (§6).
6. **Deciding where `scripts/*.mjs` lives** (§1.1).

### 1.1 · A build-system decision that must be made first

`claude-cli.mjs` and `claude-stream.mjs` are plain ESM, JSDoc-typed, under `scripts/`. They are
covered by `tsconfig.scripts.json` and **excluded from `tsconfig.node.json`**, which includes only
`src/main`, `src/preload`, `src/shared`. `electron-vite` bundles `src/main`.

So WP4 must choose:

- **(a) Import from `../../scripts/*.mjs`** into `src/main`. Works, keeps one copy, but pulls
  untypechecked JS into the bundled main process and crosses a tsconfig boundary.
- **(b) Move them to `src/main/claude-cli.ts` / `claude-stream.ts`.** Typechecked and idiomatic, but
  `chat-probe.mjs` and any standalone use must follow, and the parser tests re-point.
- **(c) Duplicate.** No — two copies of a 670-line-class parser with four subtle traps is how trap 3
  comes back.

**(b) is recommended**, with `chat-probe.mjs` importing from `src/` — it keeps the headless probe as
a consumer of the same code the pane runs, which is what makes the probe evidence.

---

## 2 · Where the `claude -p` process lives, and its lifetime

**Main. Not negotiable.** The renderer has `contextIsolation` on and no Node access; only main can
`spawn`. This matches every other privileged capability in the app.

**`src/main/process-supervisor.ts` already exists** and is the natural home — it spawns, monitors,
streams stdout/stderr, and `createConsole` already calls `processes.stopAll()` on lifecycle stop. It
was built for exactly this ("the GUI drives a local process"). Check whether its `ManagedProcess`
shape can carry an open stdin; if not, extend it rather than spawning around it.

**Lifetime: one long-lived child per app session, not one per turn.** Mechanic 2 — `--input-format
stream-json` keeps stdin open so several turns share one process and one context. `startClaude()`
already implements this: `result` closes a *turn*, stdin stays open for the next prompt. Spawning per
turn would throw away the conversation and re-pay startup on every message.

Open question: is the child spawned eagerly at app start, or lazily on the first message? Lazy is
better — a user who never opens the Chat tab should not have a CLI running, and startup should not
depend on `claude` being installed.

### On quit — the existing flush does NOT cover this

`before-quit` (A2, `src/main/quit-flush.ts`) waits, bounded at 2s, for **run-manifest** writes. It
knows nothing about a CLI child. WP4 must add its own teardown, and the order matters:

1. The child holds an **open stdin**. It will not exit on its own — it must be closed or signalled.
2. A turn may be **in flight**. Killing mid-turn loses the assistant's reply and, if the transcript
   is being persisted, may lose it half-written.
3. `flushRunOnQuit` is deliberately generic — `stopRun`, `closeManualRun`, `pending()`. A CLI
   teardown is a *second* concern; do not overload that function. Either register the child with
   `ProcessSupervisor` (whose `stopAll()` already runs on lifecycle stop) or add a sibling step in
   the `before-quit` handler in `src/main/index.ts`.

⚠️ **Known gap to design around:** `dev:watch`'s own restart bypasses `before-quit` entirely — the
`2026-08-07-2103` run manifest has no `outcome` for exactly this reason. Anything WP4 relies on
`before-quit` to persist will be lost on every hot reload during development. Persist incrementally,
not at quit.

---

## 3 · How stream frames reach the renderer

**A push channel. The existing IPC router cannot do it.**

`IpcRouter.register()` wires `ipcMain.handle` — strictly request/response. Stream frames are
server-push: one prompt produces hundreds of `text_delta` events over seconds.

The app already has two push channels, and they are the pattern to copy exactly:

```
IPC.runStatus      main → renderer   run.onStatus(cb) → unsubscribe    (RunStatus snapshots)
IPC.harnessEvent   main → renderer   onEvent(cb) → unsubscribe          (HarnessEvent union)
```

Both are `hostWindow.webContents.send(...)` in main, `ipcRenderer.on(...)` in
`src/preload/index.ts` returning an unsubscribe. WP4 adds a third: **`IPC.chatEvent`**, carrying the
six-event union, with `chat.onEvent(cb)` on `ImagedripApi`.

Two things not to get wrong:

- **Back-pressure.** `text_delta` can arrive per-token. Sending one IPC message per delta will
  saturate the bridge. Coalesce in main on a frame budget (~16–30ms) before sending, or send deltas
  batched. The parser already normalises the frames; batching is a transport concern above it.
- **Request/response still applies to the turn itself.** "Send this prompt" is a normal
  `ipc.register` call (renderer → main, resolves when the turn's `result` arrives, or immediately
  with an ack). Only the *frames* need the push channel.

---

## 4 · Session persistence and what "resume" means

`createStreamParser()` already captures the id: `session_id` is read off any frame carrying it and
exposed as `parser.sessionId` (`claude-stream.mjs:105, 293`). `buildArgs()` already implements both
directions (`claude-cli.mjs:103–106`):

- `--session-id <uuid>` — **claim** an id ImageDrip generated
- `--resume <id>` — **continue** one it already owns

Mechanic 4: *ImageDrip owns the session id and persists it; the CLI owns the working memory.* So
"resume after a restart" means passing `--resume` with a stored id — the transcript itself lives in
the CLI's own storage, not ImageDrip's.

**Where to store it is undecided, and the choice is a product decision, not a technical one:**

- **Global** (one chat for the app) — simplest. A sibling JSON under `userData`, like `counter.json`.
- **Per project** — a field on `ProjectRecord`. Matches how the app already thinks: switching project
  re-points everything else. But it puts a CLI implementation detail into the domain document, and
  `domain.json` is mirrored to the brand repo, so a session id would end up committed to git.
- **A sidecar** under `userData`, keyed by project id. Keeps `domain.json` clean and survives the
  mirror. **Recommended** unless the pane is explicitly global.

Requirements §10 Q5 asks the adjacent question and leaves it open: *"Where does the transcript live —
memory, or on disk beside the project?"* Note the asymmetry — a run's provenance already survives in
`manifest.json`; the chat that *configured* that run currently would not.

Also unresolved: `--resume` against a CLI that has since been upgraded, or a session id whose
underlying transcript the CLI has garbage-collected. Resume must fail soft — start a fresh session
and say so — never wedge the pane.

---

## 5 · Enforcing §4, and making confirm-first a real gate

### 5.1 · The webview constraint is already structural — for MCP tools

> 🔒 **The operator chat must never touch the ChatGPT webview.**

This is enforced today by construction, not by trust:

- `NEVER_EXPOSED` (`verb-policy.ts`) excludes `harness:attach|set-bounds|set-visible|new-conversation|feed|stop`
  and `run:inject-primer|inject-prompt`.
- `isExposed()` filters the registry the control surface publishes.
- `imagedrip-mcp.mjs` derives its **entire** tool list from `GET /v1/verbs`.

So the chat has **no tool that can type into the webview**. Verified by `test/verb-policy.test.ts`.
Do not weaken this, and do not add a `ui.state` verb (already ruled out — it would test its own hook).

### 5.2 · ⚠️ But the CLI has tools that are not MCP tools

`buildArgs()` supports `--permission-mode` (§3 specifies `bypassPermissions`) and `--add-dir <brand-repo>`.
A Claude Code CLI running with `bypassPermissions` has **Bash, Read, Write and Edit**. The §4
guarantee holds at the MCP verb layer and **does not hold at the Bash layer** — nothing stops the
agent from `curl`-ing the control surface directly, or worse, on David's own machine.

`buildArgs()` already supports `--allowed-tools` / `--disallowed-tools`. **Deciding that tool policy
is part of WP4's design, not an afterthought.** This is the single largest unaddressed risk in the
brief. Requirements §10 Q3 touches it ("does the chat get filesystem access, or only the MCP verbs?")
and treats it as a capability question; it is also a containment question.

### 5.3 · The human gate does not exist yet

`GATED_VERBS` marks `run.start`, `run.stop`, `run.pause`, `run.resume`, `domain.reset-run`,
`project.choose-output-dir`, the three `*.delete`s and `repo.attach`. But `gated: true` is **published
metadata only** — advisory to the model. Nothing intercepts the call. AC-5 requires *"Start the run
must ask before feeding the live session, every time"*, and today the only thing making that true is
the model choosing to honour a description.

**A gate the model can decline is not a gate.** Making it real needs main to intercept, and that runs
into a genuine architectural problem:

```
CLI ──stdio──▶ imagedrip-mcp.mjs ──HTTP──▶ control-surface ──▶ IPC handler
                (separate process)          (main)
```

Main *is* the control surface, so it can hold the request — but it currently cannot tell **who is
calling**. A terminal Claude Code session and the in-app chat pane present identically: same bearer
token, same loopback. Options to evaluate:

- **Per-client tokens or a client header.** The pane's MCP proxy gets its own credential; a gated
  verb from *that* client is held pending a UI confirm, while other clients keep today's behaviour.
- **Gate everything gated, from any client.** Simpler and safer, but it makes headless
  `chat:probe` runs block — and AC-5 is precisely what the probe asserts, so this needs care.
- **Gate in the renderer before dispatch.** Only works for calls the pane itself originates, which
  is not where MCP tool calls come from.

Then the UI half: a held request needs a visible, blocking affordance in the pane — *"The chat wants
to run 12 prompts against the live ChatGPT session. [Allow once] [Deny]"* — with a timeout that
**denies** on expiry, not allows. `vercel/agent-ux-components.md` covers HITL approval patterns and
is the reference for this.

**This is the piece to design first.** Everything else in WP4 is rendering.

---

## 6 · Where the pane goes

§5 of the requirements: make the CONTEXT column tabbed — **`Context ｜ Chat`**. The chat's primary job
is editing exactly the fields in that column, so they share a home and compete for no new space.

Relevant facts from `src/renderer/src/App.tsx` (read-only — not edited):

- The CONTEXT column is toggled by `ctxOpen` (store) and rendered around `App.tsx:328`, with a
  collapsed `CONTEXT ▸` rail at `:362` and the panel itself from `:829`.
- Its width is a persisted, drag-resizable panel: `useResizable('imagedrip.ctxWidth', 240, {min:200, max:620}, 'left')`.
- **The ChatGPT `WebContentsView` composites ABOVE all HTML.** `harness.setVisible(false)` exists
  solely so renderer popovers can be seen over it. A chat pane inside the CONTEXT column is on the
  far side of the window and should not overlap — but any modal, and the §5.3 confirm gate in
  particular, must account for it.
- `App.tsx:105–111` recomputes the reserved webview rect when `ctxOpen`, `mode` or `uat` change.
  **Adding a tab changes that column's layout, so the rect recompute must include the new state** —
  or the ChatGPT view will sit over the wrong rectangle. This is the same class of bug as the S/M/L
  resize that preceded the 2026-08-07 feed failure.

§5 also states: *switching to the Chat tab while a run is live must not disturb the run.*

---

## 7 · Unknowns that would change the design

Stated as questions. None should be guessed.

1. ~~**Who is allowed to bypass the gate?**~~ ✅ **DECIDED — see D1.** Per-client credential; the
   pane's calls are held for a human confirm, other clients keep today's behaviour, `chat:probe`
   stays headless.
2. ~~**What tool policy does the CLI run under?**~~ ✅ **DECIDED — see D2.** Read + MCP; Bash, Write
   and Edit disallowed; `--add-dir` retained. **Must fail closed if the probe cannot confirm the
   flags.**
3. **Is the chat global, or per project?** Decides where the session id lives and whether switching
   project switches conversation. (§4.)
4. **Does the transcript persist to disk, and where?** (Requirements §10 Q5.) A run's provenance
   survives in `manifest.json`; the chat that configured it currently would not.
5. **Do `scripts/claude-*.mjs` move into `src/main`?** (§1.1.) Affects typechecking, bundling, and
   whether the probe and the pane share one implementation.
6. **Claude Code only, or an adapter over several CLIs?** (Requirements §10 Q2. Open Design keeps 26
   behind one adapter.) Single-user says just Claude Code; the adapter shape costs little to keep open.
7. **What happens when `claude` is not installed, or is too old for the required flags?**
   `probeCapabilities()` returns an empty set and `buildArgs()` degrades to the required floor — but
   the *floor* includes `--input-format stream-json`, which is not optional. The pane needs a real
   empty state for "no usable CLI", not a broken chat.
8. **Eager or lazy spawn?** (§2.)
9. **How are deltas coalesced, and what is the budget?** (§3.) Affects perceived latency directly.
10. **Are the two tickets real?** (§0.2.) They could not be found. If they exist, they may contain
    scope decisions this brief has had to treat as open.

---

## 8 · Suggested order

~~1. Answer Q1 and Q2~~ ✅ **done — D1 and D2 above.** Build to them.

1. **Move `claude-cli` / `claude-stream` into `src/main`** (Q5), keep the parser tests green.
2. **Spawn from main via `ProcessSupervisor`**, lazily, with teardown wired into the quit path.
   Apply **D2** here — and make the capability probe a **hard precondition**, not a soft one: no
   confirmed `--disallowed-tools`, no spawn.
3. **Add `IPC.chatEvent`** and prove one `text_delta` stream reaches the renderer.
4. **Build the gate (D1)** — second credential, hold the request, confirm in the UI, deny on timeout.
   Do this **before** the pane can call anything gated, not after; it is the piece that decides
   whether the chat is safe to trust, and it is far cheaper now than retrofitted.
5. **Then the tab and the transcript UI.** Rendering is the easy part and should come last.

`npm run chat:probe` already replays AC-1…AC-5 headlessly and checks results against the control
surface rather than against what the agent claimed. **Keep it passing at every step** — it is the
only thing standing between WP4 and a false green.
