/**
 * Repositories and sync orchestration. The only module that knows both the database and
 * the network exist (ARCHITECTURE.md §4, §7).
 *
 * Filled in Phase 2: `rosterRepository` with SQL-side sort and search, plus
 * `localSeedRosterSource` reading assets/seed.json.
 * Phase 5 swaps in the remote source behind the same interface — if that phase produces
 * any diff under src/features, the boundary was wrong.
 */

export {};
