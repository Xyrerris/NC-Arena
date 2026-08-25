/**
 * Domain model — pure TypeScript.
 *
 * This module imports NOTHING outside itself. No React, no Drizzle, no Zod, no
 * react-native. That is enforced by `boundaries/element-types` in eslint.config.js, and it
 * is what keeps the model testable in plain Node with no RN preset (ARCHITECTURE.md §4,
 * §10). The single import below is a sibling file inside the same boundary element, which
 * costs the domain none of that independence.
 *
 * See ARCHITECTURE.md §5 for the agreed shapes.
 */

import { CRIT_BP_PER_PERCENT, type PlayerDraft } from './playerDraft';

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

export {
  CRIT_BP_PER_PERCENT,
  MAX_CRIT_PERCENT,
  MAX_GAME_CODE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_DRAFT_NUMERIC_FIELDS,
  emptyPlayerDraft,
  gameCodeLabel,
  isPlayerDraftValid,
  normaliseGameCode,
  normalisePlayerName,
  validatePlayerDraft,
  type PlayerDraft,
  type PlayerDraftErrors,
  type PlayerDraftField,
  type PlayerDraftNumericField,
} from './playerDraft';

/**
 * Where a stored row came from.
 *
 * `REMOTE` rows belong to whoever syncs the ladder — nobody yet, the backend in Phase 5 —
 * and the next sync overwrites them, so editing one offline would produce a change the app
 * cannot keep. `LOCAL` rows were entered on this device and nothing upstream knows about
 * them, so they are the only rows the user may edit or delete (ADR-0020).
 *
 * Since the seed was removed (ADR-0021) **every** row is `LOCAL`. The distinction is not
 * dead code waiting on Phase 5: it is what stops that phase silently eating the roster the
 * user built in the meantime.
 *
 * It is deliberately *not* a field on `Player`: a roster source produces players and has
 * no business declaring where they will be stored. Origin is a property of the stored
 * row, so it travels on the two shapes that come back *out* of the store — `RosterEntry`
 * and `PlayerDetail`.
 */
export type PlayerOrigin = 'REMOTE' | 'LOCAL';

export type StatKey = 'HP' | 'ATK' | 'DEF' | 'CRIT' | 'HIT' | 'SPD';

/**
 * Iteration order for the detail screen's stat rows. The prototype's order, kept, with HP
 * added at the front — which is where the game's own profile panel puts it (ADR-0023), and
 * putting it anywhere else would make the app and its source screen disagree about what a
 * player's stat book looks like.
 */
export const STAT_KEYS: readonly StatKey[] = ['HP', 'ATK', 'DEF', 'CRIT', 'HIT', 'SPD'] as const;

export interface Player {
  id: PlayerId; // stable server id — NOT the display name
  name: string;
  /** Account level as the game prints it (`Lv.488`). Never a rank and never a stat. */
  level: number;
  /** The game's `#a984`, stored without the `#`. May be empty; never an identity. */
  gameCode: string;
  rank: number; // absolute season rank, 1-based
  combatPower: number; // safe integer, < 2^53 (see §2.1)
  score: number;
  hp: number;
  atk: number;
  def: number;
  critBp: number; // percent x 10_000. 58,4127% -> 584127
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
    case 'HP':
      return player.hp;
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
  /** `LOCAL` for a player this device added by hand — the roster marks those rows. */
  origin: PlayerOrigin;
}

/**
 * Everything the detail screen needs, resolved in one query (ARCHITECTURE.md §7).
 *
 * `viewer` is null before the first sync has said who "you" are — open decision 3, the
 * same reason the roster's hero card is nullable. The Stats tab is fully readable without
 * it; only Vs You has nothing to say.
 */
export interface PlayerDetail {
  player: Player;
  viewer: Player | null;
  headToHead: HeadToHead | null;
  /** Only a `LOCAL` player offers the edit and delete controls (ADR-0020). */
  origin: PlayerOrigin;
}

/**
 * A stored player, back in the shape the form edits. `id` and `rank` are dropped rather
 * than hidden: the form cannot change either, and carrying them through a round trip is
 * how a screen ends up "helpfully" writing one back.
 */
export const toPlayerDraft = (player: Player): PlayerDraft => ({
  name: player.name,
  level: player.level,
  gameCode: player.gameCode,
  combatPower: player.combatPower,
  score: player.score,
  hp: player.hp,
  atk: player.atk,
  def: player.def,
  // bp -> whole percent. Exact for every player a form created, because the form is the
  // only thing that writes a local row and it always scales up from an integer. A stored
  // value that is *not* a whole percent — a synced row, which is not editable anyway —
  // arrives here fractional and is then rejected by `validatePlayerDraft` on save. That is
  // the honest failure: visible in the field, rather than silently rounded on the way in.
  critPercent: player.critBp / CRIT_BP_PER_PERCENT,
  hit: player.hit,
  spd: player.spd,
});
