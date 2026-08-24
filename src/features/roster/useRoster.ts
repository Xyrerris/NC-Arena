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

  // Every observer resolves the viewer at call time, so the id is part of each
  // subscription's identity rather than an input to it. It is *subscribed* rather than read
  // because the user can now change it from a screen pushed over this one (ADR-0022), and
  // this screen would otherwise have nothing to re-render for.
  const viewerId = useViewerId();

  const roster = useLiveData(repository.observeRoster(sort, query), [sort, query, viewerId]);
  const viewer = useLiveData(repository.observeViewer(), [viewerId]);
  const rosterSize = useLiveData(repository.observeRosterSize(), []);

  const rows = useMemo(() => roster.data.map(toRosterRowUi), [roster.data]);
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
      switch (event.type) {
        case 'search':
          setQuery(event.query);
          // A new search clears a stale failure; otherwise the error state outlives the
          // query that caused it and the roster looks permanently broken.
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
    if (!roster.loaded) return { kind: 'loading' };
    if (rows.length === 0) return { kind: 'empty', query, header };
    return { kind: 'ready', header, rows, query, isRefreshing };
  }, [failure, roster.loaded, rows, query, header, isRefreshing]);

  return { state, onEvent };
};
