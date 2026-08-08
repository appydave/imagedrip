---
doc: handover
project: imagedrip
created: 2026-08-08
supersedes: docs/handover-2026-08-07-product-fixes.md (still accurate for everything before WP4)
state: WP4 §8 steps 1–5 built and verified IN THE APP. Committed and pushed.
  Nothing half-done. The next unit of work is a CHOICE — see "Where to pick up".
---

# Handover — ImageDrip, v4 WP4 (the in-app `Context ｜ Chat` pane)

## Launch line

```
cd /Users/davidcruwys/dev/ad/apps/imagedrip
```
```
claude --permission-mode auto --model opus -n imagedrip "You must be running in /Users/davidcruwys/dev/ad/apps/imagedrip — verify your cwd before anything else and STOP if it differs. Read /Users/davidcruwys/dev/ad/apps/imagedrip/CLAUDE.md and docs/north-star.md first — the North Star was ratified 2026-08-08 and it decides feature arguments. Then read docs/handover-2026-08-08-wp4-chat-pane.md in full. Never write to the ChatGPT webview by any path. Never call repo.attach. Ask David explicitly before any run.start, every time. Keep npm run chat:probe passing."
```

---

## State

| | |
|---|---|
| Branch | `main`, clean, pushed. |
| Tests | 399 passing. `npm run typecheck` and `npm run build` green. |
| Probe | `npm run chat:probe` — 13/13, exit 0. |
| App | Runs. The chat was driven end to end through the real UI on 2026-08-08. |

**Start with `npm run dev:clean`.** Not `npm run dev` against a running app — the
single-instance lock means the second one surrenders and focuses the old window,
which looks like it worked.

---

## What WP4 shipped

The five steps of `docs/wp4-chat-pane-research.md` §8, in order.

**§8.1 — one implementation, not two.** `scripts/claude-{cli,stream}.mjs` moved
to `src/main/*.ts`. `chat-probe.mjs` imports them directly (Node 22.18+ strips
the types), so the headless probe and the in-app pane run the SAME code — which
is what makes the probe evidence about the pane. The six-event union lives in
`src/shared/chat.ts`.

**§8.2 — D2 containment, enforced not described.** The chat runs with
`Read/Glob/Grep` + the ImageDrip MCP verbs, and with `Bash`, `Write`, `Edit`,
`NotebookEdit` disallowed. `buildChatArgs()` is the only door the pane may use
and it THROWS when the probe cannot confirm the tool-restriction flags. Spawn is
lazy; teardown is a sibling step in `will-quit`.

**§8.3 — the push channel.** `IPC.chatEvent`, built like `runStatus` and
`harnessEvent`. Deltas coalesce on a ~24ms frame budget, merging only ADJACENT
deltas of the same kind, flushing immediately at end of turn.

**§8.4 — the D1 human gate.** `gated: true` used to be metadata the model could
decline to honour. Now a gated verb **from the pane** is held in `main` until a
person answers. Everything else — terminal, `curl`, `chat:probe`, an agent on
the control surface — keeps today's behaviour, which is what keeps the probe
headless and keeps *"agents are first-class operators"* true.

**§8.5 — the tab.** The CONTEXT column is now `CHAT ｜ CONTEXT`, with the
transcript, the verb calls the agent made, and the running cost.

---

## Two decisions I made, both cheap to reverse

**1. Chat is the DEFAULT tab.** §5 of the requirements drafted it as
`Context ｜ Chat`; the North Star inverts that — *"typing into controls by hand
is the fallback, not the design."* The choice is remembered in
`localStorage['imagedrip.ctxTab']`, so disagreeing costs one click, once. The
default lives in `ctxTabOf()` in `src/renderer/src/store.ts`.

**2. The chat is GLOBAL, not per project.** Research §7 Q3 left this open. The
Star settles it: per-project is incoherent under *"just say it in chat"*,
because asking the chat to switch project would destroy the conversation that
was mid-way through switching it. It also keeps the CLI session id out of
`domain.json`, which is mirrored to the brand repo and would put a session id
into git.

**Still open, and deliberately not guessed: does the transcript persist to
disk?** (Research §7 Q4.) Today it lives in the store for the life of the app.
A run's provenance survives in `manifest.json`; the chat that configured it does
not.

---

## Three defects found, all by RUNNING it

None of these were visible from a green test suite.

