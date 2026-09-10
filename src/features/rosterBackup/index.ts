/**
 * Getting the roster off this device, and back onto one (ADR-0033).
 *
 * A feature of its own rather than a folder inside `playerForm`, even though `/me` is where
 * it is rendered: a backup is not part of editing a player, and ARCHITECTURE.md §4's rule
 * that features may not import each other is what keeps that from becoming a matter of
 * taste. The route composes the two — which is what a route is for — and neither feature
 * knows the other exists.
 *
 * This module may not import core/db. The repository arrives through `ArenaDataProvider`;
 * the share sheet and the file picker arrive as a `BackupFile`.
 */

export { RosterBackupControls, type RosterBackupControlsProps } from './RosterBackupControls';
export {
  EXPORT_LABEL,
  IMPORT_CONFIRM_BODY,
  IMPORT_CONFIRM_KEEP,
  IMPORT_CONFIRM_REPLACE,
  IMPORT_CONFIRM_TITLE,
  IMPORT_LABEL,
  SECTION_TITLE,
  exported,
  restored,
  stakes,
  type RosterBackupEvent,
  type RosterBackupUiState,
} from './rosterBackupUiState';
export {
  useRosterBackup,
  type RosterBackupController,
  type RosterBackupOptions,
} from './useRosterBackup';
