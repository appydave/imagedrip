# Plan: ImageDrip control surface — make the app agent-drivable

**Job**: Give ImageDrip a loopback control surface that mirrors its existing `IpcRouter` verb
registry, expose that surface to an agent as an MCP server, and prove it end to end with a headless
probe that drives a real Claude Code CLI. The outcome is that a conversational agent can create a
project, author a template, and fill the prompt queue — the three things a user must currently do by
hand because the embedded ChatGPT cannot see the app. This is WP1–WP3 of
`docs/requirements-v4-resident-chat.md`; the in-app chat pane (WP4) is a follow-on goal.

**Mode**: code

**Created**: 2026-08-06

---

## 1. Stack

- **Runtime**: Electron 34 (`electron-vite` + `electron-builder`), TypeScript 5.7, Node 20+
- **Renderer** (not touched by this job): React 18 + Vite 6 + Tailwind 3 + Zustand
- **Foundation**: `@appydave/core` — a **local path dependency**
  (`file:../appydave-foundation/packages/core`), supplying `Lifecycle`, `Logger`, `Store`, and **`z`
  (Zod)**. Import Zod from `@appydave/core`, **never** from a `zod` package directly.
- **Package manager**: **npm ONLY.** `packageManager` is pinned to `npm@11.11.0` and
  `package-lock.json` is the committed lockfile. pnpm 10+ blocks the postinstall that downloads the
  Electron binary and produces a hollow package.
- **HTTP**: `node:http` from the standard library. **Do not add Express, Fastify, or any server
  dependency** — the repo has none and should not gain one.
- **Tests**: Vitest (`npm test`), plus `npm run typecheck` across both tsconfig projects.

**Files to read before writing anything:**

| Path | Why |
|---|---|
| `docs/requirements-v4-resident-chat.md` | The spec. §9.1–§9.4 is the WP1–WP3 design. |
| `src/main/ipc-router.ts` | 36 lines. The whole registration mechanism. Gets one additive change. |
| `src/main/create-console.ts` | The AppyTron facade; carries the `lifecycle.onStop` teardown hook. |
| `src/main/index.ts` (~`:313`–`:660`) | `createConsole({ registerIpc({ ipc }) {…} })` — every `ipc.register` call. |
| `src/shared/ipc.ts` | The `IPC` map, ~46 `imagedrip:*` channels, `as const`. |
| `src/main/domain-store.ts` | Where handlers actually mutate state and where run-state locks live. |

**Files to create:**

- `src/main/control-surface.ts` — the loopback HTTP server
- an MCP stdio proxy (thin `fetch()` client; zero logic)
- `scripts/chat-probe.*` + a `chat:probe` npm script — the headless verification harness
- tests alongside each

## 2. In Scope

- **WP1 — Control surface.** Add a `defs` registry + `list()` to `IpcRouter` (additive only). New
  `src/main/control-surface.ts` serving `GET /v1/health`, `GET /v1/verbs`, `GET /v1/context`,
  `POST /v1/call/:verb` on `127.0.0.1`. Verb naming: strip `imagedrip:`, join the rest with `.`
  (`imagedrip:template:create` → `template.create`).
- **Schema reuse.** The HTTP layer validates with the **existing** `def.input` Zod schema. It must
  not define its own — two schemas for one verb is the drift this design avoids.
- **Error mapping.** 404 unknown verb · 422 `ZodError` (with issues) · **409 handler throw**
  (run-state locks surface verbatim) · 500 otherwise. The 409/422 split is what lets an agent tell
  "you may not do that now" from "you sent garbage".
- **Token scheme.** Mint 32 random bytes per launch; write
  `<userData>/control.json` = `{port, token, pid}` at mode `0600`; delete on `lifecycle.onStop`.
  Every route except `/v1/health` requires `Authorization: Bearer <token>`; mismatch → 401.
  Port default 7180, `IMAGEDRIP_CONTROL_PORT` overrides, `0` = OS-assigned, resolved port written to
  the file.
- **`context.get`** — the one genuinely new handler. Returns active brand/template/project/mode/run
  with `expiresAt`; expires ~5 min after last user interaction; when stale returns
  `{active:false, hint:"…"}` — **never an error**.
- **WP2 — MCP server.** Stdio MCP process that reads `control.json`, enumerates `/v1/verbs`, and
  exposes each as a tool proxying `POST /v1/call/:verb`. Zero logic. Tool descriptions state **when**
  to call, not just what. Gated verbs declared confirm-first.
