/**
 * Probe attach LIVE (Phase 0b, the half that actually decides it) — does the REAL
 * ChatGPT composer accept a pasted image, and does `composerAttachment` see it?
 *
 * Answers three questions the local probe cannot:
 *   1. Does ChatGPT turn a pasted image into an attachment, or drop it?
 *   2. Does `CHATGPT_SELECTORS.composerAttachment` MATCH the resulting chip?
 *      That selector is marked ⚠️ UNVERIFIED in chatgpt-selectors.ts:76 and was
 *      written for the "Pasted text" chip, never for an image.
 *   3. THE INVERSION: `feed()`'s submit post-condition requires `!hasAttachment`
 *      AFTER Enter. If the selector over-matches, or a chip lingers, every
 *      attached feed reports "Enter did not submit it" on a message that WAS
 *      sent — absence-looks-like-failure, the exact bug feed()'s verification
 *      was written to end.
 *
 * INTERACTIVE, like probe-c.cjs. It shares the app's `persist:imagedrip-chatgpt`
 * partition, so if ImageDrip is already signed in on this machine, so is this.
 * Quit ImageDrip first — two processes on one partition is asking for trouble.
 *
 * It PASTES and (optionally) SUBMITS one message into your real account. It sends
 * no prompt text by default and never starts a run.
 *
 * RUN:  npx electron probe/probe-attach-live.cjs [path/to/image.png] [--submit]
 */
