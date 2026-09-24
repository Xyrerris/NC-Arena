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

/**
 * What this device has that the server has not seen yet — the input to `POST /v1/roster/sync`
 * (ADR-0035, decision 3).
 *
 * `newPlayers` are rows created here. Each one already carries a local `PlayerId`, and that id
 * is what travels as the wire's `clientId`: the device has to key the rows somehow, it already
 * has a key, and inventing a second one would mean holding two ids for one row until the
 * response arrives. `rank` is dropped on the way out — the server owns the ladder's order, the
 * same reason `PlayerDraft` cannot supply one.
 *
 * `editedPlayers` are rows the server already owns, changed here. Their `id` is a server id, so
 * it is not a `clientId` of anything.
 *
 * `deletedPlayers` are server ids removed here (ADR-0039). A `LOCAL` row that is removed never
 * reached the server, so it has nothing to say.
 */
export interface RosterPush {
  newPlayers: readonly Player[];
  editedPlayers: readonly Player[];
  headToHead: readonly HeadToHead[];
  deletedPlayers: readonly PlayerId[];
}

/**
 * What a push produced.
 *
 * `snapshot` is nullable, and `fetchRoster` refusing the same case is not an inconsistency —
 * it is the difference between the two directions. A pull that cannot produce a
 * `RosterSnapshot` (no viewer chosen on the account yet, see `RosterSnapshot.viewerId`) has
 * changed nothing, so failing costs the caller nothing but a retry. A **push** in that state
 * has already applied: the rows are on the server and `assignedIds` is the only record of
 * which local row became which server row. Reporting that as a failure would throw the map
 * away and invite a retry — and `POST /v1/roster/sync` inserts `newPlayers` unconditionally,
 * so that retry would duplicate every row it just created.
 *
 * So a push that lands on an account with no viewer yet returns `snapshot: null` and a full
 * `assignedIds`: nothing to apply to SQLite this round, but every `LOCAL` -> `REMOTE`
 * transition still recorded. That is the state a freshly created account is in until
 * `PUT /v1/me/viewer` has run, which is exactly when the first push happens.
 */
export interface RosterPushResult {
  snapshot: RosterSnapshot | null;
  /** Local id -> the server id it was assigned. Empty when nothing new was pushed. */
  assignedIds: ReadonlyMap<PlayerId, PlayerId>;
}

/**
 * The push counterpart of `RosterSource`, kept separate rather than added as a second method
 * on it. A source that can only be read — a fixture, a demo ladder, the seed that ADR-0021
 * deleted — can honour `fetchRoster` and has nothing to say about `pushRoster`, and a port no
 * implementer can fully honour is how an interface starts growing `throw new Error('unsupported')`.
 *
 * `RemoteRosterSource` implements both, because the backend answers in both directions.
 */
export interface RosterSink {
  /** Identifies the sink in sync logs and in the failure surfaced to the user. */
  readonly name: string;
  pushRoster(push: RosterPush): Promise<Result<RosterPushResult>>;
  /**
   * Tells the upstream which player is the viewer.
   *
   * It sits beside `pushRoster` rather than in a port of its own because both are the same
   * thing — what this device writes upstream — and one method does not earn an interface.
   *
   * It takes an id the upstream can already resolve, so it is called *after* a push has
   * adopted the row, never with a local id. Until something calls it, an account has no
   * viewer and therefore no `RosterSnapshot` can be built from it at all
   * (`RosterSnapshot.viewerId` is not optional), which is why a first sync usually has to
   * push, set the viewer, and only then pull.
   */
  setViewer(playerId: PlayerId): Promise<Result<void>>;
}
