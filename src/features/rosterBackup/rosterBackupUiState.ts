/**
 * What the export/import pair says, in one place (ADR-0033).
 *
 * Pure: no React, no repository, no filesystem. The sentences are the whole product here —
 * a control that moves somebody's only copy of their own data has to say what it is about
 * to do, what it did, and what it refused — so they are values that can be asserted rather
 * than strings inlined in JSX.
 */

import type { RosterBackupSummary } from '@/core/data';

export const EXPORT_LABEL = 'Export roster';
export const IMPORT_LABEL = 'Import roster';

export const SECTION_TITLE = 'This roster lives only here';

/**
 * The state of one attempt. `busy` covers both directions rather than naming them, because
 * the two cannot overlap — each opens a system sheet that owns the screen until it closes —
 * and a caller that had to distinguish them would only be re-deriving which button it
 * pressed.
 */
export type RosterBackupUiState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What is at stake, said before either button is pressed.
 *
 * It names the count because "your data is at risk" is advice nobody acts on, and "3 players
 * and 2 records" is a thing somebody can decide they would mind losing.
 */
export const stakes = (players: number, records: number): string =>
  players === 0
    ? 'There is nothing on the ladder yet. Once you have added players, export them — the ' +
      'roster lives in this app and nowhere else.'
    : `${plural(players, 'player')} and ${plural(records, 'record')} live in this app and ` +
      'nowhere else. Uninstalling it, or clearing its data, takes them with it.';

/** Said after the share sheet closes. It cannot know where the file went, so it does not claim to. */
export const exported = (fileName: string): string =>
  `Your roster left the app as ${fileName}. Keep it somewhere this phone is not.`;

export const restored = (summary: RosterBackupSummary): string =>
  `Restored ${plural(summary.players, 'player')} and ${plural(summary.records, 'record')}.`;

/**
 * The confirmation an import asks for. It is a replace, and the thing being replaced is
 * everything the user has typed — so the sentence says the word rather than "continue?".
 */
export const IMPORT_CONFIRM_TITLE = 'Replace this roster?';
export const IMPORT_CONFIRM_BODY =
  'Every player and record on this device is removed and replaced by the file you pick. ' +
  'This cannot be undone.';
export const IMPORT_CONFIRM_KEEP = 'Keep';
export const IMPORT_CONFIRM_REPLACE = 'Replace';

export type RosterBackupEvent = { type: 'export' } | { type: 'import' };
