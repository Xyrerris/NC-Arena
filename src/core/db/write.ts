/**
 * The only writer. Everything that lands in SQLite — the hand-entered players of ADR-0020
 * and the Phase 5 sync alike — goes through here, so "last-write-wins from server"
 * (ARCHITECTURE.md §7) is one policy in one place rather than a habit.
 *
 * Today only the first of those two exists: there is no seed and no source (ADR-0021), so
 * every row in the database was typed in by hand.
 *
 * Two invariants are this module's job, and every function below is written to hold them:
 *
 * 1. **Ranks are one contiguous 1..N list.** That is the assertion holding the prototype's
 *    "viewer ranked 12 inside a 14-player roster, count reported as 15" shut (§7). Adding
 *    a player appends to the bottom, removing one closes the gap, and a sync re-seats the
 *    local rows below the ladder it just replaced.
 * 2. **A `LOCAL` row is the user's, and a sync may not take it.** Anything else makes
 *    "add a player" a feature the next refresh silently deletes.
 */

import { and, asc, desc, eq, gt, ne, or, sql } from 'drizzle-orm';

import type { RosterSnapshot } from '../common';
import {
  CRIT_BP_PER_PERCENT,
  normaliseGameCode,
  normalisePlayerName,
  type PlayerDraft,
  type PlayerId,
} from '../model';
import { headToHead, players } from './schema';
import type { PlayerRow } from './schema';
import type { ArenaDatabase } from './queries';

/**
 * The columns a draft owns. Id, rank and origin belong to the store, never to a form.
 *
 * This is also the **only** place crit changes unit. A draft carries whole percentages
 * because that is what the user types and what the validator can check; the column carries
 * basis points because that is what §2.2's formatting contract reads. Multiplying an
 * already-validated integer is exact, so the conversion cannot lose anything — which is
 * precisely why it happens after validation rather than inside the form.
 */
const draftColumns = (draft: PlayerDraft) => ({
  name: normalisePlayerName(draft.name),
  level: draft.level,
  gameCode: normaliseGameCode(draft.gameCode),
  combatPower: draft.combatPower,
  score: draft.score,
  hp: draft.hp,
  atk: draft.atk,
  def: draft.def,
  critBp: draft.critPercent * CRIT_BP_PER_PERCENT,
  hit: draft.hit,
  spd: draft.spd,
});

/**
 * Reads one row back rather than relying on `RETURNING`, which the two drivers behind
 * `ArenaDatabase` report differently — and the entire point of that seam is that the same
 * code runs on device and in Node (ARCHITECTURE.md §10).
 */
const rowById = (tx: ArenaDatabase, id: PlayerId): PlayerRow | undefined =>
  tx.select().from(players).where(eq(players.id, id)).limit(1).all()[0];

const highestRank = (tx: ArenaDatabase): number =>
  tx.select({ rank: players.rank }).from(players).orderBy(desc(players.rank)).limit(1).all()[0]
    ?.rank ?? 0;

/**
 * Replaces the ladder atomically, and keeps the hand-entered players.
 *
 * A *remote* snapshot is replaced rather than merged because a ladder is only meaningful
 * as a whole: ranks are positions in one list, so half-applying a sync would show a roster
 * with two rank 4s. The transaction is what makes "half-applied" unreachable.
 *
 * Local rows are read out first and written back underneath the new ladder, renumbered so
 * the contiguity invariant survives a sync that changed the roster's size. A local row
 * whose id the snapshot now claims is *not* written back: upstream has caught up with that
 * player, and two rows sharing one id is the only outcome worse than losing the edit.
 */
