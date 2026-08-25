/**
 * The detail screen as rendered. The state machine is proven in `usePlayerDetail.test.tsx`;
 * what belongs here is what only the screen does — both representations of every stat
 * actually reaching the tree, the tabs swapping content, and the back affordance agreeing
 * with Android's predictive back on where "back" goes.
 *
 * jest-expo runs at fontScale 2, so every assertion below is also a 200 % font-scale
 * assertion. It still cannot see clipping — that is the Maestro gate's job
 * (ARCHITECTURE.md §10), and Phase 4's screenshot criterion depends on it.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ok, type RosterSnapshot, type RosterSource } from '@/core/common';
import { layout } from '@/core/design-system';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId, type HeadToHead, type Player } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { PlayerDetailScreen } from './PlayerDetailScreen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

const KRIOS = asPlayerId('plr_viewer');
const VALKROS = asPlayerId('plr_top');

const viewer: Player = {
  id: KRIOS,
  name: 'Krios',
  level: 402,
  gameCode: 'k77x',
  rank: 2,
  combatPower: 2_145_880,
  score: 1842,
  hp: 980_112_004,
  atk: 1_184_530_912,
  def: 902_114_887,
  critBp: 584_127,
  hit: 1_421_009_663,
  spd: 1_108_422_510,
};

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

const record: HeadToHead = { viewerId: KRIOS, opponentId: VALKROS, wins: 1, losses: 6 };

const FIXTURE: RosterSnapshot = {
  season: 41,
  viewerId: KRIOS,
  players: [opponent, viewer],
  headToHead: [record],
};

const source: RosterSource = { name: 'fixture', fetchRoster: async () => ok(FIXTURE) };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const wrapWith = (repository: RosterRepository, useLiveData = createStubLiveData()) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ArenaDataProvider value={{ repository, useLiveData }}>{children}</ArenaDataProvider>
      </SafeAreaProvider>
    );
  };

describe('PlayerDetailScreen', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  beforeEach(async () => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockCanGoBack.mockReturnValue(true);
    handle = createTestDatabase();
    const wired = createTestRepository(handle.db, source);
    repository = wired.repository;
    expect((await wired.repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const renderDetail = (id = VALKROS, useLiveData = createStubLiveData()) =>
    render(<PlayerDetailScreen id={id} />, { wrapper: wrapWith(repository, useLiveData) });

  describe('the header', () => {
    it('names the player, their rank and their combat power twice', async () => {
      await renderDetail();
      expect(screen.getByText('Valkros')).toBeTruthy();
      expect(screen.getByTestId('player-rank')).toHaveTextContent('RANK #01');
      expect(screen.getByText('3.084.221')).toBeTruthy();
      expect(screen.getByText('3,08 M')).toBeTruthy();
    });
  });

  describe('the Stats tab', () => {
    it('opens on the stat book', async () => {
      await renderDetail();
      expect(screen.getByTestId('player-stats-tab')).toBeTruthy();
      expect(screen.queryByTestId('player-versus-tab')).toBeNull();
    });

    it('renders every stat exactly and rounded, both at once', async () => {
      await renderDetail();
      const both: [string, string][] = [
        ['2.418.904.113', '2,42 B'],
        ['1.554.320.778', '1,55 B'],
        ['71,2043 %', '71,2%'],
        ['2.210.884.019', '2,21 B'],
        ['1.902.551.440', '1,90 B'],
      ];
      for (const [exact, short] of both) {
        expect(screen.getByText(exact)).toBeTruthy();
        expect(screen.getByText(short)).toBeTruthy();
      }
    });

    it('keeps the design footer that promises both representations', async () => {
      await renderDetail();
      expect(screen.getByText('exact value left · rounded value right')).toBeTruthy();
    });

    it('announces each stat as one node rather than three', async () => {
      await renderDetail();
      expect(screen.getByTestId('stat-ATK').props.accessibilityLabel).toBe('ATK, 2.418.904.113');
    });
  });

  describe('the Vs You tab', () => {
    const openVersus = async (): Promise<void> => {
      fireEvent.press(screen.getByRole('tab', { name: 'VS YOU' }));
      await waitFor(() => expect(screen.getByTestId('player-versus-tab')).toBeTruthy());
    };

    it('swaps the stat book for the comparison', async () => {
      await renderDetail();
      await openVersus();
      expect(screen.queryByTestId('player-stats-tab')).toBeNull();
    });

    it('summarises the head-to-head and shows the record', async () => {
      await renderDetail();
      await openVersus();
      expect(screen.getByTestId('player-head-to-head')).toBeTruthy();
      expect(screen.getByText('you won 1 of 7 matches')).toBeTruthy();
      expect(screen.getByText('1W · 6L')).toBeTruthy();
    });

    it('renders one comparison per stat, with the delta in words as well as colour', async () => {
      await renderDetail();
      await openVersus();
      for (const key of ['HP', 'ATK', 'DEF', 'CRIT', 'HIT', 'SPD']) {
        expect(screen.getByTestId(`compare-${key}`)).toBeTruthy();
      }
      expect(screen.getByTestId('compare-ATK').props.accessibilityLabel).toBe(
        'ATK. You 1.184.530.912, them 2.418.904.113. they lead, +104,2%.',
      );
    });

    it('closes with the verdict', async () => {
      await renderDetail();
      await openVersus();
      expect(screen.getByTestId('player-verdict')).toHaveTextContent(
        'you lead in 0 of 6 stats · delta shown from your values',
      );
    });

    it('tells the tabs apart to a screen reader', async () => {
      await renderDetail();
      await openVersus();
      expect(screen.getByRole('tab', { name: 'VS YOU' }).props.accessibilityState).toMatchObject({
        selected: true,
      });
      expect(screen.getByRole('tab', { name: 'STATS' }).props.accessibilityState).toMatchObject({
        selected: false,
      });
    });

    it('keeps the chosen tab across a re-render', async () => {
      const view = await renderDetail();
      await openVersus();
      await view.rerender(<PlayerDetailScreen id={VALKROS} />);
      expect(screen.getByTestId('player-versus-tab')).toBeTruthy();
    });
  });

  describe('going back', () => {
    it('pops the stack when there is one', async () => {
      await renderDetail();
      fireEvent.press(screen.getByTestId('player-back'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('goes to the roster instead when the screen was deep-linked into', async () => {
      // Nothing behind this screen: `back()` would leave the app, which is not what a
      // control labelled "ROSTER" promises — and not where predictive back lands either.
      mockCanGoBack.mockReturnValue(false);
      await renderDetail();
      fireEvent.press(screen.getByTestId('player-back'));
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('stays reachable when nothing loaded, at the touch minimum', async () => {
      await renderDetail(asPlayerId('plr_does_not_exist'));
      const back = screen.getByRole('button', { name: 'Back to the roster' });
      expect(back.props.style).toMatchObject({ minHeight: layout.minTouchTarget });
    });
  });

  describe('the states a deep link can reach', () => {
    it('renders a real not-found state rather than crashing on an undefined row', async () => {
      await renderDetail(asPlayerId('plr_does_not_exist'));
      expect(screen.getByTestId('player-not-found')).toBeTruthy();
      expect(screen.getByText('No such player')).toBeTruthy();
      expect(screen.queryByTestId('player-detail')).toBeNull();
    });

    it('separates "not read yet" from "not there"', async () => {
      await renderDetail(VALKROS, createStubLiveData({ loaded: false }));
      expect(screen.getByTestId('player-loading')).toBeTruthy();
      expect(screen.queryByTestId('player-not-found')).toBeNull();
    });

    it('offers a retry when the read fails', async () => {
      await renderDetail(VALKROS, createStubLiveData({ error: new Error('no book') }));
      expect(screen.getByTestId('player-error')).toBeTruthy();
      expect(screen.getByText('no book')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'TRY AGAIN' })).toBeTruthy();
    });
  });
});

/**
 * ADR-0020: the edit control is present for a player this device added and absent for a
 * synced one. Absent rather than disabled — an affordance that explains why it will not
 * work is still an affordance that does not work.
 */
describe('PlayerDetailScreen — editing a hand-entered player', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  beforeEach(async () => {
    mockPush.mockClear();
    handle = createTestDatabase();
    const wired = createTestRepository(handle.db, source);
    repository = wired.repository;
    expect((await repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('offers no edit control for a player that came from the sync', async () => {
    await render(<PlayerDetailScreen id={VALKROS} />, { wrapper: wrapWith(repository) });

    expect(screen.getByTestId('player-detail')).toBeTruthy();
    expect(screen.queryByTestId('player-edit')).toBeNull();
  });

  it('offers an edit control for a player added on this device', async () => {
    const created = repository.createPlayer({
      name: 'Nyx',
      level: 7,
      gameCode: '',
      combatPower: 2500,
      score: 10,
      hp: 9,
      atk: 1,
      def: 2,
      critPercent: 3,
      hit: 4,
      spd: 5,
    });
    if (!created.ok) throw new Error('fixture: the player could not be created');

    await render(<PlayerDetailScreen id={created.value.id} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('player-edit'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/player/edit/[id]' }),
    );
  });
});
