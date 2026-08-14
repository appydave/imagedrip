/**
 * Measure drift (Phase 0c) — turn a run folder into the two numbers that tell
 * intra-conversation drift apart from cross-conversation drift.
 *
 * Two metrics, because ONE WILL NOT DO. Collapse and wander have opposite signs,
 * so a single "consistency score" nets them to zero:
 *
 *   D_prev(i)   distance(image i, image i-1)          ← COLLAPSE
 *               Falling D_prev within a chunk is the limes/lemons signature:
 *               successive images creeping toward each other.
 *   D_first(i)  distance(image i, first image of its chunk)   ← WANDER
 *               Rising D_first is style drift away from where the chunk started.
 *
 * THE TEST: at chunkSize 6, D_prev should decline across positions 2→6 within each
 * chunk and JUMP at the boundary (7-vs-6, 13-vs-12). That reset is the whole thing.
 * No within-chunk trend and no boundary jump ⇒ position-in-conversation is not
 * driving drift, and 6-vs-18 is a non-question.
 *
 * FREE BONUS: D_first at each boundary shows how far the re-prime ITSELF moved the
 * look. A large boundary jump is simultaneously evidence that intra-drift is real
 * and that cross-drift is expensive — the trade-off, in one table.
 *
 * Distance is perceptual (dHash Hamming) plus a colour-histogram L1, computed from
 * raw bitmaps via Electron's own `nativeImage`. NO NEW DEPENDENCY — this repo has
 * none and should not gain one, which is why it runs under electron rather than node.
 *
 * RUN:  npx electron probe/measure-drift.cjs <run-folder> [more-run-folders...]
 * e.g.  npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/smoothies/*
 */
const { app, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const HASH_W = 9; // dHash compares horizontally adjacent pixels → 8×8 = 64 bits
const HASH_H = 8;
const HIST_BINS = 4; // 4×4×4 = 64 RGB buckets

/** BGRA bitmap → grayscale rows, via nativeImage's own resize. */
function grayRows(image, w, h) {
  const bmp = image.resize({ width: w, height: h, quality: 'good' }).toBitmap();
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; // BGRA
      row.push(0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2]);
    }
    rows.push(row);
  }
  return rows;
}

/** dHash: 1 bit per horizontally-adjacent pair. Robust to scale and mild colour shift. */
function dHash(image) {
  const rows = grayRows(image, HASH_W, HASH_H);
  const bits = [];
  for (const row of rows) for (let x = 0; x < HASH_W - 1; x++) bits.push(row[x] < row[x + 1] ? 1 : 0);
  return bits;
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d / a.length; // 0..1
}

