/**
 * Probe A — READ path (spec §7.1).
 *
 * Loads the REAL built webview preload (out/preload/webview-preload.mjs) into a
 * WebContentsView over a local page that emits a ChatGPT-shaped assistant turn with
 * a finished blob: image. Confirms the preload's MutationObserver detects it and
 * reports `image-done` to main on the `imagedrip:webview` channel.
 *
 * PREREQ: `npm run build` first (this uses the built preload).
 * RUN:    npx electron probe/probe-a.cjs
 * PASS:   the terminal prints  ← inbound { type: 'image-done', imageUrl: 'blob:…' }
 */
const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('node:path');

const PRELOAD = path.join(__dirname, '..', 'out', 'preload', 'webview-preload.mjs');
const PAGE = path.join(__dirname, 'pages', 'probe-a.html');

app.whenReady().then(() => {
  const win = new BaseWindow({ width: 900, height: 700, title: 'Probe A — read path' });
  const view = new WebContentsView({
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 700 });

  let gotImage = false;
  view.webContents.ipc.on('imagedrip:webview', (_e, msg) => {
    console.log('← inbound', JSON.stringify(msg));
    if (msg.type === 'image-done') {
      gotImage = true;
      console.log('\n✅ PASS — preload reported image-done via MutationObserver.\n');
    }
  });

  view.webContents.loadFile(PAGE);

  // Fail-safe timeout so the probe never hangs headless.
  setTimeout(() => {
    if (!gotImage) console.log('\n❌ No image-done within 8s — read path NOT confirmed.\n');
    app.quit();
  }, 8000);
});
