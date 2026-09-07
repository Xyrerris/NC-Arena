/**
 * Repositories and sync orchestration. The only module that knows both the database and
 * the network exist (ARCHITECTURE.md §4, §7).
 *
 * Phase 5 supplies a remote implementation of the `RosterSource` port, which currently has
 * none (ADR-0021) — if that phase produces any diff under src/features, the boundary was
 * wrong.
 */

export { ArenaDataProvider, useArenaData, type ArenaData } from './arenaContext';
export type { BackupFile } from './backupFile';
export type { LiveData, UseLiveData } from './liveData';
/**
 * `expoBackupFile.ts` is deliberately NOT re-exported, for the reason `arenaRepository.ts`
 * is not: it imports `expo-sharing`, which plain Node cannot resolve. The screen that needs
 * it imports `@/core/data/expoBackupFile` explicitly, which is also what lets a test hand
 * the same screen a fake built from the port above (ADR-0033).
 */
export {
  BACKUP_FORMAT,
  backupFileName,
  parseRosterBackup,
  serialiseBackup,
  summarise,
  type RosterBackup,
  type RosterBackupSummary,
} from './rosterBackup';
export {
  PlayerDraftRejected,
  createRosterRepository,
  type ImportMatch,
  type LiveQuery,
  type RosterRepository,
  type RosterRepositoryDeps,
} from './rosterRepository';
export { useViewerId } from './useViewerId';
