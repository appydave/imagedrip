#!/usr/bin/env node
// Dev-mode Dock identity. `electron-vite dev` runs node_modules' Electron.app, which macOS shows as "Electron" with
// Electron's icon. This keeps a renamed, re-iconed copy of that bundle OUTSIDE node_modules (npm install can't undo
// it, and the shared Electron.app is never touched) and prints its executable for ELECTRON_EXEC_PATH, which
// electron-vite honours:  "dev": "ELECTRON_EXEC_PATH=\"$(node scripts/brand-launcher.mjs)\" electron-vite dev"
// The copy is remade only when Electron, resources/icon.icns or FORMAT changes. On any failure it prints nothing,
// so dev falls back to the bare Electron.app instead of breaking.
// Template: /Users/davidcruwys/dev/ad/brains/brand-dave/app-icons/brand-launcher.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'ImageDrip';
const BUNDLE_ID = 'com.appydave.imagedrip.dev';
const FORMAT = 1;

function main() {
  if (process.platform !== 'darwin') return '';
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const electronDir = dirname(createRequire(join(root, 'package.json')).resolve('electron/package.json'));
  const bare = join(electronDir, 'dist', 'Electron.app');
  const icon = join(root, 'resources', 'icon.icns');
  if (!existsSync(bare) || !existsSync(icon)) return '';

  const dir = join(homedir(), 'Library', 'Application Support', 'appydave-launchers');
  const launcher = join(dir, `${NAME}.app`);
  const stampFile = join(dir, `${NAME}.stamp`);
  const version = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version;
  const iconHash = createHash('sha1').update(readFileSync(icon)).digest('hex').slice(0, 12);
  const stamp = `${FORMAT} ${version} ${iconHash} ${BUNDLE_ID} ${root}`;
  const exe = join(launcher, 'Contents', 'MacOS', 'Electron');

  const have = existsSync(stampFile) ? readFileSync(stampFile, 'utf8') : '';
  if (have === stamp && existsSync(exe)) return exe;

  rmSync(launcher, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync('ditto', [bare, launcher]);
  const plist = join(launcher, 'Contents', 'Info.plist');
  for (const [key, value] of [['CFBundleName', NAME], ['CFBundleDisplayName', NAME], ['CFBundleIdentifier', BUNDLE_ID]]) {
    execFileSync('plutil', ['-replace', key, '-string', value, plist]);
  }
  copyFileSync(icon, join(launcher, 'Contents', 'Resources', 'electron.icns'));
  // Editing the plist breaks the signature; Apple Silicon refuses to run it unsigned. Ad-hoc re-sign.
  execFileSync('codesign', ['--force', '--sign', '-', launcher], { stdio: 'ignore' });
  execFileSync('touch', [launcher]);
  writeFileSync(stampFile, stamp);
  process.stderr.write(`brand-launcher: made ${launcher}\n`);
  return exe;
}

try {
  process.stdout.write(main());
} catch (err) {
  process.stderr.write(`brand-launcher: falling back to the bare Electron.app (${err instanceof Error ? err.message : err})\n`);
}
