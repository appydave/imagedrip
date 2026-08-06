---
doc: requirements
project: imagedrip
status: PROPOSED — nothing built, nothing decided. Draft for David's review.
created: 2026-08-06
purpose: give ImageDrip a resident chat operator that can configure the app and drive its verbs
predecessor: requirements-v3-templates-and-repos.md (also proposed, also unbuilt)
---

# v4 — The Resident Chat Operator

**Status:** proposed. Nothing here is built.

**This document is self-sufficient.** Everything needed to implement WP1–WP3 is inline — the
prerequisites (§0), the invocation and stream protocol (§3), the verb surface (§6), and the WP1
spec against this repo's real files (§9). No other checkout is required.

**Optional depth** (David's machines only, not a dependency):
`~/dev/ad/brains/software-factory-research/` holds `resident-chat-operator-pattern.md` (how Open
Design does this, verified at source), `external-control-surface-pattern.md` (one API, N clients),
and `chat-operated-workbench-pattern.md` (the three-pane pattern).

---

## 0 · Prerequisites — get the app running before any of this matters

On a machine that has never built ImageDrip, in this order. **Steps 1 and 4 cannot be done by an
agent.**

| # | Step | Detail |
|---|---|---|
| 1 | **Check out the sibling dependency** ⚠️ **manual** | `@appydave/core` is a **local path dependency** — `"@appydave/core": "file:../appydave-foundation/packages/core"`. It is **not published to npm**. `/Users/davidcruwys/dev/ad/apps/appydave-foundation/` must exist as a sibling of this repo or `npm install` fails outright. |
| 2 | **Node 20+** | Per the README. `electron-vite` + `electron-builder` toolchain. |
| 3 | **`npm install` — npm ONLY** 🔴 | This repo is **npm-only**; `package-lock.json` is the committed lockfile and `packageManager` is pinned to `npm@11.11.0`. **pnpm 10+ blocks postinstall by default, and Electron's postinstall is what downloads the Electron binary — `pnpm install` yields a package with no Electron in it.** It fails later and confusingly. See `docs/kdd/learnings/blocked-postinstall-leaves-a-hollow-package.md`. |
| 4 | **Sign in to ChatGPT** ⚠️ **manual, once per machine** | `npm run dev` opens the window; the right-hand column is a live ChatGPT `WebContentsView` on a persistent partition. **Sign in by hand.** The session then persists across restarts. **No agent can perform this step** — it needs a human at a browser doing a real login, and it is a precondition for anything touching `run.*`. A machine that has not done this can still build and exercise every config verb; it cannot run a batch. |
| 5 | `npm run typecheck` / `npm test` | Both tsconfig projects; Vitest. Green before starting work. |

Verify: `npm run dev` opens an ImageDrip window with a signed-in ChatGPT panel on the right.

---

## 1 · Why

ImageDrip already has a chat in its window, and it is the wrong chat in the wrong seat.

The embedded ChatGPT is the **image engine** — the provider. It sits in the pane a conversational
operator would occupy, and it can never become one, for a reason that has nothing to do with
effort: **it cannot see the app.** It has no view of Brand, Template, or Project, no way to write
them, and no knowledge ImageDrip exists. It is a webview of a third-party site being fed
synthesized keystrokes.

The cost is paid twice — the operator seat is occupied, and everything ChatGPT produces that isn't
an image has to be read off the screen and retyped by hand.

**The clearest case is prompt-list generation.** Asking ChatGPT for twelve nail-art prompts in the
house style is the one non-image job it is genuinely good at. It is also the one job it cannot
finish, because it has no way to write into the queue. A chat that can see the app turns *"give me
twelve nail-art prompts in the house style and put them in the queue"* into one turn: read Brand +
Template for the style, generate, call `prompts.import`. Same model, same prompt, one difference —
it can reach the app.

### What is actually missing

Not a chat panel. **Reachability.** `src/shared/ipc.ts` already declares ~46 `imagedrip:*` channels
— `project:create`, `template:create`, `domain:import-prompts`, `run:start`, `runs:manifest` and
the rest. Every verb a chat would need already exists. They terminate inside the Electron window,
where nothing else can reach them.

---

## 2 · Sequencing vs v3 — RESOLVED: v4 goes first, against today's store

**Decision: v4 does not wait for v3. The goal is scoped to WP1–WP3 and targets today's
`domain.json`.**

An earlier draft of this document made v3 a precondition. That was wrong for one practical reason:
**v3 is itself unbuilt and unratified**, so making it a precondition means this work cannot start at
all — and a long-horizon autonomous goal cannot begin on an unresolved dependency.

**What makes going first safe: the route table survives v3; only the handlers change.**

`project.create` exists either way. Today it writes a record into `domain.json`; after v3 it writes
`projects/<slug>/project.json` in a brand repo. The HTTP route, its Zod schema, its MCP tool
declaration, and its description are **identical in both worlds**, because the control surface (WP1)
mirrors the *channel contract*, not the storage. Re-pointing after v3 is a change inside
`domain-store.ts` / `repo-store.ts`, which the surface never sees.

So the throwaway risk is close to zero, and it is confined to the handlers — which v3 is rewriting
anyway.

**What v3 will still improve, later, and why it's worth doing:**

| | Today (`domain.json`) | After v3 |
|---|---|---|
| A template is | a record in one unversioned file | a Markdown file in a git repo |
| Authoring it | an MCP tool call | **also** a plain file write |
| Provenance | none | `git diff`, per brand |
| Blast radius of a bad write | the single store | one repo, revertable |

After v3 a filesystem-capable agent can author templates and prompt lists *natively*, and part of
the tool surface becomes optional rather than load-bearing. That is an improvement to look forward
to, **not** a reason to block.

> **Carry-forward note for whoever lands v3:** the verb surface in §6 is storage-agnostic by design.
> Re-point the handlers; do not change the routes, the schemas, or the tool names.

---

## 3 · The topology decision

Five ways to build a resident chat (full comparison in the research doc §3). For ImageDrip the
choice falls out of the app's own founding constraint.

> **ImageDrip exists because paid image APIs cost ~$0.06/image and catalogue runs recur.** That
> single constraint — **no API credits** — drove the entire architecture: drive a real logged-in
> ChatGPT session rather than pay per call.

Applying the same logic to the chat pane:

| Option | Verdict |
|---|---|
| Managed Agents | **No.** It hosts the sandbox. ImageDrip's tools must run on this machine against a live Electron webview. Nothing to containerise. |
| Claude API — manual loop | No. Writing the agent loop by hand buys nothing here. |
| Claude API — Tool Runner | Viable pre-v3 (the tools *are* the app's verbs, no filesystem needed) — but **you pay per token**, and after v3 the chat wants file access anyway. |
| Claude Agent SDK | Viable. Full Claude Code harness with real file tools, hosted by us. **But we pay per token.** |
| **Spawn the user's own CLI** (Open Design's approach) | **Recommended.** The user's own subscription, zero per-token cost to the app, real file tools, MCP support. |

**Recommendation: spawn the user's installed Claude Code CLI.** An ImageDrip that avoids $0.06 an
image on generation and then bills per token on the chat has argued against itself. Open Design
made the identical call for the identical reason and supports 26 agent CLIs behind one adapter.

**The cost of this choice, stated plainly:** it requires the user to have a coding-agent CLI
installed, and it integrates against a surface we don't version-control. For a personal, single-user
tool on David's own machine, both are close to free. If ImageDrip ever ships to strangers, revisit —
the Agent SDK is the fallback, at per-token cost.

### The invocation (from Open Design, verified)

```
claude -p --input-format stream-json --output-format stream-json --verbose
       [--include-partial-messages] [--model <id>] [--add-dir <brand-repo>]
       [--resume <id> | --session-id <uuid>]
       --permission-mode bypassPermissions
```

Five mechanics that are load-bearing and easy to lose:

- **Prompt over stdin, never argv** (Linux `E2BIG` ~128 KB; Windows `ENAMETOOLONG` ~32 KB, ~8 KB via
  a `.cmd` shim).
- **`--input-format stream-json`** keeps stdin open so a turn can be steered mid-flight. Without it
  every turn is a one-shot batch.
- **Probe `claude -p --help` and gate optional flags** — an unknown option exits 1 and kills the chat.
- **ImageDrip owns the session id and persists it; the CLI owns the working memory.**
- **The sandbox is the working directory** — here, the brand repo. That is what makes
  `bypassPermissions` a considered choice.

### The stream protocol (WP3's real content)

**In:** one JSON object per line on stdin, newline-terminated — and **don't** `end()` stdin unless
you mean to close the turn:

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<prompt>"}]}}
```

**Out:** JSONL on stdout. Reduce it to **six** UI-facing events:

| Event | Payload |
|---|---|
| `status` | lifecycle — `initializing` / `requesting` / `thinking` |
| `text_delta` | assistant text chunk |
| `thinking_delta` | extended-thinking chunk (render collapsed) |
| `tool_use` | `{ id, name, input }` — fires **once**, when the input is complete |
| `tool_result` | `{ tool_use_id, content, is_error }` |
| `usage` | input / output / cache tokens + cost |

**Four traps. None is guessable, and each presents as a cosmetic double-render that is actually a
state bug.** The reference parser is 670 lines, and this is why:

1. **Two output modes, and both must work.** With `--include-partial-messages`, assistant text
   arrives as `stream_event` deltas. **Without** it — older builds, or whenever the capability probe
   says no — text arrives **only in the final `assistant` wrapper**. Handle both or the chat is
   silent on half of installs.
2. **Tool uses are repeated in the final wrapper, often with empty `{}` inputs.** Track emitted
   tool-use ids and suppress the duplicate, or every tool call renders twice — the second time with
   its arguments missing.
3. **Same for text.** Track which message ids already streamed deltas, or newer builds render every
   message twice (deltas *and* the wrapper).
4. **Tool inputs arrive fragmented.** Keep per-content-block scratch keyed by
   `` `${messageId}:${blockIndex}` ``, accumulate `input_json_delta` chunks, and emit **one**
   `tool_use` when the block stops. Blocks can arrive with no message id — attribute them to the most
   recent assistant message.

Traps 2 and 3 are the same underlying thing: the CLI is *deliberately* redundant so a non-streaming
consumer still receives everything. Dedupe is the consumer's job.

---

## 4 · The hard constraint — read this before designing anything

> ### 🔒 The operator chat must never touch the ChatGPT webview.
>
> The webview is the **engine**, and the CadenceEngine + WebviewDriver own it exclusively.
>
> ImageDrip's entire ToS mitigation is that prompts arrive through the real Chromium input pipeline
> at a human cadence, one at a time, with a live STOP. A second writer on that session voids the
> guarantee — and the account is what's at risk.
>
> **The operator chat configures the app and asks the harness to run. It never types into ChatGPT.**

This is the v4 equivalent of the app's existing "write like a human, only read the DOM" rule, and it
is equally non-negotiable.

---

## 5 · Where the pane goes

The cockpit is `CONTEXT | QUEUED | HARVESTED | ChatGPT`. All four earn their space; none can be
dropped, and horizontal room is already tight.

**Proposal: make the CONTEXT column tabbed — `Context ｜ Chat`.**

```
┌─ ImageDrip ────────────────────────────────────────────────────────────┐
│  Mode: ( ● Dial-in ) ( ○ Automation )                     [ STOP ■ ]    │
├──────────────┬─────────────┬──────────────┬────────────────────────────┤
│ [Context|Chat]│  QUEUED     │  HARVESTED   │  native ChatGPT — live    │
│ ▸ Brand   🔒 │  avocado ⚡ │  [img][img]  │   (the ENGINE — the        │
│ ▸ Template🔒 │  banana     │  [img]       │    operator chat never     │
│ ▸ Project ✎  │  mango …    │              │    writes here)            │
│ → ~/Pic…     │  [+import]  │              │                            │
└──────────────┴─────────────┴──────────────┴────────────────────────────┘
```

Rationale: the chat's primary job is editing exactly the fields in that column, so they share a
home and compete for no new space. Switching to the Chat tab while a run is live must not disturb
the run.

---

## 6 · The verb surface

Derived from the existing `imagedrip:*` IPC channels. Two tiers.

### 6.1 · Free — reads and configuration writes

| Verb | Backing channel | Notes |
|---|---|---|
| `context.get` | *(new)* | Active brand / template / project / mode / run. **Must expire (~5 min of no user interaction) and degrade to `{active:false, hint}` rather than erroring** — see research §4 item 12. This is what makes "add twelve more like the last lot" resolvable. |
| `brand.list` / `brand.get` | `brand:switch`, domain read | **No `brand.write`.** v3 makes Brand a synced pointer to the canonical style library — a second editable copy is the drift that rule exists to prevent. |
| `template.list` / `.get` / `.create` / `.update` | `template:create`, `template:save` | ← *"how do I create a new style / recipe"* |
| `project.list` / `.get` / `.create` / `.update` | `project:create`, `domain:save-project` | ← *"how do I create a new project"* |
| `project.switch` · `template.switch` · `brand.switch` | `*:switch` | Moves the selection the other panes read |
| `prompts.list` / `.import` | `domain:import-prompts` | ← *"create twelve prompts like that"* |
| `primer.compose` | `domain:compose-primer` | Read-only preview — what would be posted |
| `runs.list` / `runs.manifest` | `runs:list`, `runs:manifest` | Read past runs and their provenance |

### 6.2 · Confirm-first — anything touching the live session or destroying work

| Verb | Backing channel | Why gated |
|---|---|---|
| `run.start` | `run:start` | Begins feeding a live ChatGPT session. **Never auto-run.** |
| `run.stop` / `run.pause` / `run.resume` | `run:stop` etc. | Interrupts a paid-for, in-flight batch |
| `prompts.clear` | `domain:reset-run` | Destroys a queue |
| `project.set_output_dir` | `project:choose-output-dir` | Redirects where files land |

The split follows the standard rule: promote an action to a gated tool precisely when you need to
intercept, confirm, or audit it. Everything else runs free, or the chat is useless.

### 6.3 · Where each verb physically lives — do this audit before publishing the surface

This is the table whose absence let Open Design ship an `od export` verb that can never succeed
headlessly (KYB-409).

| Verb family | Lives in | Reachable |
|---|---|---|
| brand / template / project / prompts CRUD | main + Store (post-v3: files on disk) | ✅ fully |
| `primer.compose` | main, pure | ✅ fully |
| `runs.list` / `.manifest` | main + disk | ✅ fully |
| **`run.*`, harvest** | main **+ the live webview** | ⚠️ **only while the app is open and signed in** — inherent, not a defect. Say so in the tool description, the way `context.get` says `{active:false, hint}`. |

---

## 7 · Acceptance criteria — David's three asks

Each is one turn, driven from the Chat tab, with the result visible in the other panes.

**AC-1 · "Create a new project for the spring nail gallery, output into the B&J repo."**
→ agent calls `project.create` + `project.set_output_dir` (confirm) → the project appears in the
CONTEXT column and is selected. Post-v3, `projects/<slug>/project.json` exists on disk.

**AC-2 · "Make me a new template for catalogue-ready single-nail tiles. One design per line."**
→ agent reads the Brand for house style, calls `template.create` with a body, `importFormat:
'lines'`, and any `negatives` → the template appears in the CONTEXT column, is selectable, and
survives an app restart. *(Storage-agnostic: a `domain.json` record today, a `template.md` +
`template.json` pair after v3 — the acceptance criterion does not change.)*

**AC-3 · "Give me twelve prompts for that, in the house style, and queue them."** ⭐
→ agent reads Brand + Template, generates twelve, calls `prompts.import` → **twelve rows appear in
the QUEUED pane.** No copy-paste. **This is the case that proves the whole thing** — it is the loop
the embedded ChatGPT can start and cannot finish.

**AC-4 · Blocked-step behaviour.** Ask for something the app cannot do (e.g. export a run as PDF).
The agent must report the block plainly and stop — not improvise a workaround and report success.
This is the discipline that caught a false green in the Open Design UAT (KYB-407), and it is the
criterion that decides whether the chat is safe to trust.

**AC-5 · The run gate.** *"Start the run"* must ask before feeding the live session, every time.

---

## 8 · Non-goals

- **Not KyberAgent.** No extension, no mount, no seam. If it ever becomes desirable, a resident
  operator makes it a one-line starter command — but that is not this document.
- **Not replacing the ChatGPT panel.** It stays; it is the engine.
- **No image generation via API.** The founding constraint is unchanged.
- **No autonomous runs.** The chat proposes; David disposes. AC-5 is the mechanism.
- **No second write path.** The chat mutates through the same verbs the UI uses — one API, two
  clients — or the app has two sources of truth and the provenance log becomes fiction.

---

## 9 · The work

**Goal scope is WP1–WP3.** WP4–WP5 are a follow-on goal (see §9.5).

### 9.1 · How a channel is registered today — read this first

Three files, and the whole mechanism is 36 lines.

**`src/main/ipc-router.ts`** — the entire router:

```ts
import { ipcMain } from 'electron';
import { z } from '@appydave/core';          // ← Zod comes from core, not the zod package

export interface HandlerDef<In, Out> {
  channel: string;                            // from the IPC map in src/shared/ipc.ts
  input?: z.ZodType<In>;                      // optional — validated before handle() runs
  handle: (input: In) => Promise<Out> | Out;  // ONE payload arg, never (…args)
}

export class IpcRouter {
  private channels: string[] = [];
  register<In, Out>(def: HandlerDef<In, Out>): this {
    this.channels.push(def.channel);
    ipcMain.handle(def.channel, async (_event, raw: unknown) => {
      const input = (def.input ? def.input.parse(raw) : raw) as In;
      return def.handle(input);
    });
    return this;
  }
  dispose(): void { /* ipcMain.removeHandler for each */ }
}
```

**`src/shared/ipc.ts`** — the `IPC` map (`as const`), ~46 entries, names shaped
`imagedrip:<area>:<verb>`. Single source of truth; preload implements it, renderer consumes it.

**`src/main/index.ts:313`** — `createConsole({ name: 'imagedrip', registerIpc({ ipc }) { … } })`.
`registerIpc` is one block of `ipc.register<In, Out>({ channel, input, handle })` calls, roughly
`:316–:660`.

**Four properties that make the HTTP mirror almost free — do not lose any of them:**

1. **One payload argument.** Every handler is `(input) => Out`. A JSON request body maps 1:1; there
   is no argument-splatting to reproduce.
2. **Zod already sits at the boundary**, inside `register()`, not in the handlers. The header says
   why: *"Renderer input is untrusted (docs §9 — Electron is a lethal-trifecta surface), so
   validation-at-the-boundary is not optional."* **The HTTP layer reuses the same `def.input` schema
   — it does not define its own.** Two schemas for one verb is exactly the drift this avoids.
3. **Run-state locks live inside the handlers, not the router** — e.g. `IPC.domainSaveBrand` does
   `if (runner?.running) throw new Error('brand is locked while a run is live')`, and
   `IPC.domainSaveProject` refuses an `outputDir` change mid-run. **An HTTP mirror inherits every one
   of these for free**, which is the single strongest argument for mirroring the registry rather than
   writing parallel routes. An agent cannot get around a lock the UI is subject to.
4. **Domain mutations return the whole `DomainState`.** The caller never has to re-read; one call is
   both write and refresh.

### 9.2 · WP1 — the loopback control surface (SPEC)

**The change is additive and small: make `IpcRouter` remember what it registered, then serve that.**

**a. `src/main/ipc-router.ts` — record the defs.**

```ts
private defs = new Map<string, HandlerDef<unknown, unknown>>();
// in register(): this.defs.set(def.channel, def as HandlerDef<unknown, unknown>);
/** Snapshot for the control surface. */
list(): ReadonlyMap<string, HandlerDef<unknown, unknown>> { return this.defs; }
// in dispose(): this.defs.clear();
```

Nothing else in `register()` changes. Zero risk to the existing IPC path.

**b. New file `src/main/control-surface.ts`** — a `node:http` server (no Express; ImageDrip has no
server dependency and should not gain one).

| Route | Method | Behaviour |
|---|---|---|
| `/v1/health` | GET | `{ ok: true, version, running: boolean }`. **No auth** — liveness only. |
| `/v1/verbs` | GET | The registry as `[{ verb, channel, hasSchema }]`. This is `describe`. |
| `/v1/context` | GET | Active brand / template / project / mode / run + `expiresAt`. See §9.3. |
| `/v1/call/:verb` | POST | Body is the payload → `def.input?.parse(body)` → `def.handle(input)` → `200 {result}`. |

**Verb naming:** `imagedrip:template:create` → `template.create`. Strip the `imagedrip:` prefix,
join the rest with `.`. Channels outside the `imagedrip:` namespace (`app:*`, `counter:*`) and the
webview-internal channels are **not exposed**.

**Error mapping** — the HTTP layer must not flatten these together:

| Cause | Status | Body |
|---|---|---|
| unknown verb | 404 | `{ error: 'unknown_verb', verb }` |
| `ZodError` from `def.input.parse` | 422 | `{ error: 'invalid_input', issues }` |
| handler throws (incl. run-state locks) | 409 | `{ error: 'refused', message }` ← the lock messages surface here verbatim |
| anything else | 500 | `{ error: 'internal' }` |

409-for-refused matters: it is how the agent tells *"you may not do that right now"* from *"you sent
garbage."* That distinction is what makes AC-4 (report the block, don't improvise) achievable.

**Bind `127.0.0.1` only.** Never `0.0.0.0`.

**c. Lifecycle.** Start it in `createConsole`'s `registerIpc` (after registration, so the registry is
populated) or at the top of `onReady`. **`create-console.ts` already has the teardown hook** —
`lifecycle.onStop(() => { ipc.dispose(); processes.stopAll(); })`. Add `control.stop()` there.

**d. Token scheme — DECIDED: mint per launch, published with the port in one file.**

- On listen, generate `crypto.randomBytes(32).toString('hex')`.
- Write `<app.getPath('userData')>/control.json` = `{ "port": <resolved>, "token": "<hex>", "pid": <pid> }`, mode **`0600`**.
  On macOS that is `~/Library/Application Support/imagedrip/control.json`, beside `domain.json`.
- Delete the file in `lifecycle.onStop`.
- Every route except `/v1/health` requires `Authorization: Bearer <token>`; mismatch → **401**.
- Port: default **7180**, `IMAGEDRIP_CONTROL_PORT` overrides, **`0` means OS-assigned** — and the
  resolved port is what gets written to the file.

**Why mint-per-launch over a stable file:** identical effort, and a leaked token dies with the
process. **Why port *and* token in one file:** the client discovers both from one read. This is a
deliberate fix for a failure seen elsewhere in the estate — Captain's Log hardcodes its port in three
uncoordinated places, and its iframe can be granted a port it has no way to learn. One file, one
read, no constants.

**DoD (WP1):** `curl -s localhost:7180/v1/health` returns `ok`; an authed
`POST /v1/call/domain.get` returns the live `DomainState`; an unauthed call returns 401; a bad
payload returns 422 with Zod issues; `brand.save` during a live run returns **409** carrying
`brand is locked while a run is live`.

### 9.3 · `context.get` — the one genuinely new handler

Not a mirror of an existing channel; it has to be written.

```ts
{ active: true, brand: {id,name}, template: {id,name}|null, project: {id,name,outputDir},
  mode: 'dial-in'|'automation', run: {status,queued,harvested}|null, expiresAt: <ISO> }
```

**Expires ~5 minutes after the last user interaction**, and when stale returns
`{ active: false, hint: "Open ImageDrip and select a project, then ask again." }` — **never an
error**. Without expiry an agent silently targets whatever was last clicked before lunch; without
the hint it has nothing to tell the user. Most verbs should default to this when their target is
omitted.

### 9.4 · WP2 and WP3

| WP | What | DoD |
|---|---|---|
| **WP2** | **MCP server** — a stdio MCP process that reads `control.json`, lists `/v1/verbs`, and exposes each as a tool (`POST /v1/call/:verb`). **Zero logic** — a `fetch()` proxy, exactly like Open Design's, whose own header reads *"holds no state and never touches the filesystem; every tool resolves to a fetch()."* Tool descriptions must state **when** to call, not just what. Gated verbs (§6.2) are declared but marked confirm-first. | An external Claude Code session with this server in `.mcp.json` drives **AC-1, AC-2, AC-3** end to end against a running app. |
| **WP3** | **Spawn + stream** — `claude -p` per §3 (stdin JSON line, capability probe, persisted session id, cwd), plus the stdout parser handling the four traps. Its consumer inside this goal is a headless probe script (`npm run chat:probe`) that spawns the CLI with the WP2 server attached and replays AC-1→AC-3. | `npm run chat:probe` completes AC-1→AC-3 with no human in the loop and prints a transcript. |

WP3 exists in this goal **only** because it needs a consumer to be provable, and the probe harness is
that consumer. It is also the thing WP4 is built on.

### 9.5 · Deliberately out of this goal

**WP4 — the Context｜Chat pane** (§5) and **WP5 — ImageDrip skills.** Both are follow-on. WP1–WP3
prove the capability from a terminal; WP4 is the in-app experience on top of a proven surface.

**WP1 is worth building even if v4 is never finished** — it is the same control surface that lets any
Claude Code session or plain script drive ImageDrip with no chat pane at all. AppyStack apps get this
free because they are servers; AppyTron apps get nothing because they are windows. It is a candidate
AppyTron `control-surface` recipe once it has worked here once.

---

## 10 · Open questions

| # | Question | Why it matters |
|---|---|---|
| 1 | **Does v3 actually land first?** Everything above assumes it. | Changes WP1's shape entirely |
| 2 | Claude Code only, or detect several CLIs like Open Design does (26 defs behind one adapter)? | Single-user says just Claude Code; the adapter shape costs little to keep open |
| 3 | Does the chat get **filesystem** access to the brand repo (`--add-dir`), or only the MCP verbs? | Filesystem access is most of the value post-v3; it also means the agent can edit anything in that repo |
| 4 | Is there a supported way to run the **Agent SDK** against the user's existing Claude Code auth? | If yes, rows 4 and 5 of the topology table collapse and the CLI-install requirement disappears |
| 5 | Where does the transcript live — memory, or on disk beside the project? | A run's provenance already survives in `manifest.json`; the chat that configured it arguably should too |
| 6 | Does `--session-id` survive an app restart, or only a daemon restart? | Decides whether the chat feels continuous across days |
