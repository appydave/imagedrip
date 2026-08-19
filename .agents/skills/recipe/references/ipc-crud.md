# Recipe: ipc-crud

**Typed CRUD for an entity, local-first, over the IPC bridge.**
AppyTron's replacement for AppyStack's `entity-socket-crud` — same intent ("manage a list of
things"), different transport: no Express, no Socket.io. The main process owns the data in an
`@appydave/core` `Store`; the renderer talks to it over Zod-validated IPC channels. The template's
persistent counter is the minimal precedent — this generalizes it to a full entity.

## Inputs

- **`<Entity>`** — the thing being managed (e.g. `Project`, `Note`), and its fields.

## What it builds

```
src/shared/ipc.ts            # + channels: <entity>:list / :create / :update / :delete  (+ types)
src/main/store/<entity>.ts   # createStore<Entity[]>({ path: userData/<entity>.json, defaults: [] })
src/main/index.ts            # register the four handlers (Zod-validated) in registerIpc()
src/preload/index.ts         # + window.appytron.<entity>.{ list, create, update, remove }
src/renderer/src/store/<entity>.ts   # Zustand: items + actions
src/renderer/src/views/<Entity>List.tsx   # list + add/edit form
```

## Steps

1. **Define the entity type** in `src/shared/ipc.ts` (id + fields) and add the four channel names
   to the `IPC` map.
2. **Main store**: a single `createStore<Entity[]>` keyed on `app.getPath('userData')`. Create it
   lazily (needs app-ready), exactly like the counter demo in `main/index.ts`.
3. **Handlers** (Zod-validated at the boundary — untrusted renderer input):
   - `list` → `store.read()`
   - `create(input)` → `store.update(items => [...items, { id: crypto.randomUUID(), ...input }])`
   - `update(id, patch)` / `delete(id)` → `store.update(...)` returning the new list.
   Every write goes through `Store` (atomic + serialised — no lost writes).
4. **Preload**: expose `window.appytron.<entity>.*` (minimal typed methods).
5. **Renderer**: a Zustand store mirroring the list + a `<Entity>List` view (list + form). Pair
   with `nav-shell` for placement.

## Security (docs §9)

- Zod-validate every create/update payload in main before touching the store.
- If an entity references files on disk, mutate them via `FileAuthor` (scoped + committed), never
  raw `fs`.

## Acceptance (drive the real app)

1. Create → the item appears and **persists across restart** (it's in the JSON store).
2. Update and delete reflect immediately and survive restart.
3. Rapid concurrent creates never lose a write (the `SerialQueue` inside `Store` guarantees this).
4. `npm run typecheck` clean.

## Idempotency

Re-running for the same entity extends the existing channels/handlers/store — it does not
duplicate them.
