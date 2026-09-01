/**
 * ROADMAP.md Phase 4's four behavioural exit criteria, over a real `better-sqlite3`
 * database: the delta's direction, what an exact tie counts as, a zero-match opponent, and
 * a deep link to an id that does not exist.
 *
 * The numbers below are the prototype's own — Krios against Valkros — so the expected
 * strings can be read straight out of `design/Arena Scout.dc.html` rather than derived from
 * the implementation being tested.
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
  type TestDatabase,
  type TestRepository,
} from '@/core/testing';

import type { PlayerDetailEvent, PlayerDetailUiState } from './playerDetailUiState';
import { usePlayerDetail } from './usePlayerDetail';

const KRIOS = asPlayerId('plr_viewer');
const VALKROS = asPlayerId('plr_top');
const TWIN = asPlayerId('plr_twin');

/** The prototype's viewer, values unchanged, with CRIT scaled to basis points. */
const viewer: Player = {
  id: KRIOS,
  name: 'Krios',
  level: 402,
  gameCode: 'k77x',
  rank: 3,
  combatPower: 2_145_880,
  score: 1842,
  hp: 980_112_004,
  atk: 1_184_530_912,
  def: 902_114_887,
  critBp: 584_127,
  hit: 1_421_009_663,
  spd: 1_108_422_510,
};

/** The prototype's rank-1 player. Stronger than the viewer on every stat. */
const opponent: Player = {
  id: VALKROS,
  name: 'Valkros',
  level: 488,
  gameCode: 'a984',
  rank: 1,
  combatPower: 3_084_221,
  score: 2415,
  hp: 1_440_085_258,
  atk: 2_418_904_113,
  def: 1_554_320_778,
  critBp: 712_043,
  hit: 2_210_884_019,
  spd: 1_902_551_440,
};

/** Identical to the viewer on every stat — the tie case, which has its own rule. */
const twin: Player = { ...viewer, id: TWIN, name: 'Mirror', rank: 2 };

const record = (opponentId: string, wins: number, losses: number): HeadToHead => ({
  viewerId: KRIOS,
  opponentId: asPlayerId(opponentId),
  wins,
  losses,
});

const FIXTURE: RosterSnapshot = {
  season: 41,
  viewerId: KRIOS,
  players: [opponent, twin, viewer],
  // Valkros has a record; the twin has none at all, which is the never-fought case.
  headToHead: [record(VALKROS, 1, 6)],
};

const sourceOf = (snapshot: RosterSnapshot): RosterSource => ({
  name: 'fixture',
  fetchRoster: async () => ok(snapshot),
});

const wrapperFor = (repository: RosterRepository, useLiveData = createStubLiveData()) =>
  function Harness({ children }: { children: ReactNode }) {
    return <ArenaDataProvider value={{ repository, useLiveData }}>{children}</ArenaDataProvider>;
  };

const versusOf = (state: PlayerDetailUiState) => (state.kind === 'ready' ? state.versus : null);

const rowOf = (state: PlayerDetailUiState, key: string) =>
  versusOf(state)?.rows.find((row) => row.key === key);

const statOf = (state: PlayerDetailUiState, key: string) =>
  state.kind === 'ready' ? state.stats.find((stat) => stat.key === key) : undefined;