/** Coarse RGB histogram, L1-normalised. Catches palette drift a hash can miss. */
function histogram(image) {
  const w = 32;
  const h = 32;
  const bmp = image.resize({ width: w, height: h, quality: 'good' }).toBitmap();
  const bins = new Float64Array(HIST_BINS ** 3);
  const step = 256 / HIST_BINS;
  for (let i = 0; i < bmp.length; i += 4) {
    const b = Math.min(HIST_BINS - 1, Math.floor(bmp[i] / step));
    const g = Math.min(HIST_BINS - 1, Math.floor(bmp[i + 1] / step));
    const r = Math.min(HIST_BINS - 1, Math.floor(bmp[i + 2] / step));
    bins[r * HIST_BINS * HIST_BINS + g * HIST_BINS + b] += 1;
  }
  const total = w * h;
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

function histL1(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / 2; // 0..1
}

/**
 * Order matters and filenames do not carry it — read the manifest so images are
 * compared in the order they were GENERATED, not alphabetically.
 */
function orderedImages(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { error: 'no manifest.json — not a run folder' };
  let m;
  try {
    m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { error: `unreadable manifest: ${err.message}` };
  }
  const files = [];
  const missing = [];
  for (const p of m.prompts || []) {
    if (p.status !== 'harvested' || !p.file) continue;
    const abs = path.join(dir, p.file);
    if (fs.existsSync(abs)) files.push({ abs, subject: p.subject, id: p.id });
    else missing.push(p.file);
  }
  return { files, missing, reprimes: m.reprimes || [], manifest: m };
}

/** reprimes are harvested-counts; turn them into 0-based chunk starts. */
function chunkStarts(reprimes, n) {
  const starts = [0, ...reprimes.filter((r) => r > 0 && r < n)];
  return [...new Set(starts)].sort((a, b) => a - b);
}
function chunkIndexOf(i, starts) {
  let c = 0;
  for (let k = 0; k < starts.length; k++) if (i >= starts[k]) c = k;
  return c;
}

function analyse(dir) {
  const rel = dir.replace(process.env.HOME || '', '~');
  console.log(`\n${'─'.repeat(78)}\n${rel}`);

  const { error, files, missing, reprimes, manifest } = orderedImages(dir);
  if (error) {
    console.log(`  ✗ ${error}`);
    return;
  }
  if (missing.length) {
    console.log(`  ⚠️  manifest references ${missing.length} file(s) that are not on disk: ${missing.join(', ')}`);
  }
  if (files.length < 2) {
    console.log(`  ✗ only ${files.length} harvested image(s) — need at least 2 to measure anything.`);
    return;
  }

  console.log(
    `  mode=${manifest.mode || '?'} outcome=${manifest.outcome ?? '(absent)'} ` +
      `harvested=${manifest.counts?.harvested}/${manifest.counts?.total} reprimes=[${reprimes.join(',')}]`,
  );
  if (!reprimes.length) {
    console.log('  NOTE: reprimes is empty — this run never crossed a chunk boundary, so it');
    console.log('        measures INTRA-conversation drift only. Cross-drift needs a boundary.');
  }

  const sigs = [];
  for (const f of files) {
    const img = nativeImage.createFromPath(f.abs);
    if (img.isEmpty()) {
      console.log(`  ⚠️  undecodable, skipped: ${path.basename(f.abs)}`);
      continue;
    }
    sigs.push({ ...f, hash: dHash(img), hist: histogram(img) });
  }
  if (sigs.length < 2) {
    console.log('  ✗ fewer than 2 decodable images.');
    return;
  }

  const starts = chunkStarts(reprimes, sigs.length);
  console.log(`\n   #  chunk  D_prev  D_first   subject`);
  console.log(`   ─  ─────  ──────  ───────   ${'─'.repeat(30)}`);

  const rows = [];
  for (let i = 0; i < sigs.length; i++) {
    const c = chunkIndexOf(i, starts);
    const anchor = sigs[starts[c]];
    const dPrev = i === 0 ? null : (hamming(sigs[i].hash, sigs[i - 1].hash) + histL1(sigs[i].hist, sigs[i - 1].hist)) / 2;
    const dFirst = i === starts[c] ? 0 : (hamming(sigs[i].hash, anchor.hash) + histL1(sigs[i].hist, anchor.hist)) / 2;
    const boundary = starts.includes(i) && i > 0;
    rows.push({ i, c, dPrev, dFirst, boundary });
    console.log(
      `  ${String(i + 1).padStart(2)}  ${String(c + 1).padStart(5)}  ` +
        `${dPrev === null ? '     —' : dPrev.toFixed(3)}   ${dFirst.toFixed(3)}` +
        `${boundary ? '  ← BOUNDARY' : '  '}   ${sigs[i].subject}`,
    );
  }

  // ── the two signatures ────────────────────────────────────────────────────
  const withinTrends = [];
  for (let c = 0; c < starts.length; c++) {
    const from = starts[c];
    const to = c + 1 < starts.length ? starts[c + 1] : sigs.length;
    const ds = rows.slice(from + 1, to).map((r) => r.dPrev).filter((d) => d !== null);
    if (ds.length >= 3) {
      const firstHalf = ds.slice(0, Math.floor(ds.length / 2));
      const lastHalf = ds.slice(Math.ceil(ds.length / 2));
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      withinTrends.push({ chunk: c + 1, start: avg(firstHalf), end: avg(lastHalf) });
    }
  }

  console.log('');
  if (!withinTrends.length) {
    console.log('  within-chunk trend: not enough images per chunk (need ≥4) to say anything.');
  } else {
    for (const t of withinTrends) {
      const dir = t.end < t.start ? 'FALLING → collapse' : t.end > t.start ? 'rising → diverging' : 'flat';
      console.log(
        `  chunk ${t.chunk}: D_prev ${t.start.toFixed(3)} → ${t.end.toFixed(3)}  (${dir})`,
      );
    }
  }

  const boundaryRows = rows.filter((r) => r.boundary && r.dPrev !== null);
  if (boundaryRows.length) {
    const nonBoundary = rows.filter((r) => !r.boundary && r.dPrev !== null).map((r) => r.dPrev);
    const avgNon = nonBoundary.reduce((s, v) => s + v, 0) / (nonBoundary.length || 1);
    for (const b of boundaryRows) {
      const ratio = b.dPrev / (avgNon || 1);
      console.log(
        `  boundary at #${b.i + 1}: D_prev ${b.dPrev.toFixed(3)} vs ${avgNon.toFixed(3)} typical ` +
          `(${ratio.toFixed(1)}×) — ${ratio > 1.5 ? 'JUMP: the re-prime moved the look' : 'no jump'}`,
      );
    }
  } else {
    console.log('  boundary jump: no boundary in this run to measure.');
  }

  console.log(
    '\n  Reads as: falling D_prev within a chunk = intra-conversation collapse.\n' +
      '            A jump at the boundary = the re-prime is expensive (cross-drift).\n' +
      '            Both, and you are trading one for the other — which is the point.',
  );
  console.log(
    '  Does NOT establish: that the distance metric matches what your EYE calls drift.\n' +
      '            Look at the images the numbers flag, and disagree with them if they are wrong.',
  );
}

app.whenReady().then(() => {
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!dirs.length) {
    console.error(
      '\nusage: npx electron probe/measure-drift.cjs <run-folder> [more...]\n\n' +
        'e.g.   npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/smoothies/*\n',
    );
    app.quit();
    return;
  }
  for (const d of dirs) {
    const abs = path.resolve(d);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      console.log(`\n✗ not a directory: ${abs}`);
      continue;
    }
    analyse(abs);
  }
  console.log('');
  app.quit();
});