- **WP3 — Spawn + stream.** Spawn `claude -p --input-format stream-json --output-format stream-json
  --verbose` per requirements §3: prompt as one JSON line on stdin (never argv), capability probe via
  `claude -p --help` before passing optional flags, persisted session id, cwd as the sandbox. Parse
  stdout JSONL into the six events, handling all four traps (two output modes; duplicate tool_uses
  with empty inputs; duplicate text; fragmented tool inputs).
- **Probe harness.** `npm run chat:probe` spawns the CLI with the MCP server attached and replays
  AC-1 → AC-3 with no human in the loop.

## 3. Out of Scope

**The hard constraint, carried verbatim from `docs/requirements-v4-resident-chat.md` §4:**

> ### 🔒 The operator chat must never touch the ChatGPT webview.
>
> The webview is the **engine**, and the CadenceEngine + WebviewDriver own it exclusively.
>
> ImageDrip's entire ToS mitigation is that prompts arrive through the real Chromium input pipeline
> at a human cadence, one at a time, with a live STOP. A second writer on that session voids the
> guarantee — and the account is what's at risk.
>
> **The operator chat configures the app and asks the harness to run. It never types into ChatGPT.**

Also out of scope:

- **Not KyberAgent.** No extension, no mount, no seam.
- **Not replacing the ChatGPT panel.** It stays; it is the engine.
- **No image generation via API.** ImageDrip's founding constraint — no API credits — is unchanged.
- **No autonomous runs.** The chat proposes; David disposes.
- **No second write path.** The chat mutates through the same verbs the UI uses — one API, two
  clients.
- **WP4 (the Context｜Chat pane) and WP5 (ImageDrip skills)** — follow-on goal.
- **v3 (`requirements-v3-templates-and-repos.md`)** — not implemented here. The verb surface is
  storage-agnostic; v3 re-points handlers, not routes.
- **Invoking `run.start` / `run.stop` / `run.pause` / `run.resume` / `prompts.clear` during
  verification.** They are declared and gated; the probe must never call them.
- **Modifying** `src/main/webview-harness.ts`, `batch-runner.ts`, `cadence.ts`, or
  `chatgpt-selectors.ts`.
- **No new runtime dependency.** `node:http` and the existing tree only.

## 4. Definition of Done

`npm run chat:probe` completes AC-1 → AC-3 headlessly against a running ImageDrip and prints a
transcript; the control surface enforces auth, schema validation, and run-state locks with distinct
status codes; `npm run typecheck` and `npm test` are green; and the existing renderer IPC path is
unchanged — the app still boots and the UI still works.

## 5. Acceptance Criteria

| # | Criterion | How to check |
|---|-----------|--------------|
| 1 | Control surface binds loopback only, never `0.0.0.0` | `lsof -nP -iTCP:7180 -sTCP:LISTEN` shows `127.0.0.1:7180`; `grep -r "0\.0\.0\.0" src/main/control-surface.ts` returns nothing |
| 2 | `/v1/health` answers without auth | `curl -sf localhost:7180/v1/health` → JSON with `ok: true` |
| 3 | `control.json` published with port + token at mode 0600 | `stat -f '%Lp' "$HOME/Library/Application Support/imagedrip/control.json"` == `600`; file parses and has `port`, `token`, `pid` |
| 4 | Unauthenticated call is rejected | `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:7180/v1/call/domain.get` == `401` |
| 5 | Authenticated `domain.get` returns the live `DomainState` | authed POST returns a body containing `brands` and the active project id |
| 6 | `/v1/verbs` lists every `imagedrip:*` channel in dot-form and excludes `app:*`, `counter:*`, and webview-internal channels | authed `GET /v1/verbs` — count matches the `imagedrip:` entries in `src/shared/ipc.ts`; no `app.info` present |
| 7 | Invalid payload → 422 carrying Zod issues | authed `POST /v1/call/domain.import-prompts` with `{"text":123}` → `422`, body has `issues` |
| 8 | A run-state lock surfaces as 409 with the handler's own message | with a run live, authed `POST /v1/call/domain.save-brand` → `409` and body contains `brand is locked while a run is live` |
| 9 | `control.json` is removed when the app stops | quit the app; file no longer exists |
| 10 | `context.get` degrades rather than erroring | force staleness → `200` with `{active:false}` and a non-empty `hint`; never a 4xx/5xx |
| 11 | Zod schemas are not duplicated | `control-surface.ts` contains no `z.object(` — it resolves schemas from `IpcRouter.list()` |
| 12 | **AC-1** — agent creates a project and sets its output dir | after the probe, `domain.get` shows the new project present and active with the requested `outputDir` |
| 13 | **AC-2** — agent authors a template that survives a restart | `domain.get` shows the template; restart the app; it is still there and selectable |
| 14 | **AC-3** — agent queues twelve prompts | `domain.get` prompt queue length == `12`; the QUEUED pane shows twelve rows |
| 15 | **AC-4** — a blocked step is reported, not routed around | probe transcript contains the refusal and the error text, and no substitute/workaround call follows it |
| 16 | **AC-5** — gated verbs are never auto-invoked | probe transcript contains zero calls to `run.start`, `run.stop`, `run.pause`, `run.resume`, `prompts.clear` |
| 17 | Stream parser handles both output modes and emits no duplicates | unit tests over recorded JSONL fixtures: with and without `--include-partial-messages`; one `tool_use` per call; no repeated text |
| 18 | `npm run chat:probe` completes AC-1→AC-3 headlessly | exits `0` and prints a transcript |
| 19 | Existing IPC path is unbroken | `npm run typecheck` and `npm test` exit `0`; app boots and the renderer still drives the domain |
| 20 | No new runtime dependency | `git diff package.json` shows no added entry under `dependencies` |

