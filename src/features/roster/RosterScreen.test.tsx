/**
 * ROADMAP.md Phase 3 exit criteria, one describe block each: search narrows the list, a
 * non-matching query shows the empty state rather than a blank screen, every sort chip
 * reorders correctly, and the selected sort survives a restart.
 *
 * The screen is rendered over a **real** `better-sqlite3` database rather than a stubbed
 * repository, so the sort and search assertions below are assertions about the SQL that
 * will run on device — not about a JS `filter` that happens to agree with it today
 * (ARCHITECTURE.md §7: sorting and filtering are the database's job).
 *
 * jest-expo runs at fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

import { RosterScreen } from './RosterScreen';
import { SEARCH_DEBOUNCE_MS } from './useDebouncedValue';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const player = (id: string, name: string, rank: number, combatPower: number): Player => ({
  id: asPlayerId(id),
  name,
  rank,
  combatPower,
  score: 1000 - rank,
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

/**
 * Rank, combat power and wins deliberately disagree. A fixture where they agree — the real
 * seed is one — passes the sort tests whether or not the sort does anything.
 */
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

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

/**
 * The device's `useExpoLiveData` is replaced by the direct-`.all()` runner (ADR-0012).
 * That substitution is the whole reason the observers return `{ query, map }`, and it is
 * what lets this file assert on SQL results with no emulator in the loop.
 */
const wrapWith = (repository: RosterRepository, useLiveData = createStubLiveData()) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ArenaDataProvider value={{ repository, useLiveData }}>{children}</ArenaDataProvider>
      </SafeAreaProvider>
    );
  };

const renderRoster = (repository: RosterRepository, useLiveData = createStubLiveData()) =>
  render(<RosterScreen />, { wrapper: wrapWith(repository, useLiveData) });

/** The order the list is actually in, read off the rendered rows. */
const renderedNames = (): string[] =>
  screen.getAllByTestId('roster-row-name').map((node) => String(node.props.children));

const renderedRanks = (): string[] =>
  screen.getAllByTestId('roster-row-rank').map((node) => String(node.props.children));

/**
 * Real timers, deliberately: the debounce is the thing under test in half these cases, and
 * a faked clock turns "did not query yet" into a statement about `advanceTimersByTime`
 * rather than about the component. The cost is 250 ms per search assertion.
 */
const type = async (text: string): Promise<void> => {
  fireEvent.changeText(screen.getByTestId('roster-search'), text);
  // Let the keystroke commit before the next one. Three `changeText` calls with no flush
  // between them open three overlapping act() scopes, and React does not recover from
  // that — the symptom is every later render in the file coming back empty.
  await waitFor(() => expect(screen.getByTestId('roster-search').props.value).toBe(text));
};

const expectNames = (expected: string[]): Promise<void> =>
  waitFor(() => expect(renderedNames()).toEqual(expected));

const pickSort = (sort: string): void => {
  fireEvent.press(screen.getByTestId(`roster-sort-${sort}`));
};

