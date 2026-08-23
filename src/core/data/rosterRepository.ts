/**
 * The repository from ARCHITECTURE.md §7. SQLite is the single source of truth; the
 * network never reaches a component and neither does TanStack Query's cache.
 *
 * Each observer returns a `{ query, map }` pair rather than data. On a device the query
 * goes to `useLiveQuery`; in the Node test project `.all()` is called directly. That is
 * what lets sort and search correctness be proven with no emulator (§10) while the app
 * still gets live updates — and it keeps the React dependency out of this file entirely.
 */

import {
  err,
  ok,
  type Result,
  type RosterSnapshot,
  type RosterSource,
  type ShortUnit,
} from '../common';
import {
  playerCountQuery,
  playerDetailQuery,
  playerQuery,
  replaceRoster,
  sortedRosterQuery,
  toHeadToHead,
  toPlayer,
  type ArenaDatabase,
  type PlayerDetailRow,
  type PlayerRow,
  type RosterRow,
} from '../db';
import {
  asPlayerId,
  type Player,
  type PlayerDetail,
  type PlayerId,
  type RosterEntry,
  type RosterSort,
} from '../model';
import type { ArenaPreferences } from '../prefs';

/**
 * A query plus the mapping from its rows to domain objects.
 *
 * The generic is over the *query* so the concrete Drizzle type survives to the call site —
 * `useLiveQuery` needs it, and widening it here would push a cast into every screen.
 */
export interface LiveQuery<TQuery extends { all(): unknown[] }, TResult> {
  readonly query: TQuery;
  readonly map: (rows: ReturnType<TQuery['all']>) => TResult;
}

const live = <TQuery extends { all(): unknown[] }, TResult>(
  query: TQuery,
  map: (rows: ReturnType<TQuery['all']>) => TResult,
): LiveQuery<TQuery, TResult> => ({ query, map });

/**
 * Matches no row. Used before the first sync has told us who the viewer is, so the roster
 * still renders — with no personal record attached — instead of failing to load.
 */
const NO_VIEWER = asPlayerId('');

const toRosterEntry = (row: RosterRow, viewerId: PlayerId): RosterEntry => {
  const player = toPlayer(row.player);
  const isViewer = player.id === viewerId;
  return {
    player,
    record:
      row.wins === null || row.losses === null
        ? null
        : toHeadToHead({
            viewerId,
            opponentId: player.id,
            wins: row.wins,
            losses: row.losses,
          }),
    isViewer,
  };
};

const toPlayerDetail = (row: PlayerDetailRow, viewerId: PlayerId): PlayerDetail => ({
  player: toPlayer(row.player),
  viewer: toPlayer(row.viewer),
  headToHead:
    row.wins === null || row.losses === null
      ? null
      : toHeadToHead({
          viewerId,
          opponentId: row.player.id,
          wins: row.wins,
          losses: row.losses,
        }),
});

export interface RosterRepositoryDeps {
  db: ArenaDatabase;
  source: RosterSource;
  preferences: ArenaPreferences;
}

export const createRosterRepository = ({ db, source, preferences }: RosterRepositoryDeps) => {
  const viewerId = (): PlayerId => preferences.getViewerId() ?? NO_VIEWER;

  const write = (snapshot: RosterSnapshot): void => {
    replaceRoster(db, snapshot);
    preferences.setViewerId(snapshot.viewerId);
    preferences.setSeason(snapshot.season);
  };

  const refresh = async (): Promise<Result<void>> => {
    const fetched = await source.fetchRoster();
    if (!fetched.ok) return fetched;
    try {
      write(fetched.value);
      return ok(undefined);
    } catch (cause) {
      return err(cause instanceof Error ? cause : new Error(String(cause)));
    }
  };

  return {
    observeRoster: (sort: RosterSort, search: string) => {
      const currentViewer = viewerId();
      return live(sortedRosterQuery(db, currentViewer, sort, search), (rows: RosterRow[]) =>
        rows.map((row) => toRosterEntry(row, currentViewer)),
      );
    },

    observePlayer: (id: PlayerId) => {
      const currentViewer = viewerId();
      return live(
        playerDetailQuery(db, currentViewer, id),
        (rows: PlayerDetailRow[]): PlayerDetail | null => {
          const row = rows[0];
          return row === undefined ? null : toPlayerDetail(row, currentViewer);
        },
      );
    },

    observeViewer: () =>
      live(playerQuery(db, viewerId()), (rows: PlayerRow[]): Player | null => {
        const row = rows[0];
        return row === undefined ? null : toPlayer(row);
      }),

    /**
     * The "N registered players" line. Live rather than a one-off read of `playerCount`
     * below, because it is rendered above a list that a sync can grow underneath it — and
     * because it must count the whole roster, not the rows a search left behind.
     */
    observeRosterSize: () =>
      live(playerCountQuery(db), (rows: { count: number }[]): number => rows[0]?.count ?? 0),

    refresh,

    /** Rows currently in the ladder. Cheap, and the only thing `ensureSeeded` needs. */
    playerCount: (): number => playerCountQuery(db).all()[0]?.count ?? 0,

    /**
     * The Phase 2 bootstrap: fill an empty database once, so the app has something to show
     * before a backend exists. Phase 5 replaces the *trigger* with a background sync; the
     * write path underneath is already the one sync will use.
     */
    ensureSeeded: async (): Promise<Result<void>> => {
      if (playerCountQuery(db).all()[0]?.count) return ok(undefined);
      return refresh();
    },

    /**
     * Who "you" are, as far as the stored preferences know. Screens need it as a
     * subscription key: every observer above resolves the viewer at call time, so a sync
     * that discovers a different viewer has to re-key them (ARCHITECTURE.md §9, decision 3).
     */
    getViewerId: (): PlayerId | null => preferences.getViewerId(),

    /** Null before the first sync; the header renders no season label rather than a wrong one. */
    getSeason: (): number | null => preferences.getSeason(),

    getShortUnit: (): ShortUnit => preferences.getShortUnit(),
    setShortUnit: (unit: ShortUnit): void => preferences.setShortUnit(unit),
    getRosterSort: (): RosterSort => preferences.getRosterSort(),
    setRosterSort: (sort: RosterSort): void => preferences.setRosterSort(sort),
  };
};

export type RosterRepository = ReturnType<typeof createRosterRepository>;
