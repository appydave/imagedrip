# AppyTron App (template)

The canonical AppyTron scaffold — a **self-contained native desktop app** (Electron) that leans
on the shared `@appydave/core` foundation. This directory *is the product*: `create-appytron`
copies it to make a new app.

## Stack

- **Electron** (`electron-vite` + `electron-builder`) — main / preload / renderer split
- **React + Vite + Tailwind + Zustand** in the renderer
- **`@appydave/core`** — Lifecycle · Logger · ConfigLoader · Store (shared foundation)
- AppyTron's own **Tier-2 primitives** live here as source: `WindowManager`, `IpcRouter`,
  `Bridge` (preload), `createConsole()`

## Run

```bash
npm install      # installs Electron + links @appydave/core
npm run dev      # opens a window; shows app info + a typed IPC round-trip
npm run typecheck
npm run build
```

## Security defaults (docs §9)

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload is the only
door — a minimal typed API on `window.appytron`. Every IPC payload is Zod-validated in main.

## Note — `@appydave/core` dependency

During local dev this template references the foundation via a `file:` path
(`file:../../appydave-foundation/packages/core`). When `create-appytron` scaffolds a real app,
that is rewritten to the published `@appydave/core@^x.y.z` (mirrors how AppySentinel's CLI
rewrites `workspace:*` → semver).
