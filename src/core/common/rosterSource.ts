/**
 * The port every roster source implements — `localSeedRosterSource` today, the remote
 * source in Phase 5 (ARCHITECTURE.md §7).
 *
 * It lives in core/common rather than core/data because core/network must be able to
 * implement it, and §4 forbids core/network from importing core/data. Keeping the
 * contract here is what makes "swap the source, change no feature code" checkable: if
 * Phase 5 produces a diff under src/features, the boundary was wrong.
 */

import type { HeadToHead, Player, PlayerId } from '../model';
import type { Result } from './result';

/** One coherent view of the ladder. Written to SQLite as a unit. */
export interface RosterSnapshot {
  viewerId: PlayerId;
  players: readonly Player[];
  /** Every pair the source knows about; today, the viewer against each opponent. */
  headToHead: readonly HeadToHead[];
}

export interface RosterSource {
  /** Identifies the source in sync logs and in the failure surfaced to the user. */
  readonly name: string;
  fetchRoster(): Promise<Result<RosterSnapshot>>;
}
