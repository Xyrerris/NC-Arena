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
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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

/**
 * Maestro writes a run's screenshots to `<--test-output-dir>/<timestamp>/<flow>/takeScreenshot/`,
 * and refuses any name that would escape that folder — which is what the old `SHOT_DIR` absolute
 * paths did. The timestamp is the problem for a baseline: it moves every run, so there would be no
 * fixed path to compare against or to point a reviewer at. The pixels are therefore copied back up
 * to the flat `screenshots/scale-<scale>/` layout the flows' names were always written for, while
 * the run folder underneath keeps the logs and manifest for a failure worth reading.
 */
const collectScreenshots = (runDir, destDir) => {
  const shots = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.png') && basename(dir) === 'takeScreenshot') shots.push(full);
    }
  };
  if (existsSync(runDir)) walk(runDir);
  if (shots.length > 0 && !existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const shot of shots) copyFileSync(shot, join(destDir, basename(shot)));
  return shots.length;
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
        // One directory per flow per scale. Maestro writes `takeScreenshot/` inside it, so
        // sharing a directory between flows would have them overwrite each other's manifest.
        const outDir = join(SHOT_ROOT, `scale-${scale}`, basename(flow, '.yaml'));
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        const startedAt = Date.now();
        const result = run(
          'maestro',
          ['test', '--test-output-dir', outDir, join('.maestro', flow)],
          { stdio: 'inherit', shell: process.platform === 'win32' },
        );
        const seconds = (Date.now() - startedAt) / 1000;
        const shots = collectScreenshots(outDir, join(SHOT_ROOT, `scale-${scale}`));
        timings.push({ label, seconds, ok: result.status === 0, shots });
        if (result.status !== 0) failures += 1;
      }
    }
  } finally {
    setFontScale(original);
  }

  console.log('\nWall-clock cost (ARCHITECTURE.md §10 — this is the number that decides');
  console.log('whether the gate stays on every PR or moves to a merge queue):');
  let total = 0;
  for (const { label, seconds, ok, shots } of timings) {
    total += seconds;
    const shot = `${shots} shot${shots === 1 ? '' : 's'}`;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(24)} ${seconds.toFixed(1)}s  ${shot}`);
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
