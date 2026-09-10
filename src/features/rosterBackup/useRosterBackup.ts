/**
 * The backup pair's ViewModel-as-a-hook, alongside `usePlayerForm` and the rest
 * (ARCHITECTURE.md §8).
 *
 * Like the screenshot scanner it is written against a **port** rather than against a native
 * module: `BackupFile` is supplied by the caller and defaults to the device's share sheet
 * and file picker. That is what lets a whole export and a whole import be driven in a test
 * with no emulator, no share sheet and no file — the same seam ADR-0024 established, applied
 * to the other direction of the same problem.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { backupFileName, serialiseBackup, useArenaData, type BackupFile } from '@/core/data';
import { expoBackupFile } from '@/core/data/expoBackupFile';

import {
  exported,
  restored,
  stakes,
  type RosterBackupEvent,
  type RosterBackupUiState,
} from './rosterBackupUiState';

export interface RosterBackupOptions {
  /**
   * Where the file goes and comes from. Defaults to the device's share sheet and picker; a
   * test supplies a fake built from the same port.
   */
  file?: BackupFile;
}

export interface RosterBackupController {
  state: RosterBackupUiState;
  /** How many players and records are at stake, as a sentence. */
  stakes: string;
  /** False when there is nothing to export, which is the only state either control blocks. */
  canExport: boolean;
  onEvent: (event: RosterBackupEvent) => void;
}

export const useRosterBackup = ({
  file = expoBackupFile,
}: RosterBackupOptions = {}): RosterBackupController => {
  const { repository, useLiveData } = useArenaData();

  const [state, setState] = useState<RosterBackupUiState>({ kind: 'idle' });
  /**
   * A ref, not `state.kind === 'busy'`, for the reason `usePlayerForm`'s two guards are
   * refs: each of these handlers opens a system sheet slow enough to press twice, and the
   * handler that just set the state cannot see it.
   */
  const working = useRef(false);

  const size = useLiveData(repository.observeRosterSize(), []);
  const records = useLiveData(repository.observeRecordCount(), []);

  const run = useCallback(async (act: () => Promise<RosterBackupUiState>): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setState({ kind: 'busy' });
    const next = await act();
    working.current = false;
    setState(next);
  }, []);

  const exportRoster = useCallback(
    () =>
      run(async () => {
        const backup = repository.exportSnapshot();
        const fileName = backupFileName(backup.exportedAt);
        const written = await file.write(fileName, serialiseBackup(backup));
        return written.ok
          ? { kind: 'done', message: exported(fileName) }
          : { kind: 'failed', message: written.error.message };
      }),
    [file, repository, run],
  );

  const importRoster = useCallback(
    () =>
      run(async () => {
        const picked = await file.read();
        if (!picked.ok) return { kind: 'failed', message: picked.error.message };
        // Backed out of the picker. Nothing happened, and saying so would be noise about a
        // decision the user already knows they made — the same rule the scanner follows.
        if (picked.value === null) return { kind: 'idle' };

        const imported = repository.importSnapshot(picked.value);
        return imported.ok
          ? { kind: 'done', message: restored(imported.value) }
          : { kind: 'failed', message: imported.error.message };
      }),
    [file, repository, run],
  );

  const onEvent = useCallback(
    (event: RosterBackupEvent) => {
      // Floating, like the scan: the event API is synchronous and neither call can reject —
      // both sides of `BackupFile` return a `Result`.
      if (event.type === 'export') void exportRoster();
      else void importRoster();
    },
    [exportRoster, importRoster],
  );

  const players = size.data;
  const recordCount = records.data;

  return useMemo(
    () => ({
      state,
      stakes: stakes(players, recordCount),
      canExport: players > 0,
      onEvent,
    }),
    [onEvent, players, recordCount, state],
  );
};
