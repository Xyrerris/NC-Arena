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
  foldPlayerName,
  normaliseGameCode,
  normalisePlayerName,
  type MatchDelta,
  type MatchOutcome,
  type PlayerDraft,
  type PlayerId,
} from '../model';
import { headToHead, players } from './schema';
import type { HeadToHeadRow, PlayerRow } from './schema';
import type { ArenaDatabase } from './queries';

/**
 * The columns a draft owns. Id, rank and origin belong to the store, never to a form.
 *
 * This is also the **only** place crit changes unit. A draft carries whole percentages
 * because that is what the user types and what the validator can check; the column carries
 * basis points because that is what §2.2's formatting contract reads. Multiplying an
 * already-validated integer is exact, so the conversion cannot lose anything — which is
 * precisely why it happens after validation rather than inside the form.
 *
 * `nameFolded` is derived here for the same reason crit is scaled here: it is a stored
 * consequence of a field the form owns, and deriving it anywhere else would let a second
 * write path put a name in the table that no lookup can find (ADR-0032).
 */
const draftColumns = (draft: PlayerDraft) => ({
  name: normalisePlayerName(draft.name),
  nameFolded: foldPlayerName(draft.name),
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
            // A synced row is folded on arrival, exactly like a typed one. The server has
            // no idea this column exists, and a remote player the search cannot find would
            // be the same defect wearing a different hat.
            nameFolded: foldPlayerName(player.name),
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
 * Moves the viewer's record against a player by one match, creating the pairing the first
 * time the two meet.
 *
 * `delta` is `1` for the roster's swipe and `-1` for the detail screen's stepper, which is
 * the undo ADR-0027 shipped without (ADR-0029). One function rather than two, because "add
 * a win" and "take a win back" differ only in sign: splitting them would give the same
 * three refusals two homes and let them drift.
 *
 * **Read-modify-write, not `wins = wins + 1`.** The increment is expressed as a SQL
 * expression nowhere in this function, because the two drivers behind `ArenaDatabase`
 * would have to agree on how Drizzle qualifies a column inside an upsert's `SET` clause —
 * and the whole point of that seam is that the same statement runs on device and in Node
 * (ARCHITECTURE.md §10). Inside a transaction the read and the write cannot be
 * interleaved, so the plainer form is not the weaker one.
 *
 * A refusal says **which** of the three it was. The three name different players, so they
 * cannot share a sentence: "you have no avatar", "that player is gone", and "there is no
 * record against yourself" are advice about three different things. Collapsing them into
 * one `null` made the caller guess, and it guessed wrong on the one case a user can
 * actually reach — an avatar deleted from another screen was answered with a sentence
 * about the opponent, who was never the problem.
 *
 * Which of them it is, is only knowable *inside* the transaction. Checking the viewer above
 * this call instead would be a read the delete can still land between, so the answer is
 * decided where the write is. `BELOW_ZERO` is there for the same reason: the stepper hides
 * a `-1` it cannot honour, but what the column holds is only certain under the write.
 */
export type RecordMatchRefusal = 'NO_VIEWER' | 'NO_OPPONENT' | 'SELF' | 'BELOW_ZERO';

export type RecordMatchOutcome =
  { recorded: true; row: HeadToHeadRow } | { recorded: false; refusal: RecordMatchRefusal };

export const recordMatchResult = (
  db: ArenaDatabase,
  viewerId: PlayerId,
  opponentId: PlayerId,
  outcome: MatchOutcome,
  delta: MatchDelta,
): RecordMatchOutcome =>
  db.transaction((tx) => {
    if (viewerId === opponentId) return { recorded: false, refusal: 'SELF' };
    if (rowById(tx, viewerId) === undefined) return { recorded: false, refusal: 'NO_VIEWER' };
    if (rowById(tx, opponentId) === undefined) return { recorded: false, refusal: 'NO_OPPONENT' };

    const pairing = and(eq(headToHead.viewerId, viewerId), eq(headToHead.opponentId, opponentId));
    const before = tx.select().from(headToHead).where(pairing).limit(1).all()[0];

    const wins = (before?.wins ?? 0) + (outcome === 'WIN' ? delta : 0);
    const losses = (before?.losses ?? 0) + (outcome === 'LOSS' ? delta : 0);

    // A record counts matches that happened, so neither column has a meaning below zero.
    // Refused rather than clamped: clamping would report a write that did not occur, and
    // the screen would show the same number it already showed with nothing to explain it.
    if (wins < 0 || losses < 0) return { recorded: false, refusal: 'BELOW_ZERO' };

    if (before === undefined) {
      tx.insert(headToHead).values({ viewerId, opponentId, wins, losses }).run();
    } else {
      tx.update(headToHead).set({ wins, losses }).where(pairing).run();
    }

    const row = tx.select().from(headToHead).where(pairing).limit(1).all()[0];
    if (row === undefined) {
      // Unreachable inside the transaction that just wrote this pairing. Thrown rather
      // than returned as a refusal, because a refusal is a sentence shown to the user and
      // this is a programmer error (core/common/result.ts).
      throw new Error(
        `recordMatchResult: ${viewerId} vs ${opponentId} vanished between the write and the read.`,
      );
    }
    return { recorded: true, row };
  });

/**
 * Is this name already on the ladder? Case-insensitively, because the roster's own search
 * is: two players the search cannot tell apart are two the user cannot either.
 *
 * The comparison is an equality on `name_folded`, not `lower()` on `name`. Folding the
 * needle in JavaScript and the column in SQL is what made this guard silently useless for
 * any name outside ASCII — it answered "no" to a name identical to one already stored
 * (ADR-0032).
 *
 * `exceptId` is what keeps "save a player without renaming them" from colliding with
 * itself.
 */
export const isNameTaken = (db: ArenaDatabase, name: string, exceptId?: PlayerId): boolean => {
  const sameName = eq(players.nameFolded, foldPlayerName(name));
  return (
    db
      .select({ id: players.id })
      .from(players)
      .where(exceptId === undefined ? sameName : and(sameName, ne(players.id, exceptId)))
      .limit(1)
      .all().length > 0
  );
};

/**
 * The row a name and a game code point at *together*, if the ladder holds one.
 *
 * This is the screenshot import's notion of "the same player" (ADR-0031), and it is
 * deliberately a **pair**. The name alone is what `isNameTaken` already guards, and it is
 * not an identity: it is a display string the user is free to reuse if the codes differ.
 * The code alone is not one either — it is optional, so half the ladder can share the
 * empty string.
 *
 * Both sides are compared the way they are stored, and both are folded in JavaScript on the
 * way in: the name through `foldPlayerName` into `name_folded`, the code through
 * `normaliseGameCode`, so `#A984` typed by hand, `a984 ` pasted, and `#a984` read off a
 * screenshot are one value rather than three. Neither side asks SQLite to fold anything —
 * this lookup decides whether a screenshot updates a player or adds a second one, and
 * `lower()` got that wrong for every non-ASCII name (ADR-0032).
 *
 * It matches a `REMOTE` row like any other. Who may be *written* is `updateLocalPlayer`'s
 * rule and stays there — a lookup that quietly skipped synced rows would answer "no such
 * player" about a player plainly on screen.
 */
export const findPlayerByIdentity = (
  db: ArenaDatabase,
  name: string,
  gameCode: string,
): PlayerRow | undefined =>
  db
    .select()
    .from(players)
    .where(
      and(
        eq(players.nameFolded, foldPlayerName(name)),
        eq(players.gameCode, normaliseGameCode(gameCode)),
      ),
    )
    .limit(1)
    .all()[0];

/**
 * Rewrites `name_folded` for every row whose stored fold disagrees with `foldPlayerName`,
 * and reports how many it repaired.
 *
 * This is the backfill the migration could not do. `0003_folded_player_name.sql` adds the
 * column with an empty default rather than `lower(name)`, because SQLite's `lower()` is the
 * very thing that cannot fold these names — a SQL backfill would have written a wrong value
 * into exactly the rows the column exists for, and a wrong value is worse than an obviously
 * empty one (ADR-0032).
 *
 * It runs after the migrations, on device and in the test database alike, and it is
 * idempotent: once every row agrees it is a single scan and no writes. It also repairs a
 * row folded by an older rule, which is what makes changing `foldPlayerName` a code change
 * rather than a migration.
 */
export const refoldPlayerNames = (db: ArenaDatabase): number =>
  db.transaction((tx) => {
    const rows = tx
      .select({ id: players.id, name: players.name, nameFolded: players.nameFolded })
      .from(players)
      .all();

    let repaired = 0;
    for (const row of rows) {
      const folded = foldPlayerName(row.name);
      if (folded === row.nameFolded) continue;
      tx.update(players).set({ nameFolded: folded }).where(eq(players.id, row.id)).run();
      repaired += 1;
    }
    return repaired;
  });
