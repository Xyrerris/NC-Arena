#!/usr/bin/env node
/**
 * Boots the project's Android emulator before `expo run:android`, so that `npm run android`
 * is a single command on a cold machine instead of "open Android Studio, start the AVD, wait,
 * then run".
 *
 * It is deliberately a no-op when `adb devices` already lists something booted. That covers
 * three cases with one rule: a developer who left the emulator open, a physical handset on
 * USB, and CI runners that provision their own device — none of them want a second emulator
 * started underneath them.
 *
 * Where the SDK lives is `scripts/android-sdk.mjs`' problem, and it is resolved on first use
 * rather than at import, so that "no SDK installed" prints the message below instead of a
 * stack trace from a module that never got to run.
 */

import { spawn, spawnSync } from 'node:child_process';
import { dirname } from 'node:path';

import { adbPath, emulatorPath } from './android-sdk.mjs';

/** The AVD this project develops against. `ANDROID_AVD` overrides it for one-off runs. */
const WANTED_AVD = process.env.ANDROID_AVD ?? 'Galaxy_S22_Ultra';
/** A cold boot of a Pixel-class AVD is ~60s; a first boot after an image update can be far worse. */
const BOOT_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 2_000;

const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const run = (command, args) => spawnSync(command, args, { encoding: 'utf8' });

const adb = (...args) => {
  const result = run(adbPath(), args);
  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? '').trim();
};

/** Polling variant: a device that is mid-boot answers with errors, and that is not a failure. */
const adbQuiet = (...args) => {
  const result = run(adbPath(), args);
  return result.status === 0 ? (result.stdout ?? '').trim() : '';
};

const attachedSerials = () =>
  adb('devices')
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);

/**
 * `sys.boot_completed` flips while the boot animation is still on screen and the package
 * manager is still settling; installing an APK in that window fails. Both properties together
 * are the usual "actually usable" signal.
 */
const isUsable = (serial) =>
  adbQuiet('-s', serial, 'shell', 'getprop', 'sys.boot_completed') === '1' &&
  adbQuiet('-s', serial, 'shell', 'getprop', 'init.svc.bootanim') === 'stopped';

const firstUsableDevice = () => attachedSerials().find((serial) => isUsable(serial)) ?? null;

/** Accepts `Galaxy S22 Ultra` for the AVD that `emulator -list-avds` calls `Galaxy_S22_Ultra`. */
const normalise = (name) => name.replace(/[\s_-]+/g, '').toLowerCase();

const resolveAvd = () => {
  const result = run(emulatorPath(), ['-list-avds']);
  if (result.status !== 0) {
    throw new Error(`emulator -list-avds failed:\n${result.stderr || result.stdout}`);
  }
  const avds = (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const match = avds.find((avd) => normalise(avd) === normalise(WANTED_AVD));
  if (!match) {
    throw new Error(
      `AVD "${WANTED_AVD}" not found. Available:\n${avds.map((a) => `  ${a}`).join('\n') || '  (none)'}\n` +
        'Create it in Android Studio (Device Manager), or set ANDROID_AVD to one of the above.',
    );
  }
  return match;
};

const launch = (avd) => {
  const emulator = emulatorPath();
  const child = spawn(emulator, ['-avd', avd], {
    // Some emulator builds resolve their engine binaries relative to the working directory.
    cwd: dirname(emulator),
    detached: true,
    stdio: 'ignore',
  });
  // The emulator must outlive this script — `expo run:android` is what needs it, not us.
  child.unref();
};

const waitForBoot = (avd) => {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const serial = firstUsableDevice();
    if (serial) return serial;
    sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `"${avd}" did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s. ` +
      'Check the emulator window, then re-run.',
  );
};

const main = () => {
  const running = firstUsableDevice();
  if (running) {
    console.log(`Device ${running} is already attached — leaving it alone.`);
    return;
  }

  const avd = resolveAvd();
  console.log(`Starting emulator "${avd}"...`);
  launch(avd);
  const serial = waitForBoot(avd);
  console.log(`${avd} booted as ${serial}.`);
};

try {
  main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
