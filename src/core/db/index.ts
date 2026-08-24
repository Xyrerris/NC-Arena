/**
 * SQLite + Drizzle. The single source of truth the UI reads from (ARCHITECTURE.md §7).
 *
 * Features may never import this module — only core/data and the root layout may (the
 * latter runs migrations once at startup). Enforced in eslint.config.js.
 *
 * `client.ts` is deliberately NOT re-exported here. It opens an `expo-sqlite` handle at
 * import time, and `expo-sqlite` is a native module that plain Node cannot resolve — so
 * re-exporting it would take the whole query layer out of the Node test project (§10).
 * Import `@/core/db/client` explicitly from the places that run on a device.
 */

export { DATABASE_NAME } from './constants';

export { headToHead, players } from './schema';
export type { HeadToHeadInsert, HeadToHeadRow, PlayerInsert, PlayerRow } from './schema';
export { toHeadToHead, toPlayer } from './mappers';
export {
  headToHeadQuery,
  playerCountQuery,
  playerDetailQuery,
  playerQuery,
  rosterQuery,
  sortedRosterQuery,
  type ArenaDatabase,
  type PlayerDetailRow,
  type RosterRow,
} from './queries';
export {
  deleteLocalPlayer,
  insertLocalPlayer,
  isNameTaken,
  replaceRoster,
  updateLocalPlayer,
} from './write';
