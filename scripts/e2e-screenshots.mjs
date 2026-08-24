#!/usr/bin/env node
/**
 * The visual gate (ARCHITECTURE.md §10, ROADMAP.md Phase 1).
 *
 * Jest snapshots cannot do this job: a clipped or ellipsised number serialises identically
 * to a correct one, so they would give false confidence exactly where the product's promise
 * lives. Only pixels settle it, and pixels need a device.
 *
 * This runs each flow twice — at the default font scale and at 200 % — because the second
 * pass is the one that finds the clipping. Maestro cannot change a system setting, so the
 * scale is set here with `adb` and restored afterwards, including on failure.
 *
 * It also **times each pass and prints the total**. That number is the actual Phase 1
 * deliverable: §10 accepts that Maestro is slower than the Roborazzi setup it replaces, and
 * says the gate moves to a merge queue if it proves too slow. That decision needs a
 * measurement, not an impression.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adbPath } from './android-sdk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_ROOT = join(ROOT, '.maestro', 'screenshots');

const FLOWS = ['boot.yaml', 'catalogue.yaml', 'player-detail.yaml'];
/** Default, and the scale ROADMAP.md Phase 1 names. */
const SCALES = ['1.0', '2.0'];

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });

const adb = (...args) => {
  const result = run(adbPath(), args);
  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? '').trim();
};

const requireTooling = () => {
  const devices = adb('devices')
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().endsWith('device'));
  if (devices.length === 0) {
    throw new Error('No device or emulator attached. `adb devices` lists none.');
  }
  const maestro = run('maestro', ['--version'], { shell: process.platform === 'win32' });
  if (maestro.status !== 0) {
    throw new Error(
      'maestro is not installed.\n' +
        '  macOS/Linux: curl -fsSL https://get.maestro.mobile.dev | bash\n' +
        '  Windows:     see https://docs.maestro.dev/getting-started/installing-maestro\n' +
        'It needs a JDK, which this project already has for Gradle.',
    );
  }
  return devices.length;
};

const readFontScale = () => {
  const value = adb('shell', 'settings', 'get', 'system', 'font_scale');
  return value === 'null' || value === '' ? '1.0' : value;
};

const setFontScale = (scale) => adb('shell', 'settings', 'put', 'system', 'font_scale', scale);

const main = () => {
  const deviceCount = requireTooling();
  const original = readFontScale();
  const timings = [];
  let failures = 0;

  console.log(`Visual gate — ${deviceCount} device(s), font scale returns to ${original} after.`);

  try {
    for (const scale of SCALES) {
      setFontScale(scale);
      for (const flow of FLOWS) {
        const label = `${flow} @ ${scale}x`;
        const shotDir = join(SHOT_ROOT, `scale-${scale}`);
        if (!existsSync(shotDir)) mkdirSync(shotDir, { recursive: true });

        const startedAt = Date.now();
        const result = run(
          'maestro',
          ['test', '-e', `SHOT_DIR=${shotDir}`, join('.maestro', flow)],
          { stdio: 'inherit', shell: process.platform === 'win32' },
        );
        const seconds = (Date.now() - startedAt) / 1000;
        timings.push({ label, seconds, ok: result.status === 0 });
        if (result.status !== 0) failures += 1;
      }
    }
  } finally {
    setFontScale(original);
  }

  console.log('\nWall-clock cost (ARCHITECTURE.md §10 — this is the number that decides');
  console.log('whether the gate stays on every PR or moves to a merge queue):');
  let total = 0;
  for (const { label, seconds, ok } of timings) {
    total += seconds;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(24)} ${seconds.toFixed(1)}s`);
  }
  console.log(`  ${''.padEnd(30)} ${total.toFixed(1)}s total`);
  console.log(`\nScreenshots: ${SHOT_ROOT}`);

  if (failures > 0) process.exit(1);
};

try {
  main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
