/**
 * Repositories and sync orchestration. The only module that knows both the database and
 * the network exist (ARCHITECTURE.md §4, §7).
 *
 * Phase 5 swaps `localSeedRosterSource` for a remote one behind the same `RosterSource`
 * port — if that phase produces any diff under src/features, the boundary was wrong.
 */

export { localSeedRosterSource } from './localSeedRosterSource';
export {
  createRosterRepository,
  type LiveQuery,
  type RosterRepository,
  type RosterRepositoryDeps,
} from './rosterRepository';
