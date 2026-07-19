/**
 * Probe C — REAL (spec §7.3). INTERACTIVE — REQUIRES A HUMAN.
 *
 * Opens chatgpt.com in a persistent-partition WebContentsView with the REAL built
 * webview preload. You log in by hand (proves the partition persists auth), then
 * hand-trigger an image generation. Two things happen:
 *   1. The built preload reports `image-done` IF the current selectors match.
 *   2. A DISCOVERY dump (independent of the selectors) logs what the live DOM
 *      actually looks like — so selectors can be re-pinned from reality (§4).
 *
 * Everything is written to  probe/probe-c.log  (JSONL) as well as the terminal,
 * so an observer can read the DOM structure without watching the window.
 *
 * PREREQ: `npm run build` first (builds out/preload/webview-preload.mjs).
 * RUN:    npx electron probe/probe-c.cjs
 * DO:     1) log in when the window opens (persists once)
 *         2) type an image prompt yourself and send it
 *         3) wait for the image to finish rendering
 * READ:   probe/probe-c.log  — discovery lines show every <img>, the composer,
 *         alerts, and assistant-turn count.
 */
const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PRELOAD = path.join(__dirname, '..', 'out', 'preload', 'webview-preload.mjs');
const LOG = path.join(__dirname, 'probe-c.log');
const W = 1100;
const H = 820;

// fresh log per run
fs.writeFileSync(LOG, `# probe-c run ${new Date().toISOString()}\n`);
function log(tag, obj) {
  const line = JSON.stringify({ t: Date.now(), tag, ...obj });
  fs.appendFileSync(LOG, line + '\n');
  console.log(tag, obj && JSON.stringify(obj).slice(0, 300));
}

// Discovery script — runs IN the page (main world), independent of our selectors.
// Reports enough to pin promptInput / latestAssistantTurn / imageInTurn / isLoaded.
const DISCOVER = `(() => {
  const ancestry = (el) => {
    const parts = []; let n = el, d = 0;
    while (n && n.nodeType === 1 && d < 7) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cls = (n.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean).slice(0,3).join('.');
      if (cls) s += '.' + cls;
      for (const a of n.getAttributeNames()) if (a.startsWith('data-')) s += '['+a+'="'+n.getAttribute(a)+'"]';
      parts.unshift(s); n = n.parentElement; d++;
    }
    return parts.join(' > ');
  };
  const imgs = [...document.querySelectorAll('img')]
    .filter(i => i.naturalWidth > 80 && i.naturalHeight > 80)
    .map(i => ({ src: (i.currentSrc||i.src||'').slice(0,90), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete, path: ancestry(i) }));
  const composer = {
    prompt_textarea_id: !!document.querySelector('#prompt-textarea'),
    textarea: !!document.querySelector('textarea'),
    contenteditable: !!document.querySelector('[contenteditable="true"]'),
  };
  const alerts = [...document.querySelectorAll('[role="alert"],[role="status"]')]
    .map(a => (a.textContent||'').trim().slice(0,140)).filter(Boolean);
  const assistantTurns = document.querySelectorAll('[data-message-author-role="assistant"]').length;
  return { url: location.href, assistantTurns, composer, alertCount: alerts.length, alerts, imgCount: imgs.length, imgs };
})()`;

app.whenReady().then(() => {
  const win = new BaseWindow({ width: W, height: H, title: 'Probe C — real ChatGPT' });
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:imagedrip-chatgpt', // same partition the harness uses — log in ONCE
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: W, height: H });
  win.on('resize', () => {
    const [w, h] = win.getContentSize();
    view.setBounds({ x: 0, y: 0, width: w, height: h });
  });

  // 1) the REAL preload channel (fires only if selectors match)
  view.webContents.ipc.on('imagedrip:webview', (_e, msg) => {
    log('← preload', msg);
    if (msg.type === 'image-done') console.log('\n✅ image-done — url:', msg.imageUrl, '\n');
  });

  view.webContents.loadURL('https://chatgpt.com/');

  // 2) discovery dump every 4s (selector-independent) — this is my eyes
  let last = '';
  setInterval(async () => {
    try {
      const d = await view.webContents.executeJavaScript(DISCOVER, true);
      const sig = JSON.stringify({ a: d.assistantTurns, i: d.imgCount, al: d.alertCount });
      if (sig !== last) { last = sig; log('discover', d); }       // log only when it changes
      else if (d.imgCount > 0) log('discover', d);                 // but keep dumping while images present
    } catch (e) {
      log('discover-error', { msg: String(e).slice(0, 120) });
    }
  }, 4000);

  console.log('Probe C: log in, then generate an image by hand. Watching → probe/probe-c.log');
});
