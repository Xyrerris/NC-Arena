/**
 * The only writer. Everything that lands in SQLite — the Phase 2 seed and the Phase 5
 * sync alike — goes through here, so "last-write-wins from server" (ARCHITECTURE.md §7)
 * is one policy in one place rather than a habit.
 */

import type { RosterSnapshot } from '../common';
import { headToHead, players } from './schema';
import type { ArenaDatabase } from './queries';

/**
 * Replaces the whole ladder atomically.
 *
 * A snapshot is replaced rather than merged because a ladder is only meaningful as a
 * whole: ranks are positions in one list, so half-applying a sync would show a roster with
 * two rank 4s. The transaction is what makes "half-applied" unreachable.
 */
export const replaceRoster = (db: ArenaDatabase, snapshot: RosterSnapshot): void => {
  db.transaction((tx) => {
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
            rank: player.rank,
            combatPower: player.combatPower,
            score: player.score,
            atk: player.atk,
            def: player.def,
            critBp: player.critBp,
            hit: player.hit,
            spd: player.spd,
          })),
        )
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
