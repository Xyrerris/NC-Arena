/**
 * The Kotlin proposal's ViewModel, as a hook (ARCHITECTURE.md §8). The contract is the
 * same one: a screen consumes exactly one `useRoster()` and gets back `{ state, onEvent }`.
 *
 * What it does *not* do is as much the point. It never touches SQLite, never sees a Drizzle
 * row and never calls the network — it reads observers off the repository and maps them to
 * `*Ui` types.
 *
 * **The sync is a TanStack mutation, and nothing here reads its data** (ARCHITECTURE.md §7).
 * That is the rule §7 calls "most likely to be violated by habit": the reflex is to render
 * what the mutation returned, and doing so would put the network back in front of a
 * component and reintroduce the "is this stale?" branching offline-first exists to delete.
 * `syncRoster` returns `Promise<Result<void>>` — there is no data to read even by accident —
 * and what the screen re-renders from is `useLiveQuery` over the rows the sync wrote. The
 * mutation owns only the *lifecycle*: is one in flight, and did the last one fail.
 */

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { nextChangeIn } from '@/core/common';
import { useArenaData, useViewerId } from '@/core/data';
import type { RosterSort } from '@/core/model';
import {
  seasonLabel,
  updatedLabel,
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

  /**
   * One sync — push what this device has, then apply what comes back (ADR-0035; the owner's
   * decision 1). It is `syncRoster`, not `refresh`: a pull alone would replace the ladder
   * with a snapshot that does not describe the rows typed in here, which is the bootstrap
   * ADR-0035 replaced rather than a design. With no sink configured `syncRoster` falls back
   * to a plain pull by itself, so a build with no backend behaves exactly as it did.
   *
   * The mutation is what ARCHITECTURE.md §7 asks for by name: it owns "retry, backoff, is a
   * refresh in flight". Two of those are visible here — `isPending` replaces a hand-rolled
   * boolean, and the unmount bookkeeping that boolean needed is gone, because React Query
   * does not deliver a result to an observer that has gone away.
   *
   * **`retry` is 0, deliberately, and this is the place that decision lives.** This sync is
   * a gesture: somebody pulled the list down and is watching it. Retrying behind a spinner
   * makes a failure take longer to report without making it likelier to succeed, and the
   * remedy — pull again — is already in the user's hands. The periodic background task is
   * the caller that has nobody watching and should turn this up; `POST /v1/roster/sync` is
   * idempotent (a63c4bd), which is what will make that safe when it does.
   */
  const sync = useMutation<void, Error>({
    mutationFn: async () => {
      const result = await repository.syncRoster();
      // Two failure conventions meet here, and only here. `Result` is what this codebase
      // uses for a failure the product has a screen for; a rejected promise is what React
      // Query understands. Nothing else would set `error`, so the unwrap has to throw.
      if (!result.ok) throw result.error;
    },
    retry: 0,
  });

  // Stable across renders (React Query binds both), but named as dependencies anyway so the
  // handlers below do not have to be re-read to know what they close over.
  const { mutate: startSync, reset: clearSyncError } = sync;

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
          // A new search clears a stale sync failure too; otherwise the error state
          // outlives the query that caused it and the roster looks permanently broken.
          clearSyncError();
          return;
        case 'sort':
          setSort(event.sort);
          // Persisted here rather than in the screen: ROADMAP.md Phase 3 requires the sort
          // to survive a restart, and a preference written from a press handler is a
          // preference that is missed the one time the handler is bypassed.
          repository.setRosterSort(event.sort);
          return;
        case 'refresh':
          startSync();
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
    [clearSyncError, repository, startSync],
  );

  /**
   * Only the *reads* can break this screen. A query that cannot run means there is no
   * ladder to show and the error state is the honest answer; a sync that failed means the
   * ladder on screen is older than the user hoped, which is a line above it rather than a
   * reason to take it away (the owner's decision 2). That distinction is the whole of this
   * item, and putting `sync.error` back in here is how it would be undone.
   */
  const failure = roster.error ?? viewer.error;

  const season = repository.getSeason();
  const lastSyncedAt = repository.getLastSyncedAt();

  /**
   * The clock the staleness label is rendered against.
   *
   * It is state with a self-rescheduling timer rather than a fixed interval, because
   * `nextChangeIn` knows exactly when the label could next read differently: within the
   * minute while it counts minutes, within the day once it counts days. A 30-second
   * interval would wake React ~2 900 times a day to re-render the string "3 d ago".
   *
   * The timeout is scheduled against a **fresh** `Date.now()`, not against `now`. After a
   * long stretch with no label to tick — a device that has never synced — `now` is as old
   * as this screen, and scheduling from it would put the first tick an hour late.
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastSyncedAt === null) return;
    const id = setTimeout(() => setNow(Date.now()), nextChangeIn(lastSyncedAt, Date.now()));
    return () => clearTimeout(id);
  }, [lastSyncedAt, now]);

  const header: RosterHeaderUi = useMemo(
    () => ({
      seasonLabel: seasonLabel(season),
      viewer: viewerUi,
      totalPlayers: rosterSize.data,
      sort,
      lastSyncedLabel: updatedLabel(lastSyncedAt, now),
      isSyncing: sync.isPending,
    }),
    [season, viewerUi, rosterSize.data, sort, lastSyncedAt, now, sync.isPending],
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
    const syncError = sync.error?.message ?? null;
    if (rows.length === 0) return { kind: 'empty', query, header, syncError };
    return {
      kind: 'ready',
      header,
      rows,
      query,
      recordError: recordError?.message ?? null,
      syncError,
    };
  }, [failure, roster.loaded, viewer.loaded, rows, query, header, sync.error, recordError]);

  return { state, onEvent };
};
