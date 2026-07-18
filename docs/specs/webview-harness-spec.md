---
spec: webview-harness
project: imagedrip
donates_to: appytron   # recipe contributed back to template/.claude/skills/recipe/references/
status: proposed
created: 2026-07-19
electron: "^34.2.0"    # from appytron/template — dictates WebContentsView (not BrowserView)
implements: imagedrip-plan §4 Approach C
security: lethal-trifecta (embedded remote origin + synthesized input + file writes)
---

# Spec — `webview-harness` Recipe (Approach C core)

**Goal:** embed a real, logged-in ChatGPT inside the app, **write to it like a human** (synthesized
OS-level input), and **read its DOM** to detect "image done" + harvest the result — with **no paid
API**. This is the mechanism that turns the AppyTron starter into ImageDrip. Authored by ImageDrip,
**donated back** to AppyTron as a recipe.

## Design invariants (the whole point)
1. **Write = synthesized OS input** (`webContents.sendInputEvent`), never JS `.value=`/dispatched
   events. Synthesized input travels the real Chromium input pipeline → the page sees
   `event.isTrusted === true`, indistinguishable from a human. *(Assumption to verify empirically in
   the probe — §7. If it proves false, Approach C's stealth premise weakens; fall back to
   conservative cadence.)*
2. **Read = DOM only** (MutationObserver in a trusted preload). Reads never touch the network the
   server sees — invisible. All fragility lives here, so isolate it (§4).
3. **The harness is mechanism, not policy.** It exposes events + a `feed()`; *when* to feed next is
   the CadenceEngine's job (separate module). Keep them decoupled.

## API — Electron 34 (`WebContentsView`)
`BrowserView` is deprecated in Electron 34; use **`WebContentsView`** added as a child view of the
`BaseWindow`/`BrowserWindow`'s content view, positioned by explicit bounds.

```ts
export interface WebviewHarnessOptions {
  window: BrowserWindow;                 // host window
  partition?: string;                    // default 'persist:imagedrip-chatgpt' (login persists)
  url?: string;                          // default 'https://chatgpt.com/'
  selectors: ChatGPTSelectors;           // swappable — see §4
  fileAuthor: FileAuthor;                // AppyTron scoped/committed writer (harvest target)
  logger?: Logger;
}

export interface WebviewHarness {
  attach(bounds: Rect): void;            // add the view + position it
  setBounds(bounds: Rect): void;         // renderer sends its panel rect on layout/resize
  newConversation(): Promise<void>;      // fresh chat before a batch (navigate to new-chat URL)
  feed(prompt: string): Promise<void>;   // clipboard → click input → Cmd+V → Enter (synthesized)
  onImageDone(cb: (e: { imageUrl: string; at: number }) => void): void;
  onRateLimit(cb: (e: { text: string; at: number }) => void): void;
  onRefused(cb: (e: { at: number }) => void): void;
  onStall(cb: (e: { waitedMs: number }) => void): void;
  harvest(imageUrl: string, relPath: string): Promise<string>; // fetch(in-session) → FileAuthor
  stop(): void;                          // detach view, dispose observers/timers
}
```

**Layout note:** `WebContentsView` is positioned by absolute bounds over the window, not in the DOM
flow. The renderer reserves a panel, measures its rect (`getBoundingClientRect` → device px), and
sends it over IPC; main calls `setBounds`. Re-send on window resize + panel layout change.

## 1. Session & view creation (main)
```ts
const view = new WebContentsView({
  webPreferences: {
    partition: opts.partition ?? 'persist:imagedrip-chatgpt', // cookies persist → log in once
    preload: webviewPreloadPath,          // OUR trusted reader (see §2)
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,                        // ESM preload constraint (matches AppyTron CONTEXT §6/§8)
  },
});
window.contentView.addChildView(view);
view.webContents.loadURL(opts.url ?? 'https://chatgpt.com/');
```
- The persistent partition means the user logs into ChatGPT **once**; the session sticks across
  restarts. Treat that partition like a browser profile (it holds auth cookies) — never log it,
  never expose it to the renderer.

