/** Device-local database filename. Used by the Expo SQLite client and drizzle.config.ts. */
export const DATABASE_NAME = 'arena.db';

/**
 * How many migrations the committed journal holds — the shape of the tables an export was
 * written against (ADR-0033).
 *
 * A hand-written integer rather than a read of `migrations/meta/_journal.json`, because it
 * has to be available on device: the journal is a build-time artefact of `drizzle-kit` and
 * `migrations.js` is what Metro bundles, not the meta folder beside it. `schemaVersion.test.ts`
 * asserts the two agree, so the number cannot drift behind a migration that was added and
 * forgotten — which is the failure that would let a backup claim a schema it was not written at.
 */
export const SCHEMA_VERSION = 4;
