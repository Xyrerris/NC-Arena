/**
 * The backup document: what an export writes, and what an import is allowed to believe
 * (ADR-0033).
 *
 * The roster lives in exactly one place — an app-private SQLite file on one phone — so an
 * uninstall, a factory reset or a "clear data" tap takes everything the user typed. This
 * module is the answer to that, and it is deliberately the *whole* answer: a schema-versioned
 * JSON document rather than a copy of `arena.db`, because a binary written under an older
 * schema restores into a database that no longer has those tables, while a document can be
 * read by a build that knows what its version means.
 *
 * Nothing here touches the database or the filesystem. It is strings in, strings out —
 * which is what lets every refusal below be proven in the Node project, and what makes
 * "refuses **before** touching the database" a property of the call order rather than a
 * promise (ARCHITECTURE.md §10).
 */

import { err, ok, type Result } from '../common';
import { SCHEMA_VERSION } from '../db';
import { asPlayerId, type HeadToHead, type PlayerOrigin, type StoredPlayer } from '../model';

/**
 * What makes a file ours. Written into every document and checked before anything else, so
 * a JSON file that happens to parse — a package.json, an export from another app — is
 * refused as the wrong file rather than as a broken roster.
 */
export const BACKUP_FORMAT = 'arena-scout.roster';

/** One exported ladder. The serialised shape is this interface, field for field. */
export interface RosterBackup {
  format: typeof BACKUP_FORMAT;
  /** The migration count the ladder was written at (`SCHEMA_VERSION`). */
  schemaVersion: number;
  /** ISO 8601, for the reader. Nothing branches on it. */
  exportedAt: string;
  /** Null when no sync has ever named a season — there is no sync yet (ADR-0021). */
  season: number | null;
  /** Null when no avatar has been chosen. Otherwise it names a player in this document. */
  viewerId: string | null;
  players: readonly StoredPlayer[];
  headToHead: readonly HeadToHead[];
}

/** How many players and records a document turned out to hold. Reported after an import. */
export interface RosterBackupSummary {
  players: number;
  records: number;
  season: number | null;
}

export const summarise = (backup: RosterBackup): RosterBackupSummary => ({
  players: backup.players.length,
  records: backup.headToHead.length,
  season: backup.season,
});

const NOT_OURS =
  'That file is not an Arena Scout roster. Pick the file the app exported — its name starts ' +
  'with "arena-scout-roster".';

const TRUNCATED =
  'That file is damaged and could not be read to the end. Nothing has been changed on this ' +
  'device.';

const futureSchema = (found: number): string =>
  `That backup was written at schema version ${found}, and this version of Arena Scout ` +
  `understands up to ${SCHEMA_VERSION}. Update the app and import it again.`;

/**
 * Two spaces, and the field order this file declares.
 *
 * The exported file is the user's only copy of their own data, so it is written to be
 * *read*: one player per set of lines, names spelled as they were typed, numbers as
 * numbers. A minified document would round-trip identically and would leave somebody
 * holding a single 40 kB line as their last resort.
 */
export const serialiseBackup = (backup: RosterBackup): string =>
  `${JSON.stringify(backup, null, 2)}\n`;

/**
 * `arena-scout-roster-2026-09-07.json`.
 *
 * Dated rather than sequenced, because the share sheet hands the name to whatever the user
 * saves it with and a second export on the same day should be recognisable as the newer
 * copy of the same thing.
 */
export const backupFileName = (exportedAt: string): string =>
  `arena-scout-roster-${exportedAt.slice(0, 10)}.json`;

/** Anything JSON can produce for an object, before it has been checked. */
type Unknowns = Record<string, unknown>;

const isObject = (value: unknown): value is Unknowns =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stat, as this app has always defined one: an integer inside the range JavaScript can
 * hold exactly (ARCHITECTURE.md §2.1). A file is user-editable text, so this is the layer
 * where `1e400`, `"12"` and `12.5` are turned away.
 */
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const missing = (where: string, field: string): string =>
  `${where} is missing "${field}", or its value is not one this app can read.`;

