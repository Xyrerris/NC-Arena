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

import { createRosterRepository, type RosterRepository, type UseLiveData } from '../data';
import type { RosterSource } from '../common';
import { refoldPlayerNames, type ArenaDatabase } from '../db';
import { createMemoryPreferences, type ArenaPreferences } from '../prefs';

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
  // The repair `useArenaMigrations` runs after migrating on device (ADR-0032), here for the
  // same reason: the fold is the half of the schema SQL cannot write, so a database that
  // has only had the migrations applied is not yet in the state a real one is in.
  refoldPlayerNames(db);

  return {
    db,
    close: () => connection.close(),
  };
};

/**
 * The Node half of ADR-0012: run the observer's query directly instead of subscribing to
 * it. `better-sqlite3` is synchronous, so there is nothing to wait for and the result is
 * available in the first render — which is what makes a roster assertion a plain
 * `getByText` rather than a `waitFor`.
 *
 * There is no change listener, so a write made *after* a render only shows up once
 * something re-renders. That is the honest shape of the seam rather than a limitation to
 * work around: every write path in the app already sets state.
 */
export interface StubLiveDataOptions {
  /** False reproduces the frame before `useLiveQuery`'s first result lands. */
  loaded?: boolean;
  /** Set to reproduce a query failure without corrupting a database to cause one. */
  error?: Error | null;
}

export const createStubLiveData = (options: StubLiveDataOptions = {}): UseLiveData => {
  const { loaded = true, error = null } = options;
  return (live) => {
    if (error !== null) return { data: live.map([] as never), error, loaded };
    try {
      return { data: live.map(live.query.all() as never), error: null, loaded };
    } catch (cause) {
      return {
        data: live.map([] as never),
        error: cause instanceof Error ? cause : new Error(String(cause)),
        loaded,
      };
    }
  };
};

/**
 * A repository wired for a test, plus the preference store behind it.
 *
 * It lives here rather than in each test file because ARCHITECTURE.md §4 forbids a feature
 * from importing core/prefs *at all* — a feature has no business knowing preferences exist,
 * and a test file living inside a feature is still inside it. core/testing is the sanctioned
 * way through: it is allowed to import everything, precisely because it fakes everything.
 */
export interface TestRepository {
  repository: RosterRepository;
  preferences: ArenaPreferences;
  /**
   * A fresh repository over the same database and the same stored preferences — which is
   * what an app restart is, once the process-local state is gone.
   */
  restart(source?: RosterSource): RosterRepository;
}

export const createTestRepository = (db: ArenaDatabase, source: RosterSource): TestRepository => {
  const preferences = createMemoryPreferences();
  const build = (from: RosterSource = source) =>
    createRosterRepository({ db, source: from, preferences });
  return { repository: build(), preferences, restart: build };
};

export type { ArenaPreferences };
