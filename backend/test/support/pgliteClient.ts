/**
 * Stands in for `src/db/client.ts` under test. Every test file mocks that module with this one
 * (`vi.mock('../src/db/client.js', () => import('./support/pgliteClient.js'))`), so the routes,
 * the auth check and `applyRosterSync` run unchanged against a real PostgreSQL — PGlite, the
 * Postgres server compiled to WebAssembly, in this process, with nothing to install or start.
 *
 * The schema is built by the **committed migrations**, not by pushing `schema.ts`. That is the
 * point: the SQL under `src/db/migrations` is what the live database runs, and `0000_init.sql`
 * is hand-written (backend/README.md), so a test database built any other way would prove
 * nothing about it.
 *
 * Each test file gets its own instance — Vitest isolates modules per file — and `resetDatabase`
 * empties it between tests.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../../src/db/schema.js';

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/db/migrations',
);

const client = new PGlite();
export const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder });

/** The production module exports the pool so `migrate.ts` can close it; nothing here needs to. */
export const pool = { end: async (): Promise<void> => {} };

/** Every table hangs off `accounts` by a cascading foreign key, so one truncate clears them all. */
export const resetDatabase = async (): Promise<void> => {
  await db.execute(sql`TRUNCATE accounts CASCADE`);
};
