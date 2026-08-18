/**
 * Test doubles and helpers. Allowed to import everything, because it fakes everything.
 *
 * The in-memory database below is what makes ARCHITECTURE.md §10's "queries, in Node, no
 * emulator" row real. It applies the *committed* migration SQL rather than pushing the
 * schema, so a migration that does not apply cleanly fails the unit test run rather than
 * a device boot.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';

import type { ArenaDatabase } from '../db';

const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'db', 'migrations');

export interface TestDatabase {
  db: ArenaDatabase;
  /** Closing and re-opening the same file is how the "survives restart" test works. */
  close(): void;
}

/**
 * @param file `':memory:'` for a throwaway database, or a path to exercise persistence.
 */
export const createTestDatabase = (file = ':memory:'): TestDatabase => {
  const connection = new Database(file);
  // Foreign keys are per-connection and off by default in SQLite, so the cascade and the
  // head_to_head -> players reference are only actually tested if this is on.
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db,
    close: () => connection.close(),
  };
};
