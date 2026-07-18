/**
 * Probe feed (diagnostic) — find the input method that actually lands a prompt.
 * Tests, against a ChatGPT-shaped composer (`#prompt-textarea` contenteditable):
 *   1. click focuses it?              (activeElement after synthesized click)
 *   2. synthesized Cmd/Ctrl+V pastes? (spec's stated mechanism)
 *   3. webContents.paste() pastes?    (real Edit>Paste editing command — fallback)
 *   4. is the resulting input trusted + does Enter arrive trusted?
 *
 * RUN:  npx electron probe/probe-feed.cjs
 */
const { app, BrowserWindow, clipboard } = require('electron');
const path = require('node:path');

const PAGE = path.join(__dirname, 'pages', 'probe-feed.html');
const TEXT = 'hello from imagedrip';

async function activeId(wc) {
  return wc.executeJavaScript(
    `(document.activeElement && document.activeElement.id) || '(none)'`,
  );
}
async function boxText(wc) {
  return wc.executeJavaScript(`document.getElementById('prompt-textarea').textContent`);
}
async function clearBox(wc) {
  await wc.executeJavaScript(`document.getElementById('prompt-textarea').textContent=''`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Probe feed',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  await win.loadFile(PAGE);
  const wc = win.webContents;
  const mod = process.platform === 'darwin' ? 'cmd' : 'control';
  clipboard.writeText(TEXT);
  await new Promise((r) => setTimeout(r, 400));

  const rect = await wc.executeJavaScript(
    `(() => { const r = document.getElementById('prompt-textarea').getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
  );
  const base = { x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 };
  wc.sendInputEvent({ type: 'mouseDown', ...base });
  wc.sendInputEvent({ type: 'mouseUp', ...base });
  await new Promise((r) => setTimeout(r, 150));
  console.log('1. activeElement after click:', await activeId(wc));

  // 2. synthesized Cmd/Ctrl+V
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers: [mod] });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers: [mod] });
  await new Promise((r) => setTimeout(r, 250));
  const afterKeyPaste = await boxText(wc);
  console.log('2. after synthesized Cmd+V, box text:', JSON.stringify(afterKeyPaste));

  // 3. webContents.paste() (real editing command)
  await clearBox(wc);
  await wc.executeJavaScript(`document.getElementById('prompt-textarea').focus()`);
  wc.paste();
  await new Promise((r) => setTimeout(r, 250));
  const afterCmdPaste = await boxText(wc);
  console.log('3. after webContents.paste(), box text:', JSON.stringify(afterCmdPaste));
  const trust = await wc.executeJavaScript('({p: window.__probe.pasteTrusted, i: window.__probe.inputTrusted})');
  console.log('   paste event isTrusted:', trust.p, '· input event isTrusted:', trust.i);

  // 4. Enter trusted?
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await new Promise((r) => setTimeout(r, 200));
  const probe = await wc.executeJavaScript('window.__probe');
  console.log('4. enterTrusted:', probe.enterTrusted);

  const keyWorks = (afterKeyPaste || '').includes(TEXT);
  const cmdWorks = (afterCmdPaste || '').includes(TEXT);
  console.log(
    `\nRESULT → synthesized Cmd+V: ${keyWorks ? 'WORKS' : 'no-op'} · ` +
      `webContents.paste(): ${cmdWorks ? 'WORKS' : 'no-op'} · Enter trusted: ${probe.enterTrusted}\n`,
  );
  app.quit();
});
