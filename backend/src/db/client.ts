/**
 * Postgres connection + Drizzle client (ADR-0035).
 *
 * `pg`'s default int8 (bigint) parser returns a string, because a value above 2^53 would lose
 * precision as a JS `number`. Every stat column is validated against `Number.MAX_SAFE_INTEGER`
 * by the Zod schemas in `src/schemas` before it is ever written, so returning a `number` here
 * is safe *because* that boundary already ran — not instead of it. OID 20 is `int8`.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

pg.types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — see backend/.env.example');
}

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
