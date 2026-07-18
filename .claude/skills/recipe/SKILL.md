---
name: recipe
description: Scaffold AppyTron capability patterns into this desktop app. Use when the developer says "recipe", "add a recipe", "wrap-cli", "wrap a CLI", "wrap the CLI", "landing page", "download page", "add nav shell", or "scaffold <feature>". Each recipe is a reference spec Claude reads, then builds into the running app to fit its current structure.
---

# AppyTron Recipes

Recipes are **composable, idempotent capability patterns**. Each file in `references/` is the
**contract** — read it fully, inspect *this* app's current structure, then scaffold code that
*fits* (concrete file / component / channel names, never generic stubs). Recipes build on the
app's primitives: `@appydave/core` (Lifecycle · ConfigLoader · Logger · Store) and AppyTron's
Tier-2 primitives in `src/main/` (`WindowManager`, `IpcRouter`, `Bridge`, `ProcessSupervisor`,
`FileAuthor`, `Updater`, `createConsole`).

## Available recipes

| Recipe | What it builds | Reference |
|--------|----------------|-----------|
| **nav-shell** | The app-shell layout — sidebar rail + workspace, view switching (no router) | `references/nav-shell.md` |
| **ipc-crud** | Typed CRUD for an entity, local-first, over the IPC bridge | `references/ipc-crud.md` |
| **wrap-cli** | Turn an off-the-shelf CLI into a native desktop console | `references/wrap-cli.md` |
| **landing-page** | A branded landing + download page (the app's distribution surface) | `references/landing-page.md` |

## How to run a recipe

1. **Read** `references/<recipe>.md` fully — it is the source of truth for what to build.
2. **Inspect** the app so the output fits: `src/shared/ipc.ts` (channel contract),
   `src/main/create-console.ts` (facade), `src/renderer/src/` (views + Zustand store).
3. **Scaffold** the feature, wiring the existing primitives. Keep it **idempotent** — re-running
   the recipe must not duplicate channels, views, or handlers.
4. **Verify**: `npm run typecheck` must stay clean; the developer runs `npm run dev` to see it.

## Security (docs §9 — non-negotiable)

- Every new IPC channel is registered via `IpcRouter` and **Zod-validated** in main.
- `wrap-cli` drives CLIs with **arg allow-lists**, never string-concatenated shell.
- File writes go through `FileAuthor` (path-scoped to a root; git-committed).
