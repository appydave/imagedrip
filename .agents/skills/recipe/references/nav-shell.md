# Recipe: nav-shell

**The app-shell layout: a sidebar rail + a workspace area, with view switching.**
AppyTron's version of AppyStack's `nav-shell` — the same skeleton, adapted for a desktop app:
**no browser router / URLs** (view state lives in Zustand), native window chrome, and the
eve-studio "rail of items → per-item workspace" shape for operator consoles.

## What it builds

```
src/renderer/src/
├── shell/NavShell.tsx     # the frame: <Rail/> + <Workspace/>
├── shell/Rail.tsx         # left sidebar — nav items (+ optional per-item list)
├── shell/Workspace.tsx    # right area — renders the active view
├── shell/nav-store.ts     # Zustand: activeView (+ activeItemId for rail-of-items mode)
└── views/<View>.tsx       # one component per view
```

## Steps

1. **Pick the shape** with the developer:
   - *simple*: a fixed set of nav items (Home, Settings, …) → one active view.
   - *rail-of-items*: a dynamic list in the rail (e.g. agents, projects) → each opens its own
     workspace (the eve-studio pattern). Combine with `ipc-crud` for the item list.
2. **Scaffold** `NavShell` as the root component the app renders (replace the demo `App` body,
   or mount inside it). Wire `nav-store` for `activeView` — a plain discriminated union, switched
   in `Workspace.tsx`. **No react-router** — it's a window, not a page.
3. **Style** with Tailwind + the AppyDave palette (use `appydave-palette` if present). Respect the
   macOS `hiddenInset` titlebar — leave drag room at the top (`-webkit-app-region: drag`).
4. **Keyboard**: optional — wire number keys / Cmd+1..n to switch views via a renderer key handler.

## Wiring notes

- View state is renderer-only (Zustand). Data behind a view comes over IPC (`window.appytron.*`).
- For a dynamic rail, the item list is an `ipc-crud` entity; selecting an item sets
  `activeItemId` and the workspace renders that item's views.

## Acceptance (drive the real app)

1. The rail switches the workspace view with no flicker/reflow.
2. In rail-of-items mode, selecting an item shows its workspace; the selection persists in the
   store across view switches.
3. `npm run typecheck` clean.

## Idempotency

If a `shell/` already exists, extend `nav-store`'s view union and add a `views/<View>.tsx` — do
not regenerate the whole shell.
