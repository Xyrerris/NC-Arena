/**
 * Repositories and sync orchestration. The only module that knows both the database and
 * the network exist (ARCHITECTURE.md §4, §7).
 *
 * Phase 5 supplies a remote implementation of the `RosterSource` port, which currently has
 * none (ADR-0021) — if that phase produces any diff under src/features, the boundary was
 * wrong.
 */

export { ArenaDataProvider, useArenaData, type ArenaData } from './arenaContext';
export type { LiveData, UseLiveData } from './liveData';
export {
  PlayerDraftRejected,
  createRosterRepository,
  type LiveQuery,
  type RosterRepository,
  type RosterRepositoryDeps,
} from './rosterRepository';
