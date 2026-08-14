/**
 * Probe attach (Phase 0b, local half) — can an image reach a composer the way
 * `feed()` already reaches it with text?
 *
 * `WebviewHarness.feed()` is `clipboard.writeText` → `wc.paste()`. The only
 * text-specific line is the clipboard write, so the question is whether
 * `clipboard.writeImage()` + the SAME `wc.paste()` lands an image file in the
 * composer's paste event. If it does, per-prompt/boundary reference images are a
 * small change to an already-verified pipeline rather than a new mechanism.
 *
 * Tests, against a ChatGPT-shaped composer (`#prompt-textarea` contenteditable
 * plus an attachment rail outside it):
 *   1. does clipboard.writeImage + webContents.paste() fire a paste at all?
 *   2. does its DataTransfer carry a FILE of type image/* (not just text)?
 *   3. is that paste isTrusted? (invariant #1 — trusted input, never JS .value=)
 *   4. THE HAZARD: feed() calls selectAll() before paste. Does a selectAll +
 *      text-paste destroy an attachment chip added by an earlier image-paste?
 *      Order matters: image first, then text. This checks that order is safe.
 *
 * This is the LOCAL half and proves nothing about ChatGPT itself — the page here
 * is a stand-in that behaves the way we believe ChatGPT behaves. The live half
 * is `probe-attach-live.cjs`, which needs a human and a signed-in account.
 *
 * RUN:  npx electron probe/probe-attach.cjs [path/to/image.png]
 *       (with no argument it uses a generated 64×64 PNG)
 */
const { app, BrowserWindow, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PAGE = path.join(__dirname, 'pages', 'probe-attach.html');
const TEXT = 'a lime, tall glass';

/** A 64×64 solid PNG, so the probe has no external dependency. */
function generatedImage() {
  // 1×1 lime-green PNG, scaled up — enough that naturalWidth > 32 downstream.
  const oneByOne = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  return nativeImage.createFromBuffer(oneByOne).resize({ width: 64, height: 64 });
}

function loadImage(argPath) {
  if (!argPath) return { image: generatedImage(), label: 'generated 64×64 PNG' };
  const abs = path.resolve(argPath);
  if (!fs.existsSync(abs)) {
    console.error(`✗ no such file: ${abs}`);
    process.exit(1);
  }
  const image = nativeImage.createFromPath(abs);
  if (image.isEmpty()) {
    console.error(`✗ not a decodable image: ${abs}`);
    process.exit(1);
  }
  const { width, height } = image.getSize();
  return { image, label: `${path.basename(abs)} (${width}×${height}, ${fs.statSync(abs).size}B)` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probeState = (wc) => wc.executeJavaScript('window.__probe');

app.whenReady().then(async () => {
  const { image, label } = loadImage(process.argv[2]);

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Probe attach',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  await win.loadFile(PAGE);
  const wc = win.webContents;

  console.log(`\nimage under test: ${label}\n`);

  // ── 1-3. image on the clipboard, then the SAME paste feed() uses ──────────
  clipboard.clear();
  clipboard.writeImage(image);
  await sleep(400);

  // Report what the OS clipboard actually accepted, before the page sees it.
  const onClipboard = clipboard.availableFormats();
  console.log('0. clipboard formats after writeImage():', JSON.stringify(onClipboard));
  if (clipboard.readImage().isEmpty()) {
    console.log('   ⚠️  clipboard.readImage() came back EMPTY — the write did not take.');
  }

  await wc.executeJavaScript(`document.getElementById('prompt-textarea').focus()`);
  wc.paste();
  await sleep(400);

  let p = await probeState(wc);
  console.log('1. paste fired:', p.pasteCount > 0);
  console.log('2. DataTransfer kinds:', JSON.stringify(p.lastPasteKinds),
    '· types:', JSON.stringify(p.lastPasteTypes));
  console.log('   file count:', p.lastPasteFileCount,
    '· file type:', p.lastPasteFileType,
    '· file size:', p.lastPasteFileSize);
  console.log('3. paste isTrusted:', p.pasteTrusted);

  const imageLanded = p.lastPasteFileCount > 0 && String(p.lastPasteFileType || '').startsWith('image/');
  const chipsAfterImage = p.chipCount;

  // ── 4. THE HAZARD: does feed()'s selectAll + text paste kill the chip? ────
  // This is the real order a boundary reseat would use: attach image, then the prompt.
  clipboard.clear();
  clipboard.writeText(TEXT);
  await sleep(250);
  await wc.executeJavaScript(`document.getElementById('prompt-textarea').focus()`);
  wc.selectAll(); // <- exactly what WebviewHarness.paste() does before pasting
  wc.paste();
  await sleep(400);

  p = await probeState(wc);
  const chipsAfterText = p.chipCount;
  console.log('4. chip survived selectAll + text paste:',
    `${chipsAfterImage} chip(s) before → ${chipsAfterText} after`);
  console.log('   composer text after:', JSON.stringify(p.text));

  // ── verdict ───────────────────────────────────────────────────────────────
  const chipSurvived = chipsAfterImage > 0 && chipsAfterText >= chipsAfterImage;
  const textLanded = String(p.text || '').includes(TEXT);

  console.log(
    `\nRESULT → image lands as a FILE: ${imageLanded ? 'YES' : 'NO'}` +
      ` · paste trusted: ${p.pasteTrusted}` +
      ` · chip survives selectAll: ${chipSurvived ? 'YES' : 'NO'}` +
      ` · text still lands: ${textLanded ? 'YES' : 'NO'}\n`,
  );

  if (!imageLanded) {
    console.log(
      'READ THIS AS: clipboard.writeImage() + webContents.paste() did NOT deliver a file\n' +
        'to the page. Mechanism (b) is out; reference images would need CDP\n' +
        'DOM.setFileInputFiles via webContents.debugger — Phase 2c roughly doubles.\n',
    );
  } else if (!chipSurvived) {
    console.log(
      'READ THIS AS: the image lands, but feed()\'s selectAll destroys it. A reseat\n' +
        'must paste the text FIRST and the image SECOND, or stop using selectAll on\n' +
        'the attach path. Silent data loss if built the obvious way.\n',
    );
  } else {
    console.log(
      'READ THIS AS: the local mechanism holds. This does NOT establish that ChatGPT\n' +
        'accepts a pasted image — run probe-attach-live.cjs for that. A local page that\n' +
        'behaves as we expect and a ChatGPT that does not look identical from here.\n',
    );
  }

  app.quit();
});
