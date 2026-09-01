/**
 * The Kotlin proposal's ViewModel, as a hook (ARCHITECTURE.md §8). The contract is the
 * same one: a screen consumes exactly one `useRoster()` and gets back `{ state, onEvent }`.
 *
 * What it does *not* do is as much the point. It never touches SQLite, never sees a Drizzle
 * row and never calls the network — it reads observers off the repository and maps them to
 * `*Ui` types. Phase 5 swaps the source behind those observers, and if this file has to
 * change then the boundary was in the wrong place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useArenaData, useViewerId } from '@/core/data';
import type { RosterSort } from '@/core/model';
import {
  seasonLabel,
  toRosterRowUi,
  toViewerCardUi,
  type RosterEvent,
  type RosterHeaderUi,
  type RosterUiState,
} from './rosterUiState';

export interface RosterController {
  state: RosterUiState;
  onEvent: (event: RosterEvent) => void;
}

export const useRoster = (): RosterController => {
  const { repository, useLiveData } = useArenaData();

  // Read synchronously, not in an effect. MMKV is a sync store precisely so the first
  // roster query can run with the persisted sort already applied (core/prefs/types.ts);
  // an async read here would show one frame of rank order before reordering itself.
  const [sort, setSort] = useState<RosterSort>(() => repository.getRosterSort());
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<Error | null>(null);
  const [recordError, setRecordError] = useState<Error | null>(null);

  /**
   * Bumped by every recorded match, and a dependency of the roster observer below.
   *
   * `useLiveQuery` subscribes to the table its select is *from*, so a write to
   * `head_to_head` does not re-run a query that selects from `players` — the limitation
   * `core/data/expoLiveData.ts` states and this is the first feature to hit it. Re-keying
   * the observer re-runs the query, which is the same mechanism a changed sort already
   * uses. It is a counter rather than a boolean so two swipes in a row are two updates.
   */
  const [recorded, setRecorded] = useState(0);

  // Every observer resolves the viewer at call time, so the id is part of each
  // subscription's identity rather than an input to it. It is *subscribed* rather than read
  // because the user can now change it from a screen pushed over this one (ADR-0022), and
  // this screen would otherwise have nothing to re-render for.
  const viewerId = useViewerId();

  const roster = useLiveData(repository.observeRoster(sort, query), [
    sort,
    query,
    viewerId,
    recorded,
  ]);
  const viewer = useLiveData(repository.observeViewer(), [viewerId]);
  const rosterSize = useLiveData(repository.observeRosterSize(), []);

  // Whether an avatar exists at all, which is what decides if a row may be swiped. It is
  // only an answer once the query behind it has run: until then `data` is null for the same
  // reason it is null when nobody has chosen one, and a row cannot tell those apart. The
  // `loaded` gate below is what keeps that ambiguity off the screen.
  const hasViewer = viewer.data !== null;
  const rows = useMemo(
    () => roster.data.map((entry) => toRosterRowUi(entry, hasViewer)),
    [roster.data, hasViewer],
  );
  const viewerUi = useMemo(
    () => (viewer.data === null ? null : toViewerCardUi(viewer.data)),
    [viewer.data],
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    void repository.refresh().then((result) => {
      if (!mounted.current) return;
      setRefreshError(result.ok ? null : result.error);
      setIsRefreshing(false);
    });
  }, [repository]);

  const onEvent = useCallback(
    (event: RosterEvent) => {
      // A record failure names one row. Anything that changes which rows are on screen — a
      // new search, a new sort, a refresh — can take that row away, so the message goes
      // with it rather than outliving the list it described. Stated once, over every event
      // that is not itself a record, so a fourth event cannot forget it.
      if (event.type !== 'record') setRecordError(null);

      switch (event.type) {
        case 'search':
          setQuery(event.query);
          // A new search clears a stale refresh failure too; otherwise the error state
          // outlives the query that caused it and the roster looks permanently broken.
          setRefreshError(null);
          return;
        case 'sort':
          setSort(event.sort);
          // Persisted here rather than in the screen: ROADMAP.md Phase 3 requires the sort
          // to survive a restart, and a preference written from a press handler is a
          // preference that is missed the one time the handler is bypassed.
          repository.setRosterSort(event.sort);
          return;
        case 'refresh':
          refresh();
          return;
        case 'record': {
          const result = repository.recordMatch(event.id, event.outcome);
          setRecordError(result.ok ? null : result.error);
          // Only on success, so a refused swipe does not re-run the query it changed
          // nothing in — and so the failure line is not immediately re-rendered away.
          if (result.ok) setRecorded((count) => count + 1);
          return;
        }
      }
    },
    [refresh, repository],
  );

  const failure = roster.error ?? viewer.error ?? refreshError;

  const season = repository.getSeason();

  const header: RosterHeaderUi = useMemo(
    () => ({
      seasonLabel: seasonLabel(season),
      viewer: viewerUi,
      totalPlayers: rosterSize.data,
      sort,
    }),
    [season, viewerUi, rosterSize.data, sort],
  );

  const state: RosterUiState = useMemo(() => {
    if (failure !== null) {
      return { kind: 'error', message: failure.message, canRetry: true };
    }
    // Both queries, not just the roster's. They are independent subscriptions, so the rows
    // can arrive first — and rows rendered before the viewer is known are rows that offer
    // no swipe, then grow one a frame later. Waiting for both trades a flicker of wrong
    // affordances for a slightly longer spinner.
    if (!roster.loaded || !viewer.loaded) return { kind: 'loading' };
    if (rows.length === 0) return { kind: 'empty', query, header };
    return {
      kind: 'ready',
      header,
      rows,
      query,
      isRefreshing,
      recordError: recordError?.message ?? null,
    };
  }, [failure, roster.loaded, viewer.loaded, rows, query, header, isRefreshing, recordError]);

  return { state, onEvent };
};