describe('usePlayerDetail', () => {
  let handle: TestDatabase;
  let wired: TestRepository;
  let repository: RosterRepository;

  beforeEach(async () => {
    handle = createTestDatabase();
    wired = createTestRepository(handle.db, sourceOf(FIXTURE));
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

  const mount = (id = VALKROS) =>
    renderHook(() => usePlayerDetail(id), { wrapper: wrapperFor(repository) });

  describe('the stat book', () => {
    it('shows every stat twice, exact and rounded', async () => {
      const { result } = await mount();
      expect(statOf(result.current.state, 'ATK')).toMatchObject({
        exact: '2.418.904.113',
        short: '2,42 B',
      });
      expect(statOf(result.current.state, 'SPD')).toMatchObject({
        exact: '1.902.551.440',
        short: '1,90 B',
      });
    });

    it('renders CRIT from basis points, with no float drift', async () => {
      const { result } = await mount();
      // 712043 basis points is 71,2043 %. Rendered from the integer, so the four decimals
      // are the stored value rather than whatever a double happened to hold.
      expect(statOf(result.current.state, 'CRIT')).toMatchObject({
        exact: '71,2043 %',
        short: '71,2%',
      });
    });

    it('lists the six stats in the prototype order, HP first', async () => {
      const { result } = await mount();
      const state = result.current.state;
      const keys = state.kind === 'ready' ? state.stats.map((stat) => stat.key) : [];
      // HP joined the front in ADR-0023, which is where the game's own panel puts it.
      expect(keys).toEqual(['HP', 'ATK', 'DEF', 'CRIT', 'HIT', 'SPD']);
    });

    it('shows the header with combat power in both representations', async () => {
      const { result } = await mount();
      expect(result.current.state).toMatchObject({
        header: {
          name: 'Valkros',
          rankLabel: 'RANK #01',
          combatPowerExact: '3.084.221',
          combatPowerShort: '3,08 M',
        },
      });
    });
  });

  describe('the delta', () => {
    it('is measured from your value, so a positive delta means they are stronger', async () => {
      const { result } = await mount();
      // (2.418.904.113 - 1.184.530.912) / 1.184.530.912 = +104,2%. The prototype's own
      // number, and the direction ROADMAP.md Phase 4 flags as reading backwards at a glance.
      expect(rowOf(result.current.state, 'ATK')).toMatchObject({
        delta: '+104,2%',
        opponentAhead: true,
      });
    });

    it('renders the opponent-ahead direction consistently across every stat', async () => {
      const { result } = await mount();
      const rows = versusOf(result.current.state)?.rows ?? [];
      expect(rows).toHaveLength(6);
      expect(rows.every((row) => row.opponentAhead)).toBe(true);
      expect(rows.every((row) => row.delta.startsWith('+'))).toBe(true);
    });

    it('scales both bars against the larger of the two values', async () => {
      const { result } = await mount();
      const atk = rowOf(result.current.state, 'ATK');
      expect(atk?.theirs.fraction).toBe(1);
      expect(atk?.mine.fraction).toBeCloseTo(1_184_530_912 / 2_418_904_113, 10);
    });
  });

  describe('ties', () => {
    it('counts an exact tie as YOUR lead, as the prototype does', async () => {
      const { result } = await mount(TWIN);
      const rows = versusOf(result.current.state)?.rows ?? [];
      expect(rows.every((row) => row.opponentAhead)).toBe(false);
      // Inherited behaviour, kept deliberately (ADR-0019). Changing it should break this
      // line, which is the point of asserting it rather than leaving it implicit.
      expect(versusOf(result.current.state)?.verdict).toBe(
        'you lead in 6 of 6 stats · delta shown from your values',
      );
    });

    it('counts nothing as your lead when they are stronger everywhere', async () => {
      const { result } = await mount();
      expect(versusOf(result.current.state)?.verdict).toBe(
        'you lead in 0 of 6 stats · delta shown from your values',
      );
    });

    it('renders a tie as a zero delta rather than as a missing one', async () => {
      const { result } = await mount(TWIN);
      expect(rowOf(result.current.state, 'ATK')).toMatchObject({ delta: '+0,0%' });
    });
  });

  describe('the head-to-head', () => {
    it('summarises a real record', async () => {
      const { result } = await mount();
      expect(versusOf(result.current.state)?.headToHead).toEqual({
        record: { wins: 1, losses: 6 },
        note: 'you won 1 of 7 matches',
        // Both columns have something to take back, so both minus buttons are live.
        canAdjust: true,
        canRemoveWin: true,
        canRemoveLoss: true,
      });
    });

    it('says "never fought" for an opponent with no matches, and divides nothing', async () => {
      const { result } = await mount(TWIN);
      expect(versusOf(result.current.state)?.headToHead).toEqual({
        record: null,
        note: 'never fought',
        // The stepper is offered — this is where a first match gets recorded — but neither
        // minus has anything to take back yet.
        canAdjust: true,
        canRemoveWin: false,
        canRemoveLoss: false,
      });
      // The comparison rows still render: never having fought someone says nothing about
      // their stats.
      expect(versusOf(result.current.state)?.rows).toHaveLength(6);
    });
  });

  describe('the states a deep link can reach', () => {
    it('renders not-found for an id that is not on the ladder', async () => {
      const { result } = await mount(asPlayerId('plr_does_not_exist'));
      expect(result.current.state).toEqual({
        kind: 'notFound',
        id: 'plr_does_not_exist',
      });
    });

    it('is loading until the first read comes back', async () => {
      const { result } = await renderHook(() => usePlayerDetail(VALKROS), {
        wrapper: wrapperFor(repository, createStubLiveData({ loaded: false })),
      });
      expect(result.current.state).toEqual({ kind: 'loading' });
    });

    it('surfaces a query failure as a retryable error', async () => {
      const { result } = await renderHook(() => usePlayerDetail(VALKROS), {
        wrapper: wrapperFor(repository, createStubLiveData({ error: new Error('no book') })),
      });
      expect(result.current.state).toEqual({
        kind: 'error',
        message: 'no book',
        canRetry: true,
      });
    });

    it('surfaces a failed refresh without losing the screen', async () => {
      const failing: RosterSource = {
        name: 'failing',
        fetchRoster: async () => err(new Error('airplane mode')),
      };
      const repo = wired.restart(failing);
      const { result } = await renderHook(() => usePlayerDetail(VALKROS), {
        wrapper: wrapperFor(repo),
      });

      await act(async () => {
        result.current.onEvent({ type: 'refresh' });
      });
      await waitFor(() =>
        expect(result.current.state).toMatchObject({ kind: 'error', message: 'airplane mode' }),
      );
    });

    it('still shows the stat book when there is no avatar to compare against', async () => {
      const blankDb = createTestDatabase();
      const blank = createTestRepository(blankDb.db, sourceOf(FIXTURE));
      // Seed the roster, then forget who the viewer is — the pre-sync state open decision 3
      // leaves open, and the reason the viewer is LEFT joined rather than inner joined.
      expect((await blank.repository.refresh()).ok).toBe(true);
      blank.preferences.setViewerId(asPlayerId(''));

      const { result } = await renderHook(() => usePlayerDetail(VALKROS), {
        wrapper: wrapperFor(blank.repository),
      });
      expect(result.current.state).toMatchObject({ kind: 'ready', versus: null });
      expect(statOf(result.current.state, 'ATK')).toMatchObject({ exact: '2.418.904.113' });
      blankDb.close();
    });
  });

  /**
   * ADR-0029. The stepper is the only place a match comes back *off* a record, so the −1
   * cases are the ones worth the most here: the roster's swipe already covers +1, and what
   * is new is the floor underneath it.
   */
  describe('stepping the record', () => {
    const h2hOf = (state: PlayerDetailUiState) => versusOf(state)?.headToHead;

    const step = async (
      result: { current: { onEvent: (e: PlayerDetailEvent) => void } },
      outcome: 'WIN' | 'LOSS',
      delta: 1 | -1,
    ) => {
      await act(async () => {
        result.current.onEvent({ type: 'adjustRecord', outcome, delta });
      });
    };

    it('adds a win, and the badge shows it without a reload', async () => {
      const { result } = await mount();
      expect(h2hOf(result.current.state)?.record).toEqual({ wins: 1, losses: 6 });

      await step(result, 'WIN', 1);

      // `observePlayer` selects from `players`, so this only updates because the hook
      // re-keys the observer on every step — the staleness ADR-0027 left for later.
      await waitFor(() =>
        expect(h2hOf(result.current.state)?.record).toEqual({ wins: 2, losses: 6 }),
      );
    });

    it('takes a win back, which is the undo the roster has no room for', async () => {
      const { result } = await mount();

      await step(result, 'WIN', -1);

      await waitFor(() =>
        expect(h2hOf(result.current.state)?.record).toEqual({ wins: 0, losses: 6 }),
      );
    });

    it('closes the minus once the column it empties reaches zero', async () => {
      const { result } = await mount();

      await step(result, 'WIN', -1);

      await waitFor(() => expect(h2hOf(result.current.state)?.canRemoveWin).toBe(false));
      // The other column is untouched and still has six to give back.
      expect(h2hOf(result.current.state)?.canRemoveLoss).toBe(true);
    });

    it('refuses a step below zero and says so, rather than silently clamping', async () => {
      const { result } = await mount();
      await step(result, 'WIN', -1);
      await waitFor(() => expect(h2hOf(result.current.state)?.canRemoveWin).toBe(false));

      // Reachable past the disabled button: two presses racing, or a swipe on the roster
      // underneath. The count must not move, and the screen must not stay silent.
      await step(result, 'WIN', -1);

      expect(result.current.state).toMatchObject({
        recordError: 'There is no match left to take back.',
      });
      expect(h2hOf(result.current.state)?.record).toEqual({ wins: 0, losses: 6 });
    });

    it('retires the failure as soon as the user does anything else', async () => {
      const { result } = await mount();
      await step(result, 'WIN', -1);
      await step(result, 'WIN', -1);
      expect(result.current.state).toMatchObject({ recordError: expect.any(String) });

      await act(async () => {
        result.current.onEvent({ type: 'selectTab', tab: 'VS_YOU' });
      });

      expect(result.current.state).toMatchObject({ recordError: null });
    });

    it('writes a first record for an opponent never fought', async () => {
      const { result } = await mount(TWIN);
      expect(h2hOf(result.current.state)?.record).toBeNull();

      await step(result, 'LOSS', 1);

      await waitFor(() =>
        expect(h2hOf(result.current.state)?.record).toEqual({ wins: 0, losses: 1 }),
      );
    });

    it('offers no stepper on your own page', async () => {
      const { result } = await mount(KRIOS);

      // The tab still renders — it compares you with yourself — but there is no record
      // between one player and themselves to move.
      expect(h2hOf(result.current.state)?.canAdjust).toBe(false);
    });
  });

  describe('the tabs', () => {
    it('opens on the stat book', async () => {
      const { result } = await mount();
      expect(result.current.state).toMatchObject({ tab: 'STATS' });
    });

    it('remembers the chosen tab', async () => {
      const { result } = await mount();
      await act(async () => {
        result.current.onEvent({ type: 'selectTab', tab: 'VS_YOU' });
      });
      expect(result.current.state).toMatchObject({ tab: 'VS_YOU' });
    });
  });
});
