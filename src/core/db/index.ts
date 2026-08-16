/**
 * SQLite + Drizzle. The single source of truth the UI reads from (ARCHITECTURE.md §7).
 *
 * Filled in Phase 2: schema (`players`, `head_to_head`), drizzle-kit migrations, queries,
 * and the seed import.
 *
 * Features may never import this module — only core/data and the root layout may
 * (the latter runs migrations once at startup). Enforced in eslint.config.js.
 */

/** Device-local database filename. Used by the Expo SQLite provider and drizzle.config.ts. */
export const DATABASE_NAME = 'arena.db';
