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
  deleteLocalPlayer,
  insertLocalPlayer,
  isNameTaken,
  playerCountQuery,
  playerDetailQuery,
  playerQuery,
  recordMatchResult,
  replaceRoster,
  sortedRosterQuery,
  toHeadToHead,
  toPlayer,
  updateLocalPlayer,
  type ArenaDatabase,
  type PlayerDetailRow,
  type PlayerRow,
  type RecordMatchRefusal,
  type RosterRow,
} from '../db';
import {
  asPlayerId,
  isPlayerDraftValid,
  normalisePlayerName,
  validatePlayerDraft,
  type HeadToHead,
  type MatchDelta,
  type MatchOutcome,
  type Player,
  type PlayerDetail,
  type PlayerDraft,
  type PlayerDraftErrors,
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
    origin: row.player.origin,
  };
};

const toPlayerDetail = (row: PlayerDetailRow, viewerId: PlayerId): PlayerDetail => ({
  player: toPlayer(row.player),
  viewer: row.viewer === null ? null : toPlayer(row.viewer),
  headToHead:
    row.wins === null || row.losses === null
      ? null
      : toHeadToHead({
          viewerId,
          opponentId: row.player.id,
          wins: row.wins,
          losses: row.losses,
        }),
  origin: row.player.origin,
});

/**
 * Rejected because of what the user typed, with the offending fields named. Distinct from
 * a plain `Error` so the form can put each message under its own input instead of dumping
 * one sentence at the top of the screen.
 *
 * It is still an `Error`, so a caller that only wants `result.error.message` — the retry
 * banner both screens already have — keeps working without knowing this type exists.
 */
export class PlayerDraftRejected extends Error {
  readonly fields: PlayerDraftErrors;

  constructor(fields: PlayerDraftErrors) {
    super(Object.values(fields)[0] ?? 'That player could not be saved.');
    this.name = 'PlayerDraftRejected';
    this.fields = fields;
  }
}

/**
 * Ids for players this device invented.
 *
 * Prefixed, because the prefix is the one thing that makes a locally-created id
 * recognisable when Phase 5 has to decide what to push upstream — and because
 * `src/app/player/new.tsx` is a static route, so an id that could ever be the literal
 * string `new` would be a player nobody can open.
 *
 * Time-ordered first so two rows added in the same session sort by creation, random
 * second so two added in the same millisecond do not collide.
 */
