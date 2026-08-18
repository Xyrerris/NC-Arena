/**
 * Sorting and filtering live in SQL, not in JS over an in-memory array
 * (ARCHITECTURE.md §7). The prototype sorted a 14-element array inside `renderVals()`;
 * that stops being acceptable the moment the roster is a real season ladder.
 *
 * Nothing in this file touches a driver. The same builders run against `expo-sqlite` on
 * device and `better-sqlite3` in the Node test project, which is what lets the query
 * layer be tested with no emulator (§10).
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias, type BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { PlayerId, RosterSort } from '../model';
import { headToHead, players } from './schema';
import type { HeadToHeadRow, PlayerRow } from './schema';

/**
 * Driver-agnostic handle. `expo-sqlite` and `better-sqlite3` differ only in the type each
 * reports for a write result, which no query in this module reads.
 *
 * The run-result parameter is `any` rather than `unknown` deliberately. `BaseSQLiteDatabase`
 * exposes `transaction(cb)`, and a callback parameter makes the type invariant in that
 * position — so with `unknown` neither concrete driver is assignable and the seam does not
 * exist at all. This is the one `any` in the data layer, it is confined to a type the
 * queries never read, and it buys the property the whole test strategy rests on: the same
 * builders run on device and in Node.
 */
export type ArenaDatabase = BaseSQLiteDatabase<'sync', any>;

/**
 * `%` and `_` are LIKE wildcards, so a search for "_" would otherwise match every row.
 * The escape character is written with a doubled backslash so the template literal
 * emits a single one; a lone \ would emit an escaped quote and SQLite rejects an
 * empty ESCAPE expression.
 */
const escapeLike = (raw: string): string => raw.replace(/[\\%_]/g, (char) => `\\${char}`);

const nameMatches = (query: string) => {
  const needle = `%${escapeLike(query.trim().toLowerCase())}%`;
  // `lower()` on both sides rather than relying on LIKE's default ASCII case folding,
  // which the `case_sensitive_like` pragma can turn off underneath us.
  return sql`lower(${players.name}) LIKE ${needle} ESCAPE '\\'`;
};

const orderFor = (sort: RosterSort) => {
  switch (sort) {
    case 'RANK':
      return [asc(players.rank)];
    case 'COMBAT_POWER':
      // Rank is the tie-break everywhere, so a stable order does not depend on SQLite's
      // choice for equal keys — and the roster tests can assert an exact sequence.
      return [desc(players.combatPower), asc(players.rank)];
    case 'MY_WINS':
      // LEFT JOIN means a player never fought has NULL wins; DESC puts those last, which
      // is the intended reading of "my wins".
      return [desc(headToHead.wins), asc(players.rank)];
  }
};

/**
 * The roster list: every player, with the viewer's record against them attached.
 *
 * The viewer is a row in this list like anyone else. The prototype kept the viewer
 * outside the roster and gave it an independent rank, which is the inconsistency
 * ARCHITECTURE.md §7 calls out.
 */
export const rosterQuery = (db: ArenaDatabase, viewerId: PlayerId, search: string) =>
  db
    .select({
      player: players,
      wins: headToHead.wins,
      losses: headToHead.losses,
    })
    .from(players)
    .leftJoin(
      headToHead,
      and(eq(headToHead.opponentId, players.id), eq(headToHead.viewerId, viewerId)),
    )
    .where(search.trim() === '' ? undefined : nameMatches(search));

export const sortedRosterQuery = (
  db: ArenaDatabase,
  viewerId: PlayerId,
  sort: RosterSort,
  search: string,
) => rosterQuery(db, viewerId, search).orderBy(...orderFor(sort));

export const playerQuery = (db: ArenaDatabase, id: PlayerId) =>
  db.select().from(players).where(eq(players.id, id)).limit(1);

export const headToHeadQuery = (db: ArenaDatabase, viewerId: PlayerId, opponentId: PlayerId) =>
  db
    .select()
    .from(headToHead)
    .where(and(eq(headToHead.viewerId, viewerId), eq(headToHead.opponentId, opponentId)))
    .limit(1);

export const playerCountQuery = (db: ArenaDatabase) =>
  db.select({ count: sql<number>`count(*)` }).from(players);

/** The viewer, joined in as a second copy of `players` so one query answers the detail screen. */
const viewerPlayers = alias(players, 'viewer');

/**
 * Everything the detail screen reads, in one row: the opponent, the viewer, and the
 * head-to-head between them. `useLiveQuery` subscribes to a single query, so resolving
 * this with three separate reads would mean three subscriptions that can disagree
 * mid-render.
 */
export const playerDetailQuery = (db: ArenaDatabase, viewerId: PlayerId, id: PlayerId) =>
  db
    .select({
      player: players,
      viewer: viewerPlayers,
      wins: headToHead.wins,
      losses: headToHead.losses,
    })
    .from(players)
    .innerJoin(viewerPlayers, eq(viewerPlayers.id, viewerId))
    .leftJoin(
      headToHead,
      and(eq(headToHead.viewerId, viewerId), eq(headToHead.opponentId, players.id)),
    )
    .where(eq(players.id, id))
    .limit(1);

/** Shape of one `rosterQuery` row. Named so the repository mapper can be read on its own. */
export interface RosterRow {
  player: PlayerRow;
  wins: number | null;
  losses: number | null;
}

/** Shape of one `playerDetailQuery` row. */
export interface PlayerDetailRow {
  player: PlayerRow;
  viewer: PlayerRow;
  wins: number | null;
  losses: number | null;
}

export type { HeadToHeadRow, PlayerRow };
