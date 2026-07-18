/**
 * webview-preload — the trusted reader injected into the ChatGPT `WebContentsView`.
 *
 * Runs in an ISOLATED WORLD (contextIsolation on). It reads the DOM and reports to
 * main on ONE namespaced inbound channel (`WEBVIEW.inbound`). It exposes NOTHING to
 * the page's `window` — no `contextBridge`, so ChatGPT's own JS can never see us
 * (spec §2/§8). All reads are invisible to the server (no network the server sees).
 *
 * This file is bundled by electron-vite into `out/preload/webview-preload.mjs`; the
 * selector import below is inlined at build time (the ONE swappable module, §4).
 */
import { ipcRenderer } from 'electron';
import { CHATGPT_SELECTORS as S } from '../main/chatgpt-selectors';
import { WEBVIEW, type WebviewInbound } from '../shared/ipc';

function report(msg: WebviewInbound): void {
  ipcRenderer.send(WEBVIEW.inbound, msg);
}

/** Latest assistant turn → first decoded <img>. Returns its stable src, or null. */
function findFinishedImageSrc(): string | null {
  const turns = document.querySelectorAll<HTMLElement>(S.latestAssistantTurn);
  const turn = turns[turns.length - 1];
  if (!turn) return null;
  const imgs = turn.querySelectorAll<HTMLImageElement>(S.imageInTurn);
  for (const img of Array.from(imgs)) {
    if (S.isLoaded(img)) return img.currentSrc || img.src;
  }
  return null;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').toLowerCase();
}

/** Does any node matching `sel` contain one of `phrases` (case-insensitive)? */
function findPhraseMatch(sel: string, phrases: string[]): string | null {
  const nodes = document.querySelectorAll(sel);
  for (const node of Array.from(nodes)) {
    const t = textOf(node);
    if (phrases.some((p) => t.includes(p.toLowerCase()))) return node.textContent ?? '';
  }
  return null;
}

// De-dupe: image-done fires repeatedly as the DOM settles → emit once per src.
let lastImageSrc: string | null = null;
let lastRefusedTurnText: string | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function scan(): void {
  // 1. Finished image (debounced by the settle timer that calls us).
  const src = findFinishedImageSrc();
  if (src && src !== lastImageSrc) {
    lastImageSrc = src;
    report({ type: 'image-done', imageUrl: src, at: Date.now() });
  }

  // 2. Rate-limit banner (selector + text gate).
  const limitText = findPhraseMatch(S.rateLimitBanner, S.rateLimitPhrases);
  if (limitText) report({ type: 'rate-limit', text: limitText, at: Date.now() });

  // 3. Content-policy refusal in the latest assistant turn.
  if (S.refusalMarker) {
    const turns = document.querySelectorAll(S.refusalMarker);
    const turn = turns[turns.length - 1] ?? null;
    const t = textOf(turn);
    if (t && S.refusalPhrases.some((p) => t.includes(p.toLowerCase()))) {
      // Only fire once per distinct refusal turn.
      if (t !== lastRefusedTurnText) {
        lastRefusedTurnText = t;
        report({ type: 'refused', at: Date.now() });
      }
    }
  }
}

const observer = new MutationObserver(() => {
  // Debounce ~300ms of no further mutation before declaring "done" (spec §2).
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(scan, 300);
});

function start(): void {
  if (!document.body) {
    // body not parsed yet — retry on DOMContentLoaded.
    window.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }
  observer.observe(document.body, { childList: true, subtree: true });
  scan(); // initial pass (a page reload mid-generation)
}
start();

// On request from main, report the composer input rect (center) for a synthesized click.
ipcRenderer.on(WEBVIEW.locateInput, () => {
  const el = document.querySelector<HTMLElement>(S.promptInput);
  const r = el?.getBoundingClientRect();
  report({
    type: 'input-rect',
    rect: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null,
  });
});
