/**
 * "Which of these players is you?" — the state behind the choice half of the viewer screen
 * (ADR-0022).
 *
 * It is a *selection*, never a creation: every candidate is a row that already exists, so
 * answering "who am I" cannot invent a player as a side effect. That is the constraint
 * ADR-0020 put on this screen ("you edit the viewer, you do not invent or remove them"),
 * and it is why the empty state below sends the user to the add-player form rather than
 * growing a name field of its own.
 *
 * Same contract as every other `*UiState` in the app (ARCHITECTURE.md §8): a discriminated
 * union of pre-formatted strings, so no component calls the formatter.
 */

import { statFormatter } from '@/core/common';
import type { PlayerId, RosterEntry } from '@/core/model';

export interface ViewerCandidateUi {
  id: PlayerId;
  name: string;
  /** Zero-padded, so the column does not jitter between 9 and 10 mid-scroll. */
  rankLabel: string;
  combatPowerExact: string;
  /**
   * The player currently chosen. Announced rather than only drawn — a screen-reader user
   * re-opening this list has to be able to hear which row is the answer already given.
   */
  isCurrent: boolean;
}

export type ViewerChoiceUiState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** Nobody to pick. A fresh install (ADR-0021) opens here. */
  | { kind: 'empty' }
  | {
      kind: 'ready';
      candidates: readonly ViewerCandidateUi[];
      /** A refused choice — an id that is no longer a row, for instance. */
      message: string | null;
    };

export const toViewerCandidateUi = (entry: RosterEntry): ViewerCandidateUi => ({
  id: entry.player.id,
  name: entry.player.name,
  rankLabel: String(entry.player.rank).padStart(2, '0'),
  combatPowerExact: statFormatter.exact(entry.player.combatPower),
  isCurrent: entry.isViewer,
});

export const candidateLabel = (candidate: ViewerCandidateUi): string =>
  `${candidate.name}, rank ${Number(candidate.rankLabel)}, combat power ${candidate.combatPowerExact}` +
  (candidate.isCurrent ? '. This is who you are now.' : '');