## 2. The webview preload (read/report — the ONLY channel out of the page)
A dedicated preload injected into the ChatGPT view. It runs in an **isolated world** (contextIsolation
on), reads the DOM, and reports to main via a **single namespaced inbound channel**. It exposes
**nothing** to the page's `window` (no `contextBridge` to the page — ChatGPT's JS must not see us).

```ts
// webview-preload.ts (runs inside the ChatGPT view)
import { ipcRenderer } from 'electron';
const S = SELECTORS; // injected/imported swappable module

const observer = new MutationObserver(() => {
  const img = findFinishedImage(S);            // latest assistant turn, <img> with a real, loaded src
  if (img) ipcRenderer.send('imagedrip:webview', { type: 'image-done', imageUrl: img.src, at: Date.now() });

  if (matches(S.rateLimitBanner)) ipcRenderer.send('imagedrip:webview', { type: 'rate-limit', text: bannerText(), at: Date.now() });
  if (matches(S.refusalMarker))   ipcRenderer.send('imagedrip:webview', { type: 'refused', at: Date.now() });
});
observer.observe(document.body, { childList: true, subtree: true });

// on request from main, report the input box rect for a synthesized click
ipcRenderer.on('imagedrip:locate-input', () => {
  const r = document.querySelector(S.promptInput)?.getBoundingClientRect();
  ipcRenderer.send('imagedrip:webview', { type: 'input-rect', rect: r && { x: r.x + r.width/2, y: r.y + r.height/2 } });
});
```
Main receives on `view.webContents.ipc.on('imagedrip:webview', …)` and de-bounces (image-done can
fire multiple times as the DOM settles → emit once per generation, keyed by imageUrl).

**"Finished image" test** (in `findFinishedImage`): the latest assistant turn contains an `<img>`
whose `src` is a stable `https`/`blob:` URL (not a placeholder/spinner) **and** `naturalWidth > 0`
(actually decoded). Debounce ~300ms of no further mutation before declaring done.

## 3. Input injection (`feed`) — synthesized, human-signature
Per prompt:
1. `clipboard.writeText(prompt)` (harness owns the clipboard for the duration of `feed`; flag if the
   user copies mid-batch — §8).
2. Ask the preload for the input rect (`imagedrip:locate-input`) → synthesize a **real mouse click**
   there via `sendInputEvent` (`mouseDown`+`mouseUp`) to focus the box like a human (not JS `.focus()`).
3. Paste. **⚠️ VERIFIED CORRECTION (probe/probe-feed.cjs, 2026-07-19):** a synthesized
   **Cmd+V** via `sendInputEvent` is a **no-op** into a contenteditable composer — it does
   NOT paste. Use **`view.webContents.paste()`** (the real Edit>Paste editing command)
   instead: observed to fire `paste` + `input` events with `isTrusted === true`, so it
   upholds invariant #1 (trusted input, not JS `.value=`) *and* actually lands the text.
   (The click in step 2 does focus the composer — `activeElement` confirmed.)
4. Synthesize **Enter**: `keyDown`/`keyUp` `'Return'`. *(If ChatGPT ever requires Cmd+Enter to send,
   put the submit key in the selector module.)*
5. Record `feedAt = Date.now()`; the matching `image-done` gives the **measured generation time** the
   CadenceEngine learns from.

## 4. Selectors — one swappable module (all fragility here)
ChatGPT obfuscates/renames DOM classes; expect churn. Keep every selector + predicate in one file so
re-pinning is a 5-minute edit, not a code hunt.
```ts
export interface ChatGPTSelectors {
  promptInput: string;          // the composer textarea / contenteditable
  latestAssistantTurn: string;  // container of the newest assistant message
  imageInTurn: string;          // <img> within an assistant turn
  isLoaded(img: HTMLImageElement): boolean; // real src + naturalWidth>0
  rateLimitBanner: string;      // "you've hit your image limit" surface
  refusalMarker?: string;       // content-policy refusal text/marker
  submitKey: 'Return' | 'Cmd+Return';
  newChatUrl: string;           // e.g. 'https://chatgpt.com/'
}
```