describe('RosterScreen', () => {
  let handle: TestDatabase;
  let wired: TestRepository;
  let preferences: ArenaPreferences;
  let repository: RosterRepository;

  beforeEach(async () => {
    // A debounce timer that fires after a test has torn down leaves React's act flag off,
    // and every later render in the file then commits outside act and is never flushed.
    // Restoring it per test keeps one slow test from silently breaking the rest.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockPush.mockClear();
    handle = createTestDatabase();
    wired = createTestRepository(handle.db, sourceOf(FIXTURE));
    preferences = wired.preferences;
    repository = wired.repository;
    expect((await repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    // Let any in-flight debounce land before tearing down. A timer that fires after the
    // test has ended updates a torn-down tree outside act(), and React's renderer does not
    // recover from that — the symptom is the *next* test rendering nothing at all.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS * 2));
    });
    // Unmount before the database goes away: auto-cleanup runs in an outer afterEach,
    // which is *after* this one, and an unmount against a closed handle is a crash.
    await cleanup();
    handle.close();
  });

  describe('the ladder', () => {
    it('renders the whole roster in rank order, viewer included', async () => {
      await renderRoster(repository);
      expect(renderedNames()).toEqual(['Aurel', 'Brann', 'Cinder', 'Dross']);
    });

    it('labels the season from the seed rather than from a literal', async () => {
      await renderRoster(repository);
      expect(screen.getByTestId('roster-season')).toHaveTextContent('SEASON 41');
    });

    it('counts the registered players, not the rows a search left behind', async () => {
      await renderRoster(repository);
      expect(screen.getByTestId('roster-count')).toHaveTextContent('4 registered players');
      await type('ur');
      await expectNames(['Aurel']);
      expect(screen.getByTestId('roster-count')).toHaveTextContent('4 registered players');
    });

    it('shows the viewer once as a hero card and once as a row (ADR-0008)', async () => {
      await renderRoster(repository);
      expect(screen.getByTestId('viewer-card')).toBeTruthy();
      expect(screen.getByText('1,000,000')).toBeTruthy();
      expect(screen.getByText('1.00 M')).toBeTruthy();
      expect(renderedNames().filter((name) => name === 'Aurel')).toHaveLength(1);
    });

    it('renders the exact combat power, grouped, in every row', async () => {
      await renderRoster(repository);
      expect(screen.getByText('CP 4,000,000')).toBeTruthy();
    });

    it('navigates on the stable id rather than the name (defect 2)', async () => {
      await renderRoster(repository);
      fireEvent.press(screen.getByTestId('roster-row-p-c'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/player/[id]',
        params: { id: 'p-c' },
      });
    });
  });

  describe('search', () => {
    it('narrows the list to the matches', async () => {
      await renderRoster(repository);
      await type('n');
      await expectNames(['Brann', 'Cinder']);
    });

    it('matches case-insensitively', async () => {
      await renderRoster(repository);
      await type('AUR');
      await expectNames(['Aurel']);
    });

    it('does not send a query per keystroke', async () => {
      await renderRoster(repository);
      await type('B');
      await type('Br');
      await type('Bra');
      // Still the unfiltered list: nothing has settled, so nothing has reached SQL.
      expect(renderedNames()).toHaveLength(4);
      await expectNames(['Brann']);
    });

    it('shows the empty state, not a blank screen (defect 5)', async () => {
      await renderRoster(repository);
      await type('zzz');
      await waitFor(() => expect(screen.getByTestId('roster-empty')).toBeTruthy(), {
        timeout: 2000,
      });
      expect(screen.getByText('No player by that name')).toBeTruthy();
      expect(screen.queryAllByTestId('roster-row-name')).toHaveLength(0);
    });

    it('keeps the header alive while the result is empty', async () => {
      await renderRoster(repository);
      await type('zzz');
      await waitFor(() => expect(screen.getByTestId('roster-empty')).toBeTruthy());
      // The search field, the chips and the viewer card are not part of the list, so an
      // empty result must not take them down with it. That is defect 5's real shape.
      expect(screen.getByTestId('roster-search')).toBeTruthy();
      expect(screen.getByTestId('viewer-card')).toBeTruthy();
      expect(screen.getByTestId('roster-sort-RANK')).toBeTruthy();
    });

    it('recovers when the query is cleared', async () => {
      await renderRoster(repository);
      await type('zzz');
      await waitFor(() => expect(screen.getByTestId('roster-empty')).toBeTruthy());
      await type('');
      await expectNames(['Aurel', 'Brann', 'Cinder', 'Dross']);
    });

    it('treats a LIKE wildcard as a literal character', async () => {
      await renderRoster(repository);
      await type('_');
      await waitFor(() => expect(screen.getByTestId('roster-empty')).toBeTruthy());
    });
  });

  describe('the sort chips', () => {
    // Ordering itself is proven in useRoster.test.tsx: FlashList does not re-order in the
    // jest environment, so a rendered-order assertion here would be about the recycler
    // rather than about the sort. What belongs here is the wiring — press, selection,
    // persistence — which is all this block asserts.
    it('announces the selected chip to the accessibility layer', async () => {
      await renderRoster(repository);
      expect(screen.getByTestId('roster-sort-RANK').props.accessibilityState).toMatchObject({
        selected: true,
      });

      pickSort('MY_WINS');
      await waitFor(() =>
        expect(screen.getByTestId('roster-sort-MY_WINS').props.accessibilityState).toMatchObject({
          selected: true,
        }),
      );
      expect(screen.getByTestId('roster-sort-RANK').props.accessibilityState).toMatchObject({
        selected: false,
      });
    });

    it('persists the choice, and comes back to it after a restart', async () => {
      const first = await renderRoster(repository);
      pickSort('COMBAT_POWER');
      await waitFor(() => expect(preferences.getRosterSort()).toBe('COMBAT_POWER'));
      await first.unmount();

      // A restart is a fresh repository over the same stored preferences and database.
      const restarted = wired.restart();
      await renderRoster(restarted);

      await waitFor(() =>
        expect(
          screen.getByTestId('roster-sort-COMBAT_POWER').props.accessibilityState,
        ).toMatchObject({ selected: true }),
      );
    });

    it('keeps the rank badge on absolute season rank', async () => {
      await renderRoster(repository);
      // Inherited prototype behaviour, asserted so that changing it is a decision rather
      // than a regression (ROADMAP.md Phase 3 exit criteria).
      expect(renderedRanks()).toEqual(['01', '02', '03', '04']);
    });
  });

  describe('the states the prototype does not have', () => {
    it('separates "no rows yet" from "no rows"', async () => {
      await renderRoster(repository, createStubLiveData({ loaded: false }));
      await waitFor(() => expect(screen.getByTestId('roster-loading')).toBeTruthy());
      expect(screen.queryByTestId('roster-empty')).toBeNull();
    });

    it('surfaces a query failure as a recoverable error rather than a blank list', async () => {
      const boom = new Error('the ladder is unreachable');
      await renderRoster(repository, createStubLiveData({ error: boom }));
      await waitFor(() => expect(screen.getByTestId('roster-error')).toBeTruthy());
      expect(screen.getByText('the ladder is unreachable')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'TRY AGAIN' })).toBeTruthy();
    });

    it('re-runs the source when the retry is pressed', async () => {
      let attempts = 0;
      const counting: RosterSource = {
        name: 'counting',
        fetchRoster: async () => {
          attempts += 1;
          return ok(FIXTURE);
        },
      };
      const repo = wired.restart(counting);
      await renderRoster(repo, createStubLiveData({ error: new Error('gone') }));
      await waitFor(() => expect(screen.getByTestId('roster-error')).toBeTruthy());

      fireEvent.press(screen.getByRole('button', { name: 'TRY AGAIN' }));
      await waitFor(() => expect(attempts).toBe(1));
    });

    it('reports a refresh failure without crashing', async () => {
      const failing: RosterSource = {
        name: 'failing',
        fetchRoster: async () => err(new Error('airplane mode')),
      };
      const repo = wired.restart(failing);
      await renderRoster(repo);
      await expectNames(['Aurel', 'Brann', 'Cinder', 'Dross']);

      fireEvent.press(screen.getByTestId('roster-row-p-a'));
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('roster-error')).toBeNull();
    });
  });
});
