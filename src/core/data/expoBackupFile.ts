/**
 * `BackupFile` over the system share sheet and the system file picker (ADR-0033).
 *
 * **Device-only**, and therefore not re-exported from `src/core/data/index.ts` — the same
 * rule `arenaRepository.ts` follows, and for the same reason: `expo-sharing` is a native
 * module the Node test project cannot resolve, so re-exporting it would take the whole data
 * layer out of that project (ARCHITECTURE.md §10).
 *
 * Deliberately thin. Everything worth testing is in `rosterBackup.ts` and in the repository,
 * and this file exists so neither has to import a native module.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { err, ok, type Result } from '../common';
import type { BackupFile } from './backupFile';

const NO_SHARE_SHEET =
  'This device has no way to share a file, so the roster cannot be exported here.';

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * Where the file is staged before the share sheet takes it.
 *
 * A subdirectory of the cache rather than the cache root, so the name the user sees in the
 * share sheet is `arena-scout-roster-2026-09-07.json` and nothing else in the cache can
 * collide with it. The cache, rather than document storage, because this copy is not the
 * backup: the backup is wherever the user sends it, and a second copy sitting in app-private
 * storage would be taken by the same uninstall the export exists to survive.
 */
const staging = (): Directory => {
  const directory = new Directory(Paths.cache, 'backup');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
};

export const expoBackupFile: BackupFile = {
  name: 'expo-file-system',

  write: async (fileName: string, contents: string): Promise<Result<void>> => {
    try {
      // Asked before the file is written, so a device that cannot share does not leave a
      // copy of the roster in the cache on its way to saying so.
      if (!(await isAvailableAsync())) return err(new Error(NO_SHARE_SHEET));

      const file = new File(staging(), fileName);
      // `write` creates the file when it is absent and truncates it when it is not. The
      // name carries the date, so a second export on the same day lands on the copy the
      // first one staged — and truncating is what stops the shorter of two rosters being
      // shared with the tail of the longer still attached to it.
      file.write(contents);

      await shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Save your roster',
      });
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  },

  read: async (): Promise<Result<string | null>> => {
    try {
      // Three types rather than one, and rather than `*/*`. `ACTION_OPEN_DOCUMENT` greys
      // out everything the filter excludes, and which type a `.json` file is reported as
      // depends on the provider it came back from — Drive, Downloads and a mail attachment
      // do not agree. Greying out the user's only copy is a far worse failure than offering
      // them too many files, and a wrong pick already has its own sentence
      // (`parseRosterBackup`); these three still exclude the photos and video that are the
      // bulk of what is on a phone.
      //
      // Android hands back a `content://` URI and `File` reads one through the same SAF
      // grant this call took, so there is nothing to copy into the cache first.
      //
      // Note what this call **cannot** tell us: `File.pickFileAsync` turns every failure
      // into `canceled: true`, so a picker that crashed is indistinguishable from a user
      // who pressed back. Reported as a cancel — the honest reading of what is known —
      // rather than as an error naming a cause that was never established.
      const picked = await File.pickFileAsync({
        mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'],
      });
      if (picked.canceled) return ok(null);

      return ok(await picked.result.text());
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
