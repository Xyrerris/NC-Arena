/**
 * Drizzle schema, PostgreSQL side (ADR-0035).
 *
 * This is a second, independent schema from `src/core/db/schema.ts` on the client. Both
 * describe the same domain — a player, a head-to-head pairing — from two different storage
 * engines, and translating one into the other belongs in `core/network`'s mappers, not in a
 * shared module: nothing on the client may import from `backend/`, and nothing here may
 * import from `src/`.
 *
 * Every stat column is `bigint`. Postgres `bigint` is 64-bit, which comfortably holds values
 * this app will never accept — the ceiling is `Number.MAX_SAFE_INTEGER` (§2.1), enforced by
 * the Zod schemas in `src/schemas` *before* a row reaches this table. `db/client.ts` configures
 * the driver to hand `bigint` columns back as JS `number`, which is safe only because that
 * boundary already ran.
 */

import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * Hash of the secret a device exchanges for its own row in `apiKeys` — reusable, so more
   * than one device can pair to the same account (ADR-0035, decision 2). Shown to the user
   * only once, at account creation; not single-use server-side.
   */
  recoveryCodeHash: text('recovery_code_hash').notNull().unique(),
  /**
   * Which player on this account's roster is the viewer. Nullable: an account that has never
   * chosen one has nothing to put here, mirroring ADR-0022's local `viewerId` before a choice
   * is made. Not a foreign key — `players.accountId` already scopes the row, and a circular
   * FK between the two tables buys nothing a nullable uuid plus an app-level check does not.
   */
  viewerId: uuid('viewer_id'),
  /** The ladder season this account's roster belongs to (ARCHITECTURE.md §7, ADR-0018). */
  season: integer('season').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per device paired to an account — the first device (created alongside the account)
 * and every device that later linked with the recovery code. Splitting this out from
 * `accounts` is what lets more than one device hold a live, independently revocable bearer
 * token for the same roster.
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Folded once, on the way in, by the same rule as ADR-0032 — never displayed. */
    nameFolded: text('name_folded').notNull(),
    level: integer('level').notNull().default(0),
    gameCode: text('game_code').notNull().default(''),
    rank: integer('rank').notNull(),
    combatPower: bigint('combat_power', { mode: 'number' }).notNull(),
    score: bigint('score', { mode: 'number' }).notNull(),
    hp: bigint('hp', { mode: 'number' }).notNull().default(0),
    atk: bigint('atk', { mode: 'number' }).notNull(),
    def: bigint('def', { mode: 'number' }).notNull(),
    /** Percent x 10_000, exactly as `core/model`'s `critBp` (§2.2). */
    critBp: bigint('crit_bp', { mode: 'number' }).notNull(),
    hit: bigint('hit', { mode: 'number' }).notNull(),
    spd: bigint('spd', { mode: 'number' }).notNull(),
    /**
     * The id the device that created this row knows it by — `POST /v1/roster/sync`'s
     * `clientId`, kept rather than discarded once it has been answered.
     *
     * Keeping it is what makes that endpoint idempotent. The response carries the
     * `clientId` -> server id map, so a response lost in transit leaves the client unable to
     * tell "applied" from "never arrived"; without this column its only safe move is to push
     * again, and the retry inserts a second copy of every row. With it, the replay finds the
     * row it already created and is answered with the same id.
     *
     * Nullable, and deliberately so: rows that predate this column have no `clientId` to
     * record, and Postgres treats NULLs as distinct in a unique index, so any number of them
     * coexist per account. A row is only ever keyed here by the device that invented it.
     */
    clientId: text('client_id'),
    /**
     * Decides which push wins when two devices edit the same row between syncs
     * (ADR-0035, decision 3 — last write wins, no merge).
     */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('players_account_rank_idx').on(table.accountId, table.rank),
    index('players_account_name_folded_idx').on(table.accountId, table.nameFolded),
    index('players_account_combat_power_idx').on(table.accountId, table.combatPower),
    // The durable half of the idempotency guarantee. `applyRosterSync` reads before it writes,
    // but a read and a write are two statements: two pushes racing on the same `clientId` can
    // both find nothing. This index is what makes the loser of that race a conflict rather
    // than a duplicate, and the sync handles it by answering with the row that won.
    uniqueIndex('players_account_client_id_idx').on(table.accountId, table.clientId),
  ],
);

export const headToHead = pgTable(
  'head_to_head',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    opponentId: uuid('opponent_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.viewerId, table.opponentId] }),
    index('head_to_head_account_idx').on(table.accountId),
  ],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  apiKeys: many(apiKeys),
  players: many(players),
  headToHead: many(headToHead),
}));

export const playersRelations = relations(players, ({ one }) => ({
  account: one(accounts, { fields: [players.accountId], references: [accounts.id] }),
}));

export type AccountRow = typeof accounts.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type PlayerInsert = typeof players.$inferInsert;
export type HeadToHeadRow = typeof headToHead.$inferSelect;
