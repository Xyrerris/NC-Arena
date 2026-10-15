/** Runs committed migrations against DATABASE_URL. `npm run db:migrate` — idempotent. */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db, pool } from './client.js';

// Resolved relative to this file, not the process cwd, so the same script finds
// `src/db/migrations` in dev (tsx) and `dist/db/migrations` once built (see Dockerfile,
// which copies the SQL alongside the compiled output for exactly this reason).
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

await migrate(db, { migrationsFolder });
await pool.end();
console.log('Migrations applied.');
