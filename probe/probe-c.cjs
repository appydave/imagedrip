/**
 * Probe C — REAL (spec §7.3). INTERACTIVE — REQUIRES A HUMAN.
 *
 * Opens chatgpt.com in a persistent-partition WebContentsView with the REAL built
 * webview preload. You log in by hand (proves the partition persists auth), then
 * hand-trigger an image generation and watch the terminal for `image-done` with a
 * fetchable URL. This is the end-to-end proof the read path works against live
 * ChatGPT — it cannot be automated (login is human-only) and it exercises OpenAI's
 * live site, so run it deliberately.
 *
 * PREREQ: `npm run build` first.
 * RUN:    npx electron probe/probe-c.cjs
 * DO:     1) log in when the window opens (persists to the partition, once)
 *         2) type an image prompt yourself and send it
 *         3) watch the terminal — a finished image prints `image-done` + a URL
 * NOTE:   the selectors in src/main/chatgpt-selectors.ts are UNVERIFIED placeholders.
 *         If nothing fires, re-pin them against the live DOM (that IS the §4 job).
 */
const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('node:path');

const PRELOAD = path.join(__dirname, '..', 'out', 'preload', 'webview-preload.mjs');
const W = 1100;
const H = 820;

app.whenReady().then(() => {
  const win = new BaseWindow({ width: W, height: H, title: 'Probe C — real ChatGPT' });
  const view = new WebContentsView({
    webPreferences: {
      // Same persistent partition the harness uses — log in ONCE.
      partition: 'persist:imagedrip-chatgpt',
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

  view.webContents.ipc.on('imagedrip:webview', (_e, msg) => {
    console.log('← inbound', JSON.stringify(msg));
    if (msg.type === 'image-done') {
      console.log('\n✅ image-done — url:', msg.imageUrl, '\n');
    }
  });

  view.webContents.loadURL('https://chatgpt.com/');
  console.log('Probe C: log in, then hand-trigger an image generation. Ctrl-C to quit.');
});
