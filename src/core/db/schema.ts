/**
 * Drizzle schema (ARCHITECTURE.md §5, §7).
 *
 * SQLite `INTEGER` is 64-bit, so every stat in the prototype's range stores exactly. The
 * precision ceiling is on the way *back* into JavaScript, which is the same 2^53 rule
 * §2.1 already covers — it is not re-enforced here, because the loss would have happened
 * before this layer saw the value.
 */

import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable(
  'players',
  {
    /** Stable server id, never the display name (§5). */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /**
     * `name` case-folded by `foldPlayerName`, and the only column a name lookup compares
     * (ADR-0032). Never displayed.
     *
     * It exists because SQLite's `lower()` folds ASCII only, so the fold has to happen in
     * JavaScript — which means it has to happen on the way *in*, and be stored. The default
     * is empty rather than `lower(name)` for the same reason: the migration cannot compute
     * this value, and a SQL-folded one would be wrong in exactly the cases the column was
     * added for. `refoldPlayerNames` fills it once the migration has run.
     */
    nameFolded: text('name_folded').notNull().default(''),
    /**
     * Account level as the game prints it. Defaults to 0 so the migration can add the
     * column to a database written before it existed without inventing a level for rows
     * whose level nobody ever recorded — the same reasoning `origin` uses below.
     */
    level: integer('level').notNull().default(0),
    /** The game's `#a984`, stored without the `#`. Empty when nobody supplied one. */
    gameCode: text('game_code').notNull().default(''),
    /** Absolute season rank, 1-based. Stays absolute when the list is sorted by CP or wins. */
    rank: integer('rank').notNull(),
    combatPower: integer('combat_power').notNull(),
    score: integer('score').notNull(),
    hp: integer('hp').notNull().default(0),
    atk: integer('atk').notNull(),
    def: integer('def').notNull(),
    /** Percent x 10_000. 58,4127% -> 584127 (§2.2). */
    critBp: integer('crit_bp').notNull(),
    hit: integer('hit').notNull(),
    spd: integer('spd').notNull(),
    /**
     * Who owns this row (ADR-0020). `REMOTE` rows are replaced wholesale by the next sync;
     * `LOCAL` rows were entered on this device and survive one. The default is `REMOTE` so
     * the migration can add the column to a database seeded before it existed without
     * inventing user data.
     */
    origin: text('origin', { enum: ['REMOTE', 'LOCAL'] })
      .notNull()
      .default('REMOTE'),
    /**
     * When a `REMOTE` row was last edited on this device, or null when it matches what the
     * server last sent (ADR-0036). Non-null means "the server has not seen this yet": the
     * next sync pushes it as an edit, and a snapshot applied before that push landed may not
     * overwrite it. Always null on a `LOCAL` row — that whole row is unpushed already.
     *
     * A timestamp rather than a flag so a sync can tell an edit it pushed from one made
     * while the request was in flight: only the first is settled by the snapshot.
     */
    editedAt: integer('edited_at'),
  },
  (table) => [
    index('players_rank_idx').on(table.rank),
    // Both name lookups — the duplicate guard and the screenshot import's identity match —
    // are equalities on this column. The roster's search is a `LIKE '%…%'` and cannot use
    // it; that is a performance question for the first real ladder, not this one.
    index('players_name_folded_idx').on(table.nameFolded),
    index('players_combat_power_idx').on(table.combatPower),
    // The write path filters on it twice per sync — once to clear the remote ladder, once
    // to re-rank the local rows that outlived it.
    index('players_origin_idx').on(table.origin),
  ],
);

/**
 * Wins/losses are a relationship, not a player attribute (§2.3). The composite primary key
 * is what makes a second viewer — or comparing two arbitrary players — a query change
 * rather than a migration.
 */
export const headToHead = sqliteTable(
  'head_to_head',
  {
    viewerId: text('viewer_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    opponentId: text('opponent_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.viewerId, table.opponentId] }),
    index('head_to_head_wins_idx').on(table.wins),
  ],
);

/**
 * Synced players removed on this device that the server has not been told about yet
 * (ADR-0039). A tombstone, not a flag on `players`: the row itself is gone from every screen
 * and query the moment it is removed, and only the id is left to push.
 *
 * Kept until a sync that carried the id is answered. Until then `replaceRoster` will not let
 * a snapshot put the player back.
 */
export const deletedPlayers = sqliteTable('deleted_players', {
  id: text('id').primaryKey(),
});

/**
 * Collections the user ticked by hand for one avatar (ADR-0044). A claim, not a fact: the
 * chain's answer wins over it, and a tick the chain contradicts stays here, shown as disputed,
 * until the user drops it.
 *
 * Keyed by the avatar as well as the collection, so a tick belongs to the avatar it was made
 * for. Choosing a different viewer or avatar does not delete anything and does not carry
 * the old ticks over — they are simply not the ones the new avatar's screen asks for.
 */
export const collectionTicks = sqliteTable(
  'collection_ticks',
  {
    planet: text('planet').notNull(),
    avatarAddress: text('avatar_address').notNull(),
    collectionId: integer('collection_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.planet, table.avatarAddress, table.collectionId] })],
);

/**
 * The last **complete** read of an avatar's unlocked collections (ADR-0044, decisions 4 and 5).
 * One row per avatar, replaced whole: a read is applied entirely or not at all, which is what
 * lets the screen show "updated N ago" from a device that is offline.
 *
 * `unlocked_ids` is a JSON array of integers — a set read and written as one value, never
 * queried by member, so a join table would only be more places for a half-applied read.
 */
export const collectionReads = sqliteTable(
  'collection_reads',
  {
    planet: text('planet').notNull(),
    avatarAddress: text('avatar_address').notNull(),
    unlockedIds: text('unlocked_ids').notNull(),
    /** Epoch milliseconds. */
    readAt: integer('read_at').notNull(),
    /** Which source answered (`mimir`, `node`), for the "from where" line. */
    source: text('source').notNull(),
    /** How far that source had indexed, or null when it cannot say. */
    blockIndex: integer('block_index'),
  },
  (table) => [primaryKey({ columns: [table.planet, table.avatarAddress] })],
);

export type CollectionReadRow = typeof collectionReads.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type PlayerInsert = typeof players.$inferInsert;
export type HeadToHeadRow = typeof headToHead.$inferSelect;
export type HeadToHeadInsert = typeof headToHead.$inferInsert;