## 6. Key References

- **Spec**: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/requirements-v4-resident-chat.md` — §0 prerequisites, §3 invocation + stream protocol, §4 hard constraint, §6 verb surface, §7 ACs, §9 the WP1–WP3 design
- **Predecessor**: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/requirements-v3-templates-and-repos.md` — proposed, **not** implemented here
- **Architecture**: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/imagedrip-plan.md` — the Northstar, domain model, Approach C
- **Working rules**: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/working-rules.md`
- **KDD**: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/kdd/learnings/blocked-postinstall-leaves-a-hollow-package.md` — why npm-only
- **Scaffold**: `/Users/davidcruwys/dev/ad/apps/appytron/CONTEXT.md` — AppyTron primitives (`IpcRouter`, `createConsole`, `ProcessSupervisor`)
- **Sibling dependency** (must exist): `/Users/davidcruwys/dev/ad/apps/appydave-foundation/packages/core`
- **Optional depth** (David's machines only, not required): `/Users/davidcruwys/dev/ad/brains/software-factory-research/resident-chat-operator-pattern.md`

---

## Suggested `/goal` condition

```
In /Users/davidcruwys/dev/ad/apps/imagedrip implement WP1-WP3 of docs/requirements-v4-resident-chat.md (read it first; §9 is the design). npm ONLY (pnpm yields a hollow Electron package); import Zod from @appydave/core. DONE WHEN: (1) IpcRouter in src/main/ipc-router.ts additively records handler defs and exposes list(); (2) new src/main/control-surface.ts serves GET /v1/health (no auth), GET /v1/verbs, GET /v1/context, POST /v1/call/:verb bound to 127.0.0.1 only, verbs named by stripping "imagedrip:" and dot-joining, reusing each def.input Zod schema (control-surface.ts must contain no z.object( ), mapping errors 404 unknown verb / 422 ZodError with issues / 409 handler throw with its message verbatim / 500 otherwise; (3) a per-launch 32-byte hex token plus resolved port written to <userData>/control.json at mode 0600 and deleted on lifecycle.onStop, with Bearer auth on every route except /v1/health returning 401 on mismatch; (4) a context.get handler returning active brand/template/project/mode/run with expiresAt that returns {active:false,hint} when stale and NEVER errors; (5) a stdio MCP server that reads control.json and proxies /v1/verbs as tools with zero logic and when-to-call descriptions; (6) spawn+stream of `claude -p --input-format stream-json --output-format stream-json --verbose` with the prompt as one JSON line on stdin (never argv), a `claude -p --help` capability probe before optional flags, a persisted session id, and a stdout parser emitting status/text_delta/thinking_delta/tool_use/tool_result/usage that dedupes tool_uses repeated in the final assistant wrapper, dedupes text already streamed as deltas, and accumulates fragmented input_json_delta per messageId:blockIndex; (7) `npm run chat:probe` spawns the CLI with that MCP server attached and completes AC-1 (create project + set output dir), AC-2 (create template that survives restart), AC-3 (queue exactly 12 prompts) headlessly, exiting 0 and printing a transcript. VERIFY: npm run typecheck exits 0; npm test exits 0; curl -sf localhost:7180/v1/health returns ok; an unauthed POST /v1/call/domain.get returns 401; an invalid payload returns 422 with issues; stat -f '%Lp' on control.json is 600; unit tests cover the parser with and without --include-partial-messages. MUST NOT: modify src/main/webview-harness.ts, batch-runner.ts, cadence.ts or chatgpt-selectors.ts; write to the ChatGPT webview by any path; invoke run.start/run.stop/run.pause/run.resume/prompts.clear; add any runtime dependency to package.json; implement v3, the in-app chat pane, or ImageDrip skills. Or stop after 30 turns.
```
