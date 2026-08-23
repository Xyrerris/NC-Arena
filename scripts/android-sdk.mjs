/**
 * Locates the Android SDK binaries the development scripts drive.
 *
 * Neither `adb` nor `emulator` is on PATH after a default Android Studio install, and
 * `ANDROID_HOME` is unset on a plain Windows setup. `scripts/e2e-screenshots.mjs` used to fall
 * back to a bare `adb` in that case, which fails with ENOENT on exactly the machines the
 * visual gate is meant to run on. `android/local.properties` is the file the Gradle build
 * itself trusts for the SDK location, so it is consulted before the per-platform default.
 *
 * Resolution is lazy and memoised on purpose: a missing SDK has to reach the caller as its own
 * handled error message, not as an exception thrown while the module is still being imported —
 * an import-time throw escapes the `try/catch` around every one of these scripts' `main()`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';

/** Windows ships these as `.exe`; every other platform does not. */
export const exe = (name) => (isWindows ? `${name}.exe` : name);

const sdkFromLocalProperties = () => {
  const file = join(ROOT, 'android', 'local.properties');
  if (!existsSync(file)) return null;
  const match = readFileSync(file, 'utf8').match(/^\s*sdk\.dir\s*=\s*(.+)$/m);
  // Java properties escape the separator, so a Windows path arrives as `C:\\Users\\...`.
  return match ? match[1].trim().replace(/\\\\/g, '\\') : null;
};

const defaultSdkDir = () => {
  if (isWindows) {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk');
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Android', 'sdk');
  return join(homedir(), 'Android', 'Sdk');
};

let cachedRoot;

/** The SDK root, or a thrown error naming every location that was tried. */
export const sdkRoot = () => {
  if (cachedRoot) return cachedRoot;

  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    sdkFromLocalProperties(),
    defaultSdkDir(),
  ].filter(Boolean);

  // `platform-tools/adb` is the probe because it is the one component every script here needs.
  cachedRoot = candidates.find((candidate) =>
    existsSync(join(candidate, 'platform-tools', exe('adb'))),
  );
  if (!cachedRoot) {
    throw new Error(
      'Android SDK not found. Looked at ANDROID_HOME, ANDROID_SDK_ROOT, ' +
        'android/local.properties (sdk.dir) and the platform default.\n' +
        `Tried:\n${candidates.map((candidate) => `  ${candidate}`).join('\n')}`,
    );
  }
  return cachedRoot;
};

export const adbPath = () => join(sdkRoot(), 'platform-tools', exe('adb'));

/** `emulator/` is the modern location; `tools/` is where pre-2019 SDKs kept it. */
export const emulatorPath = () => {
  const root = sdkRoot();
  const found = [
    join(root, 'emulator', exe('emulator')),
    join(root, 'tools', exe('emulator')),
  ].find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `No emulator binary under ${root}. Install it via the Android Studio SDK Manager.`,
    );
  }
  return found;
};