/**
 * Every column with no default in `players`, so a document that omits one is refused rather
 * than restored as a zero the user never typed.
 */
const REQUIRED_STATS = [
  'rank',
  'combatPower',
  'score',
  'atk',
  'def',
  'critBp',
  'hit',
  'spd',
] as const;

/**
 * The columns the schema gives a default, and the default it gives them.
 *
 * They are optional in a document for exactly the reason they are defaulted in the table:
 * each was added by a migration to rows written before it existed, and a backup written
 * before that migration is the same case. An older file is therefore read rather than
 * refused — the alternative is telling somebody their only copy is unreadable because the
 * app has moved on, which is the failure this whole feature exists to prevent.
 */
const DEFAULTED_STATS = { level: 0, gameCode: '', hp: 0 } as const;

const isOrigin = (value: unknown): value is PlayerOrigin => value === 'LOCAL' || value === 'REMOTE';

/** Reads a fixed set of count fields, or names the first one that is not one. */
const readCounts = <K extends string>(
  raw: Unknowns,
  where: string,
  fields: readonly K[],
): Result<Record<K, number>> => {
  const counts = {} as Record<K, number>;
  for (const field of fields) {
    const value = raw[field];
    if (!isCount(value)) return err(new Error(missing(where, field)));
    counts[field] = value;
  }
  return ok(counts);
};

const readPlayer = (raw: unknown, index: number): Result<StoredPlayer> => {
  const where = `Player ${index + 1}`;
  if (!isObject(raw)) return err(new Error(`${where} is not a player.`));

  if (typeof raw.id !== 'string' || raw.id === '') return err(new Error(missing(where, 'id')));
  if (typeof raw.name !== 'string' || raw.name === '')
    return err(new Error(missing(where, 'name')));

  const stats = readCounts(raw, where, REQUIRED_STATS);
  if (!stats.ok) return stats;

  const level = raw.level ?? DEFAULTED_STATS.level;
  if (!isCount(level)) return err(new Error(missing(where, 'level')));
  const hp = raw.hp ?? DEFAULTED_STATS.hp;
  if (!isCount(hp)) return err(new Error(missing(where, 'hp')));
  const gameCode = raw.gameCode ?? DEFAULTED_STATS.gameCode;
  if (typeof gameCode !== 'string') return err(new Error(missing(where, 'gameCode')));
  // A document from before `origin` existed described a synced ladder, which is what the
  // column's own default says about a row from the same era (see `players.origin`).
  const origin = raw.origin ?? 'REMOTE';
  if (!isOrigin(origin)) return err(new Error(missing(where, 'origin')));

  return ok({
    id: asPlayerId(raw.id),
    name: raw.name,
    level,
    gameCode,
    rank: stats.value.rank,
    combatPower: stats.value.combatPower,
    score: stats.value.score,
    hp,
    atk: stats.value.atk,
    def: stats.value.def,
    critBp: stats.value.critBp,
    hit: stats.value.hit,
    spd: stats.value.spd,
    origin,
  });
};

const readRecord = (raw: unknown, index: number): Result<HeadToHead> => {
  const where = `Record ${index + 1}`;
  if (!isObject(raw)) return err(new Error(`${where} is not a head-to-head record.`));

  if (typeof raw.viewerId !== 'string' || raw.viewerId === '')
    return err(new Error(missing(where, 'viewerId')));
  if (typeof raw.opponentId !== 'string' || raw.opponentId === '')
    return err(new Error(missing(where, 'opponentId')));
  // Negative is refused here for the same reason `recordMatchResult` refuses it: a record
  // counts matches that happened, so neither column has a meaning below zero.
  if (!isCount(raw.wins) || raw.wins < 0) return err(new Error(missing(where, 'wins')));
  if (!isCount(raw.losses) || raw.losses < 0) return err(new Error(missing(where, 'losses')));

  return ok({
    viewerId: asPlayerId(raw.viewerId),
    opponentId: asPlayerId(raw.opponentId),
    wins: raw.wins,
    losses: raw.losses,
  });
};

