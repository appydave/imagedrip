/**
 * Probe B — WRITE path + isTrusted (spec §7.2). THE GATE for Approach C.
 *
 * Synthesizes a mouse click and a keydown with `webContents.sendInputEvent`, then
 * reads back what the page recorded for `event.isTrusted`. If both are `true`, the
 * stealth premise (invariant #1) holds: synthesized input is indistinguishable from
 * a human's. If either is `false`, STOP and re-evaluate the whole approach.
 *
 * Self-contained — no build needed.
 * RUN:  npx electron probe/probe-b.cjs
 * PASS: terminal prints  ✅ isTrusted: click=true key=true
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const PAGE = path.join(__dirname, 'pages', 'probe-b.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 700,
    height: 500,
    title: 'Probe B — isTrusted',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  await win.loadFile(PAGE);
  const wc = win.webContents;

  // Let layout settle, then locate the button center in CSS px.
  await new Promise((r) => setTimeout(r, 500));
  const rect = await wc.executeJavaScript(
    `(() => { const r = document.getElementById('target').getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
  );

  // Synthesized mouse click.
  const base = { x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 };
  wc.sendInputEvent({ type: 'mouseDown', ...base });
  wc.sendInputEvent({ type: 'mouseUp', ...base });

  // Synthesized keydown (any key — we only care about isTrusted).
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'a' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'a' });

  await new Promise((r) => setTimeout(r, 300));
  const probe = await wc.executeJavaScript('window.__probe');
  console.log('\nrecorded:', JSON.stringify(probe));

  const pass = probe && probe.click === true && probe.key === true;
  console.log(
    pass
      ? `\n✅ isTrusted: click=${probe.click} key=${probe.key} — Approach C write premise HOLDS.\n`
      : `\n❌ isTrusted NOT true (click=${probe && probe.click} key=${probe && probe.key}) — Approach C's stealth premise is INVALID. Stop and re-evaluate.\n`,
  );
  app.quit();
});