const { app, BrowserWindow, clipboard, nativeImage, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PARTITION = 'persist:imagedrip-chatgpt';
const URL = 'https://chatgpt.com/';
// Kept in sync BY HAND with src/main/chatgpt-selectors.ts — a .cjs probe cannot
// import the TS module, and a probe that tests its own copy of the selector would
// prove nothing about the app. Re-paste if you change it there.
const PROMPT_INPUT = '#prompt-textarea';
const COMPOSER_ATTACHMENT =
  '[data-testid*="attachment" i], [class*="attachment" i], [data-testid*="file-chip" i]';

const args = process.argv.slice(2);
const doSubmit = args.includes('--submit');
const imgArg = args.find((a) => !a.startsWith('--'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadImage() {
  if (!imgArg) {
    console.error(
      '✗ this probe needs a REAL image — a 64×64 solid colour tells you nothing about\n' +
        '  how ChatGPT handles a 2MB harvested PNG.\n\n' +
        '  try:  npx electron probe/probe-attach-live.cjs \\\n' +
        '          ~/Pictures/ImageDrip/smoothies/2026-08-03-0943-smoothies/kangaroo.png\n',
    );
    process.exit(1);
  }
  const abs = path.resolve(imgArg);
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
  return { image, abs, label: `${path.basename(abs)} (${width}×${height}, ${fs.statSync(abs).size}B)` };
}

/** Read composer state the same way the preload does. */
function composerStateScript() {
  return `(() => {
    const box = document.querySelector(${JSON.stringify(PROMPT_INPUT)});
    const chips = document.querySelectorAll(${JSON.stringify(COMPOSER_ATTACHMENT)});
    return {
      found: !!box,
      text: box ? (box.textContent || '') : '',
      hasAttachment: chips.length > 0,
      chipCount: chips.length,
      // Enough shape to RE-PIN the selector if it missed.
      chipOuter: [...chips].slice(0, 3).map((c) => c.outerHTML.slice(0, 240)),
    };
  })()`;
}

/** When the selector misses, dump candidates so it can be re-pinned in one pass. */
function candidatesScript() {
  return `(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[data-testid], [class]')) {
      const t = (el.getAttribute('data-testid') || '') + ' ' + (el.className || '');
      if (!/attach|file|image|upload|thumb|chip|preview/i.test(String(t))) continue;
      const key = String(t).slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        testid: el.getAttribute('data-testid') || null,
        cls: String(el.className || '').slice(0, 120),
        tag: el.tagName.toLowerCase(),
      });
      if (out.length >= 25) break;
    }
    return out;
  })()`;
}

app.whenReady().then(async () => {
  const { image, abs, label } = loadImage();

  // Match the app's user agent so the session is not treated as a new client.
  const sess = session.fromPartition(PARTITION);
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    title: 'Probe attach LIVE — do not close until it prints RESULT',
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false },
  });
  const wc = win.webContents;

  console.log(`\nimage under test: ${label}`);
  console.log(`partition:        ${PARTITION} (shared with ImageDrip)`);
  console.log(`submit:           ${doSubmit ? 'YES — one message will be sent' : 'no (--submit to enable)'}\n`);

  await wc.loadURL(URL);
  await sleep(4000);

  // ── wait for a human ──────────────────────────────────────────────────────
  let state = await wc.executeJavaScript(composerStateScript());
  if (!state.found) {
    console.log('… composer not found. Sign in in the window, then leave it on a NEW CHAT.');
    console.log('  waiting up to 3 minutes…');
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && !state.found) {
      await sleep(3000);
      state = await wc.executeJavaScript(composerStateScript());
    }
  }
  if (!state.found) {
    console.log('\n✗ never saw a composer. Not a result — the probe could not start.\n');
    app.quit();
    return;
  }
  console.log('✅ composer found. Pasting the image…\n');

  const chipsBefore = state.chipCount;

  // ── paste the image, exactly the way feed() pastes text ───────────────────
  clipboard.clear();
  clipboard.writeImage(image);
  await sleep(500);
  console.log('0. clipboard formats:', JSON.stringify(clipboard.availableFormats()));

  await wc.executeJavaScript(
    `document.querySelector(${JSON.stringify(PROMPT_INPUT)}).focus()`,
  );
  wc.paste();

  // Uploads are not instant — poll rather than read once.
  let after = state;
  const pasteDeadline = Date.now() + 20000;
  while (Date.now() < pasteDeadline) {
    await sleep(1000);
    after = await wc.executeJavaScript(composerStateScript());
    if (after.chipCount > chipsBefore) break;
  }

  const chipAppeared = after.chipCount > chipsBefore;
  console.log(`1. attachment chip appeared: ${chipAppeared ? 'YES' : 'NO'}`,
    `(${chipsBefore} → ${after.chipCount})`);
  console.log(`2. composerAttachment MATCHED it: ${after.hasAttachment ? 'YES' : 'NO'}`);
  if (after.chipOuter.length) {
    console.log('   matched element(s):');
    for (const h of after.chipOuter) console.log('     ', h.replace(/\s+/g, ' '));
  }

  if (!chipAppeared) {
    console.log('\n   selector missed OR nothing was attached. Candidates in the DOM now:');
    const cands = await wc.executeJavaScript(candidatesScript());
    if (!cands.length) console.log('     (none — most likely nothing attached at all)');
    for (const c of cands) console.log('     ', JSON.stringify(c));
  }

  // ── 3. the submit post-condition ──────────────────────────────────────────
  if (doSubmit && chipAppeared) {
    console.log('\n3. submitting (Enter)…');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });

    let sent = null;
    const sendDeadline = Date.now() + 20000;
    while (Date.now() < sendDeadline) {
      await sleep(1000);
      sent = await wc.executeJavaScript(composerStateScript());
      if (sent.text.length === 0 && !sent.hasAttachment) break;
    }
    const postCondition = sent && sent.text.length === 0 && !sent.hasAttachment;
    console.log(`   composer empty AND no attachment: ${postCondition ? 'YES' : 'NO'}`,
      `(text=${JSON.stringify(sent.text.slice(0, 40))}, chips=${sent.chipCount})`);
    if (!postCondition) {
      console.log(
        '\n   🔴 THIS IS THE INVERSION. feed() would throw "Enter did not submit it" on a\n' +
          '   message that WAS sent. Fix the post-condition BEFORE building any attach path.',
      );
    }
  } else if (doSubmit) {
    console.log('\n3. skipped — nothing attached, so there is no post-condition to test.');
  } else {
    console.log('\n3. submit not tested (re-run with --submit).');
  }

  console.log(
    `\nRESULT → ChatGPT accepts a pasted image: ${chipAppeared ? 'YES' : 'NO'}` +
      ` · composerAttachment sees it: ${after.hasAttachment ? 'YES' : 'NO'}\n`,
  );
  console.log('Window left open so you can look. Ctrl-C when done.');
  console.log(`(image used: ${abs})\n`);
});