/**
 * A file, checked all the way down to something `restoreRoster` can be handed.
 *
 * Everything is refused *here*, before the transaction opens, because the transaction's
 * first statement deletes the roster. A rollback would restore the rows and would still
 * have been the wrong shape of answer: "your import failed" is a sentence about a file, and
 * it should never be reached by way of the database.
 *
 * The three refusals the exit criteria name each get their own sentence — a file that is
 * not ours, a file that does not parse, and a file from a schema this build does not know —
 * and so does every structural problem below them, because "that backup is invalid" tells
 * somebody holding their only copy nothing about what to fix.
 */
export const parseRosterBackup = (text: string): Result<RosterBackup> => {
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    // A truncated file, a half-written one, a picked directory. All the same to the reader:
    // there is no document here, and nothing has been touched.
    return err(new Error(TRUNCATED));
  }

  if (!isObject(document) || document.format !== BACKUP_FORMAT) return err(new Error(NOT_OURS));

  if (!isCount(document.schemaVersion) || document.schemaVersion < 1)
    return err(new Error(missing('This backup', 'schemaVersion')));
  if (document.schemaVersion > SCHEMA_VERSION)
    return err(new Error(futureSchema(document.schemaVersion)));

  if (!Array.isArray(document.players)) return err(new Error(missing('This backup', 'players')));
  if (!Array.isArray(document.headToHead))
    return err(new Error(missing('This backup', 'headToHead')));

  const players: StoredPlayer[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of document.players.entries()) {
    const read = readPlayer(raw, index);
    if (!read.ok) return read;
    if (ids.has(read.value.id)) {
      // The id is the primary key. Two rows sharing one is the failure the domain model's
      // note on `PlayerId` describes, and it would arrive as a constraint violation from
      // inside the transaction rather than as a sentence about the file.
      return err(new Error(`Player ${index + 1} repeats the id "${read.value.id}".`));
    }
    ids.add(read.value.id);
    players.push(read.value);
  }

  const headToHead: HeadToHead[] = [];
  const pairings = new Set<string>();
  for (const [index, raw] of document.headToHead.entries()) {
    const read = readRecord(raw, index);
    if (!read.ok) return read;
    const { viewerId, opponentId } = read.value;
    // `head_to_head` references `players`, so an end naming nobody is a row the restore
    // could not write — and with the pragma off it is worse: a row pointing at nothing.
    if (!ids.has(viewerId) || !ids.has(opponentId)) {
      return err(new Error(`Record ${index + 1} is against a player this backup does not carry.`));
    }
    // A row `recordMatchResult` refuses to write and every screen says cannot exist. An
    // export can never produce one; a file somebody edited by hand can, and restoring it
    // would put a record badge on the user's own roster row with nothing able to remove it.
    if (viewerId === opponentId) {
      return err(new Error(`Record ${index + 1} is a player against themselves.`));
    }
    // `\u0000`, for the reason `write.ts` gives: an id is opaque, and a printable
    // separator an id could contain would let two pairings collide into one key.
    const key = `${viewerId}\u0000${opponentId}`;
    if (pairings.has(key)) {
      return err(new Error(`Record ${index + 1} repeats a pairing already in this backup.`));
    }
    pairings.add(key);
    headToHead.push(read.value);
  }

  const season = document.season ?? null;
  if (season !== null && !isCount(season)) return err(new Error(missing('This backup', 'season')));

  const viewerId = document.viewerId ?? null;
  if (viewerId !== null && typeof viewerId !== 'string')
    return err(new Error(missing('This backup', 'viewerId')));
  // Refused rather than dropped. A preference pointing at a row that is not there renders a
  // roster with no hero card and nothing on screen saying why — the silent-empty failure
  // ADR-0021 removed, arriving through a file instead of a seed.
  if (viewerId !== null && !ids.has(viewerId))
    return err(new Error('This backup names an avatar who is not one of its players.'));

  const exportedAt = typeof document.exportedAt === 'string' ? document.exportedAt : '';

  return ok({
    format: BACKUP_FORMAT,
    schemaVersion: document.schemaVersion,
    exportedAt,
    season,
    viewerId,
    players,
    headToHead,
  });
};
