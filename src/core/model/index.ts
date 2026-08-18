/**
 * Domain model — pure TypeScript.
 *
 * This module imports NOTHING. No React, no Drizzle, no Zod, no react-native. That is
 * enforced by `boundaries/element-types` in eslint.config.js, and it is what keeps the
 * model testable in plain Node with no RN preset (ARCHITECTURE.md §4, §10).
 *
 * See ARCHITECTURE.md §5 for the agreed shapes.
 */

/**
 * Branded string — the closest TypeScript gets to Kotlin's `value class`. Erased at
 * runtime, so it costs nothing, but it stops a raw `string` (a name, a route param)
 * being passed where an id is required.
 *
 * The prototype identified players by name and then indexed a *sorted* array with the
 * result (`DB.findIndex(x => x.name === p.name)`), so two players called "Skarn" broke
 * navigation. Ids are server-issued and stable from day one.
 */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/**
 * The only place a raw string becomes a `PlayerId`. Call it after confirming the row
 * exists — `src/app/player/[id].tsx` is the intended caller, because Expo Router hands
 * route params over as plain strings.
 */
export const asPlayerId = (raw: string): PlayerId => raw as PlayerId;

export type StatKey = 'ATK' | 'DEF' | 'CRIT' | 'HIT' | 'SPD';

/** Iteration order for the detail screen's stat rows; the prototype's order, kept. */
export const STAT_KEYS: readonly StatKey[] = ['ATK', 'DEF', 'CRIT', 'HIT', 'SPD'] as const;

export interface Player {
  id: PlayerId; // stable server id — NOT the display name
  name: string;
  rank: number; // absolute season rank, 1-based
  combatPower: number; // safe integer, < 2^53 (see §2.1)
  score: number;
  atk: number;
  def: number;
  critBp: number; // percent x 10_000. 58.4127% -> 584127
  hit: number;
  spd: number;
}

/**
 * Wins/losses are a *relationship*, not a player attribute (ARCHITECTURE.md §2.3). The
 * prototype's `p.wins` is read as *your* record against that player, so storing it as a
 * column on Player breaks the moment there is a second viewer.
 */
export interface HeadToHead {
  viewerId: PlayerId;
  opponentId: PlayerId;
  wins: number;
  losses: number;
}

export const played = (h: HeadToHead): number => h.wins + h.losses;

export type RosterSort = 'RANK' | 'COMBAT_POWER' | 'MY_WINS';

/** Narrowing guard for values read back out of persisted preferences. */
export const isRosterSort = (value: unknown): value is RosterSort =>
  value === 'RANK' || value === 'COMBAT_POWER' || value === 'MY_WINS';

/**
 * Reads a stat off a Player by key. CRIT is deliberately absent: it is stored in basis
 * points and every other stat is a raw count, so a single accessor returning `number`
 * would hand callers two different units under one type. `critBp` is read directly, and
 * the formatter is the only thing that divides it.
 */
export const rawStat = (player: Player, key: Exclude<StatKey, 'CRIT'>): number => {
  switch (key) {
    case 'ATK':
      return player.atk;
    case 'DEF':
      return player.def;
    case 'HIT':
      return player.hit;
    case 'SPD':
      return player.spd;
  }
};

/**
 * One row of the roster list. `record` is null when the viewer has never fought that
 * player — the prototype rendered that case as "never fought" — and it is also null for
 * the viewer's own row.
 *
 * This lives in the domain rather than in a feature because both screens and the
 * repository interface in ARCHITECTURE.md §7 are written in terms of it.
 */
export interface RosterEntry {
  player: Player;
  record: HeadToHead | null;
  isViewer: boolean;
}

/** Everything the detail screen needs, resolved in one query (ARCHITECTURE.md §7). */
export interface PlayerDetail {
  player: Player;
  viewer: Player;
  headToHead: HeadToHead | null;
}
