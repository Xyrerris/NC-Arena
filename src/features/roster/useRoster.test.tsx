/**
 * The roster's state machine, over a real `better-sqlite3` database.
 *
 * **Ordering is asserted here rather than in `RosterScreen.test.tsx`, on purpose.**
 * `FlashList` does not re-order in the jest environment: with no layout to measure, its
 * recycler keeps the window it built on the first commit, so a pure re-order of the same
 * keys is invisible to the renderer even though the data changed. A test that pressed a
 * chip and read the rendered rows would therefore assert FlashList's test-environment
 * behaviour, not the sort. The sort is a data concern, so it is proven where the data is,
 * and the rendered order is left to the Maestro gate that looks at pixels
 * (ARCHITECTURE.md §10).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  err,
  ok,
  type RosterPush,
  type RosterSink,
  type RosterSnapshot,
  type RosterSource,
} from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId, type HeadToHead, type Player, type PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type ArenaPreferences,
  type TestDatabase,
  type TestRepository,
} from '@/core/testing';

import type { RosterUiState } from './rosterUiState';
import { useRoster, type RosterController } from './useRoster';

const player = (id: string, name: string, rank: number, combatPower: number): Player => ({
  id: asPlayerId(id),
  name,
  level: 100 + rank,
  gameCode: `a${rank}`,
  rank,
  combatPower,
  score: 1000 - rank,
  hp: 5_000_000 + rank,
  atk: 1_000_000 + rank,
  def: 2_000_000 + rank,
  critBp: 500_000 + rank,
  hit: 3_000_000 + rank,
  spd: 4_000_000 + rank,
});

/** A row typed in on this device, so it starts `LOCAL` and has somewhere to be pushed to. */
const draftFor = (name: string): PlayerDraft => ({
  name,
  level: 12,
  gameCode: '',
  combatPower: 500_000,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const record = (opponentId: string, wins: number, losses: number): HeadToHead => ({
  viewerId: asPlayerId('p-a'),
  opponentId: asPlayerId(opponentId),
  wins,
  losses,
});

/** Rank, combat power and wins deliberately disagree, so each sort has to earn its test. */
const FIXTURE: RosterSnapshot = {
  season: 41,
  viewerId: asPlayerId('p-a'),
  players: [
    player('p-a', 'Aurel', 1, 1_000_000),
    player('p-b', 'Brann', 2, 4_000_000),
    player('p-c', 'Cinder', 3, 2_000_000),
    player('p-d', 'Dross', 4, 3_000_000),
  ],
  headToHead: [record('p-b', 5, 1), record('p-c', 9, 0)],
};

const sourceOf = (snapshot: RosterSnapshot): RosterSource => ({
  name: 'fixture',
  fetchRoster: async () => ok(snapshot),
});

/**
 * A fresh `QueryClient` per harness, built outside the component. React Query caches per
 * client, so a shared one would let a mutation started by one test be observed by the next;
 * and a client constructed *inside* `Harness` would be a new client on every render, which
 * silently discards the state the mutation is keeping.
 */
const wrapperFor = (repository: RosterRepository, useLiveData = createStubLiveData()) => {
  const client = new QueryClient();
  return function Harness({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ArenaDataProvider value={{ repository, useLiveData }}>{children}</ArenaDataProvider>
      </QueryClientProvider>
    );
  };
};

const namesOf = (state: RosterUiState): string[] =>
  state.kind === 'ready' ? state.rows.map((row) => row.name) : [];

describe('useRoster', () => {
  let handle: TestDatabase;
  let wired: TestRepository;
  let preferences: ArenaPreferences;
  let repository: RosterRepository;

  beforeEach(async () => {
    handle = createTestDatabase();
    wired = createTestRepository(handle.db, sourceOf(FIXTURE));
    preferences = wired.preferences;
    repository = wired.repository;
    expect((await repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    // Unmount before the database goes away: auto-cleanup runs in an outer afterEach —
    // after this one — and a hook still mounted over a closed handle throws on its next
    // render, which surfaces as an unrelated test failing later in the file.
    await cleanup();
    handle.close();
  });

  const mount = () => renderHook(() => useRoster(), { wrapper: wrapperFor(repository) });

  describe('sorting', () => {
    it('starts on the persisted sort, read synchronously', async () => {
      preferences.setRosterSort('MY_WINS');
      const { result } = await mount();
      // No intermediate rank-ordered frame: MMKV is synchronous precisely so the first
      // query can run with the stored sort already applied.
      expect(namesOf(result.current.state)).toEqual(['Cinder', 'Brann', 'Aurel', 'Dross']);
    });

    it('orders by absolute season rank', async () => {
      const { result } = await mount();
      expect(namesOf(result.current.state)).toEqual(['Aurel', 'Brann', 'Cinder', 'Dross']);
    });

    it('orders by combat power, descending', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'COMBAT_POWER' });
      });
      expect(namesOf(result.current.state)).toEqual(['Brann', 'Dross', 'Cinder', 'Aurel']);
    });

    it('orders by my wins, with never-fought players last', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'MY_WINS' });
      });
      // Aurel is the viewer and Dross was never fought; both have NULL wins, so they fall
      // to the end and are broken apart by rank.
      expect(namesOf(result.current.state)).toEqual(['Cinder', 'Brann', 'Aurel', 'Dross']);
    });

    it('persists the choice, so it survives a restart', async () => {
      const { result, unmount } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'COMBAT_POWER' });
      });
      await unmount();
      expect(preferences.getRosterSort()).toBe('COMBAT_POWER');

      // A restart is a fresh repository over the same stored preferences and database.
      const restarted = wired.restart();
      const second = await renderHook(() => useRoster(), { wrapper: wrapperFor(restarted) });
      expect(second.result.current.state).toMatchObject({ kind: 'ready' });
      expect(namesOf(second.result.current.state)).toEqual(['Brann', 'Dross', 'Cinder', 'Aurel']);
    });

    it('reports the active sort in the header, for the chips to read', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'MY_WINS' });
      });
      expect(result.current.state).toMatchObject({ header: { sort: 'MY_WINS' } });
    });
  });

  describe('search', () => {
    it('narrows the rows without touching the count', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'n' });
      });
      expect(namesOf(result.current.state)).toEqual(['Brann', 'Cinder']);
      expect(result.current.state).toMatchObject({ header: { totalPlayers: 4 } });
    });

    it('goes to the empty state rather than an empty ready state', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'zzz' });
      });
      expect(result.current.state).toMatchObject({ kind: 'empty', query: 'zzz' });
    });

    it('labels the season from the synced data, never from a constant', async () => {
      const { result } = await mount();
      expect(result.current.state).toMatchObject({ header: { seasonLabel: 'SEASON 41' } });
    });

    it('keeps the header on the empty state', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'zzz' });
      });
      expect(result.current.state).toMatchObject({
        kind: 'empty',
        header: { totalPlayers: 4, sort: 'RANK', viewer: { name: 'Aurel' } },
      });
    });

    it('survives a sort change while filtered', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'n' });
      });
      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'COMBAT_POWER' });
      });
      expect(namesOf(result.current.state)).toEqual(['Brann', 'Cinder']);
    });
  });

  describe('the viewer', () => {
    it('formats the hero card once, in the state rather than the component', async () => {
      const { result } = await mount();
      expect(result.current.state).toMatchObject({
        header: {
          viewer: {
            name: 'Aurel',
            rank: 1,
            combatPowerExact: '1.000.000',
            combatPowerShort: '1,00 M',
          },
        },
      });
    });

    it('renders the roster with no viewer at all before the first sync', async () => {
      const blankDb = createTestDatabase();
      const blank = createTestRepository(blankDb.db, sourceOf(FIXTURE)).repository;
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(blank) });
      // No rows, no viewer and no season is the empty state — not a crash, and not a
      // spinner that never resolves.
      expect(result.current.state).toMatchObject({
        kind: 'empty',
        header: { viewer: null, seasonLabel: null },
      });
      blankDb.close();
    });

    it('leaves the viewer row without a record against themselves', async () => {
      const { result } = await mount();
      const state = result.current.state;
      const rows = state.kind === 'ready' ? state.rows : [];
      expect(rows.find((row) => row.isViewer)).toMatchObject({ name: 'Aurel', record: null });
      expect(rows.find((row) => row.name === 'Brann')).toMatchObject({
        record: { wins: 5, losses: 1 },
      });
    });
  });

  /**
   * A refused swipe leaves a line above the ladder. It names one row, so it must not
   * survive anything that changes which rows are on screen — the failure mode is a roster
   * that looks stuck, complaining about a player the list no longer shows.
   */
  describe('a refused record', () => {
    const refuse = async (result: { current: RosterController }) => {
      await act(async () => {
        result.current.onEvent({ type: 'record', id: asPlayerId('p-a'), outcome: 'WIN' });
      });
      // p-a is the viewer, so this is the one refusal reachable by pressing a real control.
      expect(result.current.state).toMatchObject({
        recordError: 'You have no record against yourself.',
      });
    };

    it('is cleared by a new sort', async () => {
      const { result } = await mount();
      await refuse(result);

      await act(async () => {
        result.current.onEvent({ type: 'sort', sort: 'MY_WINS' });
      });

      expect(result.current.state).toMatchObject({ recordError: null });
    });

    it('is cleared by a refresh', async () => {
      const { result } = await mount();
      await refuse(result);

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() => expect(result.current.state).toMatchObject({ recordError: null }));
    });

    it('is cleared by a new search', async () => {
      const { result } = await mount();
      await refuse(result);

      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'br' });
      });

      expect(result.current.state).toMatchObject({ recordError: null });
    });

    it('survives a second refusal, rather than blinking off and on', async () => {
      const { result } = await mount();
      await refuse(result);
      await refuse(result);

      expect(result.current.state).toMatchObject({
        recordError: 'You have no record against yourself.',
      });
    });
  });

  describe('the states the prototype does not have', () => {
    it('is loading until the first read comes back', async () => {
      const { result } = await renderHook(() => useRoster(), {
        wrapper: wrapperFor(repository, createStubLiveData({ loaded: false })),
      });
      expect(result.current.state).toEqual({ kind: 'loading' });
    });

    it('surfaces a query failure as a retryable error', async () => {
      const { result } = await renderHook(() => useRoster(), {
        wrapper: wrapperFor(repository, createStubLiveData({ error: new Error('no ladder') })),
      });
      expect(result.current.state).toEqual({
        kind: 'error',
        message: 'no ladder',
        canRetry: true,
      });
    });

    it('keeps the ladder on screen when a sync fails, and says so above it', async () => {
      // The owner's decision 2. Airplane mode is exactly when somebody needs to read the
      // rows they already have, so a failed sync is a line above them, never the `error`
      // state that replaces them.
      const failing: RosterSource = {
        name: 'failing',
        fetchRoster: async () => err(new Error('airplane mode')),
      };
      const repo = wired.restart(failing);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() =>
        expect(result.current.state).toMatchObject({
          kind: 'ready',
          syncError: 'airplane mode',
        }),
      );
      expect(namesOf(result.current.state)).toEqual(['Aurel', 'Brann', 'Cinder', 'Dross']);
    });

    it('clears a stale sync failure when the search changes', async () => {
      const failing: RosterSource = {
        name: 'failing',
        fetchRoster: async () => err(new Error('airplane mode')),
      };
      const repo = wired.restart(failing);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      await waitFor(() =>
        expect(result.current.state).toMatchObject({ syncError: 'airplane mode' }),
      );

      // A stale failure must not outlive the query that caused it, or the roster looks
      // permanently broken to anyone who types.
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'a' });
      });
      expect(result.current.state).toMatchObject({ kind: 'ready', syncError: null });
    });

    it('recovers when a retry succeeds', async () => {
      let attempts = 0;
      const flaky: RosterSource = {
        name: 'flaky',
        fetchRoster: async () => {
          attempts += 1;
          return attempts === 1 ? err(new Error('airplane mode')) : ok(FIXTURE);
        },
      };
      const repo = wired.restart(flaky);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      await waitFor(() =>
        expect(result.current.state).toMatchObject({ syncError: 'airplane mode' }),
      );

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      await waitFor(() => expect(result.current.state).toMatchObject({ syncError: null }));
      expect(attempts).toBe(2);
    });
  });

  /**
   * The owner's decision 1: a sync is push-then-pull as one operation, fired by this
   * gesture and by the periodic task — not by every local write. Before this, pull-to-
   * refresh called `refresh()` and a row typed in here never left the device.
   */
  describe('pull-to-refresh is a sync, not a pull', () => {
    /** Records what was pushed, and answers the way a fresh account's server does. */
    const createSpySink = () => {
      const pushes: RosterPush[] = [];
      const sink: RosterSink = {
        name: 'spy',
        pushRoster: (push: RosterPush) => {
          pushes.push(push);
          return Promise.resolve(ok({ snapshot: null, assignedIds: new Map() }));
        },
        setViewer: () => Promise.resolve(ok(undefined)),
      };
      return { pushes, sink };
    };

    const withSink = (sink: RosterSink, source: RosterSource = sourceOf(FIXTURE)) =>
      createTestRepository(handle.db, source, undefined, sink).repository;

    it('pushes what this device has before pulling', async () => {
      const spy = createSpySink();
      const repo = withSink(spy.sink);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() => expect(spy.pushes).toHaveLength(1));
    });

    it('carries a hand-entered row up, which a plain pull never did', async () => {
      const spy = createSpySink();
      const repo = withSink(spy.sink);
      expect(repo.createPlayer(draftFor('Ekko')).ok).toBe(true);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() => expect(spy.pushes).toHaveLength(1));
      expect(spy.pushes[0]?.newPlayers.map((row) => row.name)).toEqual(['Ekko']);
    });

    it('surfaces a failed push the same way a failed pull is surfaced', async () => {
      // The push half can fail on its own — offline, or a key the server no longer knows —
      // and it must reach the same recoverable banner rather than a crash or a blank list.
      const refusing: RosterSink = {
        name: 'refusing',
        pushRoster: () => Promise.resolve(err(new Error('backend: OFFLINE — no network'))),
        setViewer: () => Promise.resolve(ok(undefined)),
      };
      const repo = withSink(refusing);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() =>
        expect(result.current.state).toMatchObject({
          kind: 'ready',
          syncError: 'backend: OFFLINE — no network',
        }),
      );
    });

    it('reports a sync in flight, and stops reporting one when it lands', async () => {
      // `header.isSyncing` is the mutation's `isPending`, and it drives both the
      // pull-to-refresh spinner and the badge. The roster stays on screen throughout —
      // decision 2 — so this is a spinner on a list, never a blank screen.
      let land = (): void => {};
      const held = new Promise<void>((resolve) => {
        land = resolve;
      });
      const slow: RosterSink = {
        name: 'slow',
        pushRoster: async () => {
          await held;
          return ok({ snapshot: null, assignedIds: new Map() });
        },
        setViewer: () => Promise.resolve(ok(undefined)),
      };
      const repo = withSink(slow);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      // Both halves inside an async `act`: a synchronous one around a handler that starts a
      // promise lets that promise settle outside any act scope, which corrupts the renderer
      // for the rest of the file rather than failing the test that caused it.
      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      // `waitFor` for the reason the screen test gives: React Query's notifications are
      // batched through a scheduler, so this is not settled when the act scope returns.
      await waitFor(() =>
        expect(result.current.state).toMatchObject({
          kind: 'ready',
          header: { isSyncing: true },
        }),
      );

      await act(async () => {
        land();
        await held;
      });

      await waitFor(() =>
        expect(result.current.state).toMatchObject({ header: { isSyncing: false } }),
      );
    });

    it('falls back to a plain pull when there is no sink, so a backendless build is unchanged', async () => {
      let pulls = 0;
      const counting: RosterSource = {
        name: 'counting',
        fetchRoster: async () => {
          pulls += 1;
          return ok(FIXTURE);
        },
      };
      const repo = wired.restart(counting);
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() => expect(pulls).toBe(1));
      expect(result.current.state).toMatchObject({ kind: 'ready' });
    });
  });

  /**
   * ROADMAP.md Phase 5's staleness policy, at the seam where it becomes a string. The
   * arithmetic itself is proven in `core/common/relativeTime.test.ts`; what is asserted
   * here is that the roster asks the right question and renders nothing when it cannot
   * answer.
   */
  describe('how old the ladder is', () => {
    it('says how long ago the last sync landed', async () => {
      // `beforeEach` refreshed, so the stamp is moments old.
      const { result } = await mount();

      expect(result.current.state).toMatchObject({
        header: { lastSyncedLabel: 'Updated just now' },
      });
    });

    it('renders no staleness label when nothing has synced on this device', async () => {
      // Fresh preferences over rows that are already there — which is exactly what a
      // restore from a file leaves behind (ADR-0033): a full ladder no sync produced.
      // Rendering nothing beats dating it by a sync that did not happen.
      const repo = createTestRepository(handle.db).repository;
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      expect(result.current.state).toMatchObject({ header: { lastSyncedLabel: null } });
      expect(namesOf(result.current.state)).toHaveLength(4);
    });

    it('is not syncing when nothing is in flight', async () => {
      const { result } = await mount();

      expect(result.current.state).toMatchObject({ header: { isSyncing: false } });
    });

    it('keeps the staleness label through a failed sync, because it is still true', async () => {
      // The ladder did not move, so how old it is did not change. Blanking the label on a
      // failure would lose the one fact the user most needs when the server is unreachable.
      const failing: RosterSource = {
        name: 'failing',
        fetchRoster: async () => err(new Error('airplane mode')),
      };
      const { repository: repo, preferences: prefs } = createTestRepository(handle.db, failing);
      prefs.setLastSyncedAt(Date.now());
      const { result } = await renderHook(() => useRoster(), { wrapper: wrapperFor(repo) });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });

      await waitFor(() =>
        expect(result.current.state).toMatchObject({
          syncError: 'airplane mode',
          header: { lastSyncedLabel: 'Updated just now' },
        }),
      );
    });
  });
});