## 5. Harvest (download → route)
On de-duped `image-done`:
```ts
async function harvest(imageUrl, relPath) {
  // fetch IN the same session partition so CDN/auth cookies apply
  const buf = await view.webContents.session.fetch(imageUrl).then(r => r.arrayBuffer());
  return fileAuthor.write(relPath, Buffer.from(buf), `harvest ${relPath}`); // scoped + git-committed
}
```
- `relPath` comes from a caller-supplied `nameFor(index) => relPath` (domain model: prompt → filename).
- Append a provenance line (prompt, url, file, at) — via `Store` or a `FileAuthor`-written log.
- `FileAuthor` refuses any path outside its scoped root → images can land **only** in the project dir.

## 6. Control flow (Batch Runner uses it)
```
newConversation() ──► for each prompt:
   feed(prompt) ──► [await one of] ──► image-done ─► harvest+name+route ─► CadenceEngine.next()
                                    ├─ rate-limit  ─► pause + notify (long backoff / stop)
                                    ├─ refused     ─► log + skip + continue
                                    └─ stall (no event in N× learned time) ─► pause + notify
                                                    (never blind-resend — risks double submit)
STOP key (global-shortcut) ─► halt immediately, leave session intact
```

## 7. Build order — probe first (de-risk the two novel mechanisms cheaply)
Mirror `create-appytron/probe`. Before wiring ChatGPT:
1. **Probe A — read:** `WebContentsView` → a local test page that generates DOM mutations on a timer;
   confirm the preload's MutationObserver reports to main. (Proves the read path.)
2. **Probe B — write + isTrusted:** point at a tiny page that logs `event.isTrusted` for input events;
   confirm `sendInputEvent` clicks/keys arrive as `isTrusted:true`. **This validates invariant #1** —
   the entire stealth premise. Do this before touching ChatGPT.
3. **Probe C — real:** point at chatgpt.com, log in manually (proves the persistent partition),
   observe a hand-triggered generation firing `image-done` with a valid URL; then enable `feed`.

Only after A+B+C pass do you build Batch Runner on top.

## 8. Security & risks
- **Untrusted remote origin + our preload:** contextIsolation on; the preload exposes nothing to the
  page; one namespaced inbound IPC channel; no Node in the view. (AppyTron §6/§9.)
- **`FileAuthor` scoped root only**, every harvest committed (revert point).
- **`sandbox:false`** for the ESM preload today (AppyTron gotcha §8) — revisit when a CJS preload path
  exists.
- **Clipboard contention:** the harness owns the clipboard during `feed`; a user copy mid-batch could
  paste the wrong thing. Mitigate: feed is fast (write→click→paste→enter in <150ms) and gated by the
  cadence pause; optionally snapshot/restore the prior clipboard around each feed.
- **Selector churn:** ChatGPT DOM changes → §4 module is expected maintenance, not a bug.
- **Account/ToS risk:** automating ChatGPT (even a real session) sits against OpenAI ToS; cost of
  error is the account. Conservative default cadence + rate-limit guard + STOP are the mitigations,
  not guarantees. (imagedrip-plan §7; brains/personal-security.)
- **`isTrusted` assumption:** verified in Probe B, not assumed. Gate the build on it.

## 9. Acceptance criteria
- [ ] Manual ChatGPT login persists across an app restart (partition works).
- [ ] Probe B: `sendInputEvent` input registers as `isTrusted:true`.
- [ ] `feed(prompt)` submits the prompt into ChatGPT via synthesized Cmd+V+Enter.
- [ ] `image-done` fires once per real generation with a fetchable image URL.
- [ ] `harvest` writes the image to the scoped project dir and git-commits it.
- [ ] Rate-limit banner → `onRateLimit` → run pauses (no blind spinning).
- [ ] Swapping the selector module re-targets without touching harness code.
- [ ] STOP halts mid-batch, session intact.

## 10. Deliverables
| Artifact | Path |
|----------|------|
| Recipe reference (donated) | `appytron/template/.claude/skills/recipe/references/webview-harness.md` |
| Harness module | `imagedrip/src/main/webview-harness.ts` |
| Webview preload | `imagedrip/src/preload/webview-preload.ts` |
| Selector module | `imagedrip/src/main/chatgpt-selectors.ts` |
| Probes A/B/C | `imagedrip/probe/` |
| Companion recipes | `image-harvest`, `rate-limit-guard`, `human-cadence` (own specs, same pattern) |
