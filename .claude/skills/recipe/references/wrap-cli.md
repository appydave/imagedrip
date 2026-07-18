# Recipe: wrap-cli

**Turn an off-the-shelf CLI into a native desktop console — no terminal.**
This is AppyTron's signature move (the generalization of what eve-studio did for the `eve` CLI):
point the app at a capable CLI, and drive it from a GUI.

## Inputs

- **`<cli>`** — the command to wrap (e.g. `gh`, `ansible`, a project CLI).
- Optionally a **capability manifest** the developer supplies when the CLI isn't introspectable.

## Step 1 — Discover capabilities

Prefer **auto-discovery**, fall back to a manifest:
1. Run `<cli> --help` (and `<cli> <sub> --help`) to enumerate subcommands, flags, and whether
   each is read-only or mutating.
2. If `--help` isn't parseable, ask the developer for a small manifest:
   `{ command, subcommands: [{ name, args, mutating }] }`.
3. Confirm with the developer **which** capabilities to surface first (start with 2–4).

## Step 2 — Scaffold (files this recipe creates/edits)

```
src/main/cli/<cli>.ts        # adapter: how to invoke this CLI + the allow-listed subcommands
src/shared/ipc.ts            # + channels: cli:<cli>:invoke, cli:<cli>:stream, cli:<cli>:cancel
src/main/create-console.ts   # register the handlers in registerIpc()
src/preload/index.ts         # + the typed methods on window.appytron.<cli>
src/renderer/src/views/<Cap>.tsx   # one view per surfaced capability
src/renderer/src/views/Console.tsx # streamed stdout/stderr log
src/renderer/src/store/<cli>.ts    # Zustand: invocation state + history
```

## Step 3 — Wire the primitives

- **Invocation** uses `ProcessSupervisor.spawn({ command: '<cli>', args })` — stream `onLog` to
  the Console view over an `IpcRouter` channel; expose `onExit` status.
- **State/history** lives in a Zustand store; persist with `@appydave/core` `Store` if the
  developer wants history across restarts.
- **Layout** uses the `nav-shell` (a rail of capabilities → per-capability workspace).

## Step 4 — Security (docs §9)

- Build an **arg allow-list** from the discovered subcommands; the invoke handler rejects any
  command/flag not on it. **Never** string-concatenate a shell — pass `args: string[]` to
  `ProcessSupervisor` (which uses `spawn`, no shell).
- **Zod-validate** the invoke payload in `IpcRouter` before spawning.
- If the CLI writes files the app then reads, scope those reads/writes via `FileAuthor`.

## Acceptance (verify by driving the real app)

1. A discovered command **executes from the GUI** and its output **streams live**.
2. A second command works; the app never opens a terminal.
3. Invocation **history persists** (if `Store` was wired) across an app restart.
4. `npm run typecheck` is clean.

## Idempotency

Re-running `wrap-cli <cli>` must not duplicate channels, preload methods, or views — detect
existing `cli:<cli>:*` channels and extend rather than re-add.