export const replaceRoster = (db: ArenaDatabase, snapshot: RosterSnapshot): void => {
  db.transaction((tx) => {
    const claimed = new Set<string>(snapshot.players.map((player) => player.id));
    const kept = tx
      .select()
      .from(players)
      .where(eq(players.origin, 'LOCAL'))
      .orderBy(asc(players.rank))
      .all()
      .filter((row) => !claimed.has(row.id));

    // head_to_head first: the FK cascade would take care of it, but relying on cascade
    // means relying on `PRAGMA foreign_keys` being on, which is per-connection.
    tx.delete(headToHead).run();
    tx.delete(players).run();

    if (snapshot.players.length > 0) {
      tx.insert(players)
        .values(
          snapshot.players.map((player) => ({
            id: player.id,
            name: player.name,
            level: player.level,
            gameCode: player.gameCode,
            rank: player.rank,
            combatPower: player.combatPower,
            score: player.score,
            hp: player.hp,
            atk: player.atk,
            def: player.def,
            critBp: player.critBp,
            hit: player.hit,
            spd: player.spd,
            origin: 'REMOTE' as const,
          })),
        )
        .run();
    }

    if (kept.length > 0) {
      tx.insert(players)
        .values(kept.map((row, index) => ({ ...row, rank: snapshot.players.length + index + 1 })))
        .run();
    }

    if (snapshot.headToHead.length > 0) {
      tx.insert(headToHead)
        .values(
          snapshot.headToHead.map((record) => ({
            viewerId: record.viewerId,
            opponentId: record.opponentId,
            wins: record.wins,
            losses: record.losses,
          })),
        )
        .run();
    }
  });
};

/**
 * Adds a hand-entered player at the bottom of the ladder.
 *
 * Bottom, rather than a position derived from combat power, because `rank` is a *season
 * standing* and someone who has not played this season has not earned one. Deriving it
 * from CP would quietly redefine the column the roster header describes — and appending
 * keeps the 1..N invariant a one-line consequence instead of a re-sort.
 */
export const insertLocalPlayer = (db: ArenaDatabase, id: PlayerId, draft: PlayerDraft): PlayerRow =>
  db.transaction((tx) => {
    tx.insert(players)
      .values({ id, rank: highestRank(tx) + 1, origin: 'LOCAL', ...draftColumns(draft) })
      .run();
    const row = rowById(tx, id);
    if (row === undefined) {
      // Unreachable inside the transaction that just inserted it. Thrown rather than
      // returned, because it is a programmer error and not an outcome the product has a
      // screen for (core/common/result.ts).
      throw new Error(`insertLocalPlayer: ${id} vanished between the insert and the read.`);
    }
    return row;
  });

/**
 * Rewrites a hand-entered player's stats. Returns null when the id is unknown *or* when
 * the row is `REMOTE`; the caller cannot tell those two apart from the return value and
 * does not need to, because they mean the same thing to the user — not yours to edit.
 */
export const updateLocalPlayer = (
  db: ArenaDatabase,
  id: PlayerId,
  draft: PlayerDraft,
): PlayerRow | null =>
  db.transaction((tx) => {
    const before = rowById(tx, id);
    if (before === undefined || before.origin !== 'LOCAL') return null;
    tx.update(players)
      .set(draftColumns(draft))
      .where(and(eq(players.id, id), eq(players.origin, 'LOCAL')))
      .run();
    return rowById(tx, id) ?? null;
  });

/**
 * Removes a hand-entered player and closes the gap in the ranking.
 *
 * Only the ranks *below* the removed one move, which is a single UPDATE that cannot read a
 * value it is halfway through rewriting — the failure a `SET rank = (SELECT count(*) …)`
 * renumber walks straight into, silently and only on some rows.
 */
export const deleteLocalPlayer = (db: ArenaDatabase, id: PlayerId): boolean =>
  db.transaction((tx) => {
    const row = rowById(tx, id);
    if (row === undefined || row.origin !== 'LOCAL') return false;

    // Explicit rather than left to the FK cascade, for the same per-connection-pragma
    // reason `replaceRoster` gives.
    tx.delete(headToHead)
      .where(or(eq(headToHead.viewerId, id), eq(headToHead.opponentId, id)))
      .run();
    tx.delete(players).where(eq(players.id, id)).run();
    tx.update(players)
      .set({ rank: sql`${players.rank} - 1` })
      .where(gt(players.rank, row.rank))
      .run();
    return true;
  });

/**
 * Is this name already on the ladder? Case-insensitively, because the roster's own search
 * is: two players the search cannot tell apart are two the user cannot either.
 *
 * `exceptId` is what keeps "save a player without renaming them" from colliding with
 * itself.
 */
export const isNameTaken = (db: ArenaDatabase, name: string, exceptId?: PlayerId): boolean => {
  const needle = normalisePlayerName(name).toLowerCase();
  const sameName = sql`lower(${players.name}) = ${needle}`;
  return (
    db
      .select({ id: players.id })
      .from(players)
      .where(exceptId === undefined ? sameName : and(sameName, ne(players.id, exceptId)))
      .limit(1)
      .all().length > 0
  );
};
