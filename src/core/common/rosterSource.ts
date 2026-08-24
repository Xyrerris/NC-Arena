/**
 * The port every roster source implements. **Nothing implements it today** (ADR-0021): the
 * seed source was deleted and the remote one arrives in Phase 5 (ARCHITECTURE.md §7).
 *
 * An unimplemented port is worth keeping when it is load-bearing for a decision rather than
 * for code, and this one is: it is why `core/network` can be written in Phase 5 without
 * `core/data` changing shape, and why that phase should produce no diff under `src/features`.
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
  /**
   * Which season this ladder is. Open decision 8 in ARCHITECTURE.md §9 asked where the
   * prototype's hard-coded "SEASON 41" comes from; the answer is the source, so it travels
   * with the snapshot rather than being written into a screen (ADR-0018).
   */
  season: number;
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