const newLocalPlayerId = (): PlayerId =>
  asPlayerId(`local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * One message for "no such player" and for "that player is not yours to change". The two
 * are deliberately indistinguishable to the caller: a row synced from upstream will be
 * overwritten by the next refresh, so an edit the app appeared to accept would vanish —
 * which is a worse answer than declining it (ADR-0020).
 */
const NOT_YOURS = 'Only players you added on this device can be edited or removed.';

/** `setViewerId` picks an existing row; it never creates one (ADR-0022). */
const NO_SUCH_PLAYER = 'That player is not on the roster.';

/**
 * A result is *yours against them*, so there has to be a "you" (ARCHITECTURE.md §2.3).
 *
 * It covers two states the user cannot tell apart and does not need to: no avatar has ever
 * been chosen, and the chosen one has since been deleted from another screen. Both leave
 * the same hole and both are closed by the same act, so they get the same sentence — what
 * they must *not* get is a sentence about the opponent, who is present either way.
 */
const NO_VIEWER_YET = 'Choose which player is your avatar before recording a match.';

const NOT_AGAINST_YOURSELF = 'You have no record against yourself.';

/**
 * The stepper hides a `-1` it cannot honour, so reaching this means the count changed under
 * the press — two taps racing, or a swipe on the roster beneath. It names the floor rather
 * than the race, because the floor is the part that will still be true a second later.
 */
const NOTHING_TO_REMOVE = 'There is no match left to take back.';

/**
 * One sentence per refusal. The mapping lives here rather than in `core/db`, which reports
 * *which* rule refused and stays free of anything the user reads (ARCHITECTURE.md §2.3).
 */
const REFUSAL_MESSAGE: Record<RecordMatchRefusal, string> = {
  NO_VIEWER: NO_VIEWER_YET,
  NO_OPPONENT: NO_SUCH_PLAYER,
  SELF: NOT_AGAINST_YOURSELF,
  BELOW_ZERO: NOTHING_TO_REMOVE,
};

export interface RosterRepositoryDeps {
  db: ArenaDatabase;
  /**
   * Where a synced ladder comes from — **absent today** (ADR-0021).
   *
   * The app starts empty and is filled by hand, so there is nothing upstream to pull from
   * until Phase 5 supplies a remote source. The port stays in the signature rather than
   * being deleted alongside its former implementation: it is the seam the whole data layer
   * is shaped around (ARCHITECTURE.md §7), and a repository that had to *grow* one back
   * would be a repository whose boundary had moved.
   */
  source?: RosterSource;
  preferences: ArenaPreferences;
}

export const createRosterRepository = ({ db, source, preferences }: RosterRepositoryDeps) => {
  const viewerId = (): PlayerId => preferences.getViewerId() ?? NO_VIEWER;

  /**
   * Who "you" are is now something the user can change (ADR-0022), and every observer
   * resolves it at call time — so a screen that read it during render would keep showing
   * the old viewer until something else re-rendered it. The roster sitting underneath the
   * "who are you" screen is exactly that case.
   *
   * A listener set here rather than an event on the preference store, because it is
   * `core/data` that knows this id is a subscription key; `core/prefs` is a key-value
   * store and stays one.
   */
  const viewerListeners = new Set<() => void>();

  const notifyViewerChanged = (): void => {
    for (const listener of viewerListeners) listener();
  };

  const write = (snapshot: RosterSnapshot): void => {
    replaceRoster(db, snapshot);
    preferences.setViewerId(snapshot.viewerId);
    preferences.setSeason(snapshot.season);
    // A sync moves the same id the user can move, so it announces it the same way.
    notifyViewerChanged();
  };

  const refresh = async (): Promise<Result<void>> => {
    // No source, no failure. Nothing upstream exists yet (ADR-0021), and the roster is
    // already showing everything there is — so "pull to refresh" has genuinely nothing to
    // do. Reporting an error instead would put a working, hand-filled roster behind "The
    // ladder could not be read", which is both alarming and false.
    if (source === undefined) return ok(undefined);

    const fetched = await source.fetchRoster();
    if (!fetched.ok) return fetched;
    try {
      write(fetched.value);
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  };

  /**
   * The one write behind `recordMatch` and `removeMatch` (ADR-0027, ADR-0029).
   *
   * The **viewer is resolved here**, not passed in. A caller that could name both sides of
   * a head-to-head could write a record between two other players, which is a fact this app
   * has no way to know and no screen to show — and the roster's swipe would then be one
   * argument away from doing it by accident.
   *
   * Only the unset preference is answered before the write. The remaining refusals are the
   * transaction's to report: a viewer row deleted between this check and the insert would
   * otherwise be described by whichever sentence was chosen up here, and it was the
   * opponent's (ADR-0028).
   */
  const moveRecord = (
    opponentId: PlayerId,
    outcome: MatchOutcome,
    delta: MatchDelta,
  ): Result<HeadToHead> => {
    const currentViewer = viewerId();
    if (currentViewer === NO_VIEWER) return err(new Error(NO_VIEWER_YET));
    try {
      const attempt = recordMatchResult(db, currentViewer, opponentId, outcome, delta);
      return attempt.recorded
        ? ok(toHeadToHead(attempt.row))
        : err(new Error(REFUSAL_MESSAGE[attempt.refusal]));
    } catch (cause) {
      return err(toError(cause));
    }
  };

  /**
   * Everything that can be wrong with a draft before it is written, as one nullable
   * rejection. `exceptId` is the row being edited, so saving a player without renaming
   * them is not a collision with themselves.
   */
  const rejectionFor = (draft: PlayerDraft, exceptId?: PlayerId): PlayerDraftRejected | null => {
    const errors = validatePlayerDraft(draft);
    if (!isPlayerDraftValid(errors)) return new PlayerDraftRejected(errors);
    if (isNameTaken(db, draft.name, exceptId)) {
      return new PlayerDraftRejected({
        name: `${normalisePlayerName(draft.name)} is already on the ladder.`,
      });
    }
    return null;
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

    /**
     * Adds a player by hand, offline (ADR-0020).
     *
     * Validation runs here rather than only in the form, because this is the boundary the
     * data actually crosses — a second entry point (a deep link, a future import, Phase 5's
     * sync) must not be able to write a row the form would have refused. The form calls the
     * same `validatePlayerDraft`, so the two cannot drift.
     *
     * The name check is a *query*, not a unique index, on purpose: uniqueness is a rule
     * about what this device lets the user create, and a remote ladder that ships two
     * players with one name is the server's business, not a reason to fail a migration.
     */
    createPlayer: (draft: PlayerDraft): Result<Player> => {
      const rejection = rejectionFor(draft);
      if (rejection !== null) return err(rejection);
      try {
        return ok(toPlayer(insertLocalPlayer(db, newLocalPlayerId(), draft)));
      } catch (cause) {
        return err(toError(cause));
      }
    },

    /** Edits a player this device added. A `REMOTE` row is refused — see `PlayerOrigin`. */
    updatePlayer: (id: PlayerId, draft: PlayerDraft): Result<Player> => {
      const rejection = rejectionFor(draft, id);
      if (rejection !== null) return err(rejection);
      try {
        const row = updateLocalPlayer(db, id, draft);
        return row === null ? err(new Error(NOT_YOURS)) : ok(toPlayer(row));
      } catch (cause) {
        return err(toError(cause));
      }
    },

    /** Removes a player this device added, closing the gap in the ranking behind them. */
    deletePlayer: (id: PlayerId): Result<void> => {
      try {
        return deleteLocalPlayer(db, id) ? ok(undefined) : err(new Error(NOT_YOURS));
      } catch (cause) {
        return err(toError(cause));
      }
    },

    /** Adds one match to your record against a player (ADR-0027). */
    recordMatch: (opponentId: PlayerId, outcome: MatchOutcome): Result<HeadToHead> =>
      moveRecord(opponentId, outcome, 1),

    /**
     * Takes one match back off your record against a player (ADR-0029).
     *
     * The counterpart to `recordMatch` and the undo ADR-0027 shipped without. It is a
     * separate name rather than a signed argument on the one above, because the two are
     * different acts at every call site that has one: the roster only ever adds, and the
     * detail screen's stepper is the only place both are reachable.
     */
    removeMatch: (opponentId: PlayerId, outcome: MatchOutcome): Result<HeadToHead> =>
      moveRecord(opponentId, outcome, -1),

    /** Rows currently in the ladder. A one-off read; the header subscribes instead. */
    playerCount: (): number => playerCountQuery(db).all()[0]?.count ?? 0,

    /**
     * Who "you" are, as far as the stored preferences know. Screens need it as a
     * subscription key: every observer above resolves the viewer at call time, so a sync
     * that discovers a different viewer has to re-key them (ARCHITECTURE.md §9, decision 3).
     *
     * Read it through `useViewerId` rather than calling this in a render — see
     * `subscribeViewerId` below.
     */
    getViewerId: (): PlayerId | null => preferences.getViewerId(),

    /**
     * Declares which player is you (ADR-0022). The second caller of
     * `preferences.setViewerId`; the first is the sync in `write` above.
     *
     * It **selects**, it does not create: the id must already be a row, so "who am I" can
     * never invent a player as a side effect of answering. An unknown id is refused rather
     * than stored, because a viewer id pointing at nothing renders a roster with no hero
     * card and no explanation — the same silent-empty failure ADR-0021 removed elsewhere.
     */
    setViewerId: (id: PlayerId): Result<void> => {
      if (playerQuery(db, id).all().length === 0) return err(new Error(NO_SUCH_PLAYER));
      preferences.setViewerId(id);
      notifyViewerChanged();
      return ok(undefined);
    },

    /** `useSyncExternalStore`'s half of the pair. Returns the unsubscribe. */
    subscribeViewerId: (listener: () => void): (() => void) => {
      viewerListeners.add(listener);
      return () => {
        viewerListeners.delete(listener);
      };
    },

    /** Null before the first sync; the header renders no season label rather than a wrong one. */
    getSeason: (): number | null => preferences.getSeason(),

    getShortUnit: (): ShortUnit => preferences.getShortUnit(),
    setShortUnit: (unit: ShortUnit): void => preferences.setShortUnit(unit),
    getRosterSort: (): RosterSort => preferences.getRosterSort(),
    setRosterSort: (sort: RosterSort): void => preferences.setRosterSort(sort),
  };
};

export type RosterRepository = ReturnType<typeof createRosterRepository>;
