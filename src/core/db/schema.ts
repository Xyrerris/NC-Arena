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
  },
  (table) => [
    index('players_rank_idx').on(table.rank),
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

export type PlayerRow = typeof players.$inferSelect;
export type PlayerInsert = typeof players.$inferInsert;
export type HeadToHeadRow = typeof headToHead.$inferSelect;
export type HeadToHeadInsert = typeof headToHead.$inferInsert;