1. **The capability probe read half its input.** `claude -p --help` writes ~15 KB
   and exits; macOS starts a pipe at 8 KB; Electron's main process does not
   drain in time. It saw 45 of 65 flags, `--verbose` fell past the cut, and the
   pane refused to open — blaming the user's CLI, confidently and wrongly. Now
   reads via a temp file. Full write-up, with the reproduction:
   `docs/kdd/learnings/a-truncated-probe-reads-as-an-absent-flag.md`.
   **This is the one to read** — it is the repo's cardinal sin in a new place.
2. **`startClaude` dropped the last line of stdout** when it carried no trailing
   newline. That line is the `result` frame, so the turn it closed never
   settled: a 7-minute hang on a CLI that had already exited cleanly.
3. **`send()` claimed `busy` after awaiting the lazy spawn**, so two quick
   messages could each spawn a CLI, orphaning the first with an open stdin.

Plus a false RED: `chat:probe` failed AC-2 on any second run, because it created
a second template of the same fixed name and then compared the newly-selected id
against the older record. The template name is timestamped now, as the project
name already was.

---

## What is verified, and how

Everything below was driven through the real UI over the Electron debugging port
(`npm run dev -- --remote-debugging-port=9222`, then CDP `Runtime.evaluate` —
no code change, the arg passes straight through).

| Claim | Evidence |
|---|---|
| A `text_delta` stream reaches React | `done · 6 batches / 10 events · 35 chars`, text rendered |
| The gate holds a real call | `domain.reset-run` from the pane blocked **34.8s** until answered |
| Deny is honoured and final | `403 confirm_denied`, verb never executed |
| The gate is not too wide | `chat:probe` 13/13 with D1 live |
| Switching tabs does not move the ChatGPT view | reserved rect identical: `[640, 85, 560, 702]` |
| The transcript survives a tab switch | store-held; checked by switching away and back |

**Not verified:** the gate's 120s TIMEOUT path in the running app (unit-tested
only — `test/chat-gate.test.ts`), and transcript persistence across an app
restart, which does not exist yet.

---

## ⚠️ One thing I broke and repaired

While driving the UI I used `document.querySelector("textarea")`, which is the
**brand body** — not the chat composer, which is index 6 of 7. The AppyDave
brand body was overwritten and autosaved.

**It was restored byte-for-byte** from the `domain.get` responses captured in
three independent `chat-probe` transcripts (all three agreed), and the restore
was verified by comparison. Nothing else was touched. Worth knowing in case
anything about that brand looks off.

Related, and yours to clean up if you care: the probe runs left several
`Probe Spring Nails …` projects and `Catalogue Tile …` templates in the store.
`template.delete` / `project.delete` are gated, so I left them.

---

## Where to pick up — a choice, not a continuation

1. **Transcript persistence** (research §7 Q4). The only open question WP4 left.
   Recommended shape: a sidecar under `userData`, written incrementally — NOT at
   quit, because `dev:watch`'s own restart bypasses `before-quit`.
2. **Run the remaining nine 12-days prompts.**
   `docs/samples/12-days-thumbnails/remaining-nine.blocks.txt`. **`run.start`
   needs David's explicit go, every time** — and it now raises a confirm dialog
   as well.
3. **Interpolation variables.** Named in the North Star as the example of
   *"flexible for prompt shapes not invented yet."*
4. **Fix `repo.attach` properly** (import-only + explicit per-record publish).
   It is currently hard-denied to the pane — see `PANE_DENIED_VERBS` in
   `verb-policy.ts` — because a yes/no confirm cannot honestly describe what it
   does. Fixing it deletes that list.
5. **Distribution.** The North Star's second open item: every install assumes
   David's machine and a hand-signed-in ChatGPT.

---

## Gotchas this session added

- **Driving the renderer over CDP works and needs no code change** —
  `npm run dev -- --remote-debugging-port=9222` passes the flag through
  electron-vite. Use precise selectors; the CONTEXT column has seven textareas.
- **The pane's credential is in `<userData>/chat-mcp.json`** (0600), regenerated
  per CLI spawn and revoked when the child dies. It is NOT in `control.json`, on
  purpose: holding the bearer token must not make you the pane.
- **`imagedrip:chat:*` are in `NEVER_EXPOSED`.** Publishing `chat.send` would
  hand the contained agent a tool that prompts itself.
- The old gotchas all still apply — see
  `docs/handover-2026-08-07-product-fixes.md`.
