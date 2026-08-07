#!/usr/bin/env node
/**
 * `npm run dev:stop` — stop the running ImageDrip cleanly, and stop there.
 *
 * The counterpart to `dev:clean` (stop, then relaunch). Use this before
 * switching checkouts, or to clear the way for someone else's launch.
 *
 * ── Why this script has to exist ────────────────────────────────────────
 *
 * ImageDrip takes `app.requestSingleInstanceLock()`, so a second `npm run dev`
 * does NOT replace the running app — the new instance surrenders and focuses
 * the old window. The failure mode is silent and expensive: the app comes to
 * the front, everything looks fine, and you spend the next hour driving verbs
 * from a build you stopped editing an hour ago. That is exactly how a session
 * on 2026-08-07 found the running app serving 31 verbs while `main` had 35.
 *
 * ── Lifted from KyberAgent Desktop Enterprise (KBDE) ────────────────────
 *
 * `~/dev/kybernesis/KBDE-KyberAgent-Enterprise/scripts/dev-stop.mjs` learned
 * two things the hard way, and both apply here unchanged:
 *
 *   KYB-315 — **the Electron MAIN process carries no greppable identity.**
 *   `app.setPath` never reaches argv, and only Chromium HELPERS carry
 *   `--user-data-dir`. So a `pkill -f` pattern aimed at the app maims its
 *   renderers (blank window) and leaves the main process running, still
 *   holding the single-instance lock. The fix is a pid file. ImageDrip already
 *   writes one — `control.json` carries `pid` alongside the port and token —
 *   so we use that rather than inventing a second one.
 *
 *   KYB-314 — **a `pkill -f` pattern matches the shell running it.** Bracket
 *   classes (`[d]ev`) make each pattern unable to match its own wrapper.
 *
 * ── The graceful path is load-bearing here, not just polite ─────────────
 *
 * SIGTERM first, because ImageDrip's `before-quit` handler is what writes the
 * `outcome` into a live run's manifest (A2). A `SIGKILL` skips it and the run
 * is recorded as neither finished nor abandoned — the exact ambiguity A2 was
 * built to remove. `will-quit` then unlinks `control.json`, which is why this
 * script treats "the file removed itself" as PROOF the graceful path ran, and
 * says so. Force is the fallback, never the opener.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/** Same resolution as `scripts/imagedrip-mcp.mjs` — one convention, not two. */
function controlFilePath() {
  const override = process.env.IMAGEDRIP_CONTROL_FILE;
  if (override) return override;
  const app = 'imagedrip';
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', app, 'control.json');
  }
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), app, 'control.json');
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), app, 'control.json');
}

const DEFAULT_PORT = 7180;
/**
 * How long to let the app quit on its own.
 *
 * `before-quit` waits up to 2s for the run manifest to flush, and Electron
 * teardown follows. 12s leaves generous room for both without stranding
 * someone in front of a script that looks hung.
 */
const GRACEFUL_TIMEOUT_MS = 12_000;

const cap = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const quiet = (cmd) => spawnSync('bash', ['-c', cmd], { stdio: 'ignore' });
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

console.log('\n▶ dev:stop — stopping ImageDrip (no relaunch)\n');

const controlPath = controlFilePath();
let port = DEFAULT_PORT;
let appPid = null;
try {
  const info = JSON.parse(readFileSync(controlPath, 'utf8'));
  if (Number.isInteger(info.pid)) appPid = info.pid;
  if (Number.isInteger(info.port)) port = info.port;
} catch {
  // No control file: the app is not running, or died without cleaning up.
  // Neither is an error — the sweeps below still run.
}

let quitGracefully = false;

if (appPid && alive(appPid)) {
  // Guard against PID REUSE. `control.json` can outlive the app it described,
  // and by then its pid may belong to something else entirely — signalling it
  // would kill an innocent process. Only ever signal something that still
  // looks like Electron.
  const cmd = cap(`ps -p ${appPid} -o command=`);
  if (/electron|imagedrip/i.test(cmd)) {
    console.log(`■ SIGTERM → pid ${appPid} (graceful: lets before-quit write the run outcome)`);
    try {
      process.kill(appPid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + GRACEFUL_TIMEOUT_MS;
    while (alive(appPid) && Date.now() < deadline) quiet('sleep 0.25');

    if (alive(appPid)) {
      console.log('  ⚠ did not quit in time — SIGKILL. A live run may have lost its outcome.');
      try {
        process.kill(appPid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    } else {
      // `will-quit` unlinks control.json. If it is gone, the app ran its own
      // quit sequence — which means `before-quit` ran too.
      quitGracefully = !existsSync(controlPath);
      console.log(
        quitGracefully
          ? '  ✓ quit gracefully (control.json self-removed — before-quit ran)'
          : '  ✓ process exited, but control.json was left behind — quit path may have been skipped',
      );
    }
  } else {
    console.log(`⚠ control.json pid ${appPid} is not an Electron process — leaving it alone.`);
    console.log(`  (${cmd || 'no command line'})`);
  }
} else {
  console.log('· no running app recorded in control.json');
}

// Stragglers: the electron-vite dev supervisor survives its child and would
// otherwise respawn or hold the port. Bracket classes so the pattern cannot
// match the shell running it (KYB-314).
for (const pattern of ['electron-vite.*[d]ev', 'imagedrip.*[e]lectron-vite']) {
  quiet(`pkill -f ${JSON.stringify(pattern)}`);
}

// Anything still holding the control port. Deliberately AFTER the pid path:
// this is a safety net for a crashed app, not the way the app is stopped.
const holders = cap(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
if (holders) {
  console.log(`■ freeing port ${port} (pids ${holders.split('\n').join(' ')})`);
  quiet(`kill ${holders.split('\n').join(' ')}`);
}

// A stale control.json advertises a port and token that no longer exist —
// worse than none, because a client reads it and gets a confident wrong answer.
if (existsSync(controlPath)) rmSync(controlPath, { force: true });

quiet('sleep 0.5');

const stillListening = cap(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
const stillRunning = cap('pgrep -fl "electron-vite.*[d]ev"');
if (stillListening || stillRunning) {
  console.log(`\n⚠ something is still up on port ${port}:`);
  if (stillListening) console.log(`  listeners: ${stillListening.split('\n').join(' ')}`);
  if (stillRunning) console.log(`  processes: ${stillRunning}`);
  console.log('  → re-run `npm run dev:stop`, or kill by pid.\n');
  process.exit(1);
}

console.log(`\n✓ stopped — nothing on :${port}, single-instance lock released.\n`);
