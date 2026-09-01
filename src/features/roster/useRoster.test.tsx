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

import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { err, ok, type RosterSnapshot, type RosterSource } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId, type HeadToHead, type Player } from '@/core/model';
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

const wrapperFor = (repository: RosterRepository, useLiveData = createStubLiveData()) =>
  function Harness({ children }: { children: ReactNode }) {
    return <ArenaDataProvider value={{ repository, useLiveData }}>{children}</ArenaDataProvider>;
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

    it('surfaces a failed refresh, and clears it when the search changes', async () => {
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
        expect(result.current.state).toMatchObject({ kind: 'error', message: 'airplane mode' }),
      );

      // A stale failure must not outlive the query that caused it, or the roster looks
      // permanently broken to anyone who types.
      await act(async () => {
        result.current.onEvent({ type: 'search', query: 'a' });
      });
      expect(result.current.state).toMatchObject({ kind: 'ready' });
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
      await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'error' }));

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'ready' }));
      expect(attempts).toBe(2);
    });
  });
});
