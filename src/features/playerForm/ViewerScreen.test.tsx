/**
 * ADR-0022's exit criteria: a fresh install can say which player is you, and once it has,
 * your own stats can be kept current from one screen.
 *
 * Rendered over a **real** `better-sqlite3` database like the other screen tests, so "the
 * app now knows who I am" is an assertion about the row and the preference the next launch
 * would read — not about a spy having been called.
 *
 * jest-expo runs at fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ok, type RosterSnapshot, type RosterSource } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId, type PlayerDraft, type PlayerId } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { ViewerScreen } from './ViewerScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

/** Nothing upstream ever answers: these tests are the no-seed, no-sync install. */
const EMPTY: RosterSnapshot = {
  season: 41,
  viewerId: asPlayerId(''),
  players: [],
  headToHead: [],
};

const sourceOf = (snapshot: RosterSnapshot): RosterSource => ({
  name: 'fixture',
  fetchRoster: async () => ok(snapshot),
});

const draft = (name: string, combatPower: number): PlayerDraft => ({
  name,
  level: 12,
  gameCode: '',
  combatPower,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const wrapWith = (repository: RosterRepository) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ArenaDataProvider value={{ repository, useLiveData: createStubLiveData() }}>
          {children}
        </ArenaDataProvider>
      </SafeAreaProvider>
    );
  };

/**
 * One keystroke at a time, each let to commit before the next. Overlapping act() scopes
 * corrupt the renderer for the rest of the *file* rather than failing the test that caused
 * them, which is ADR-0018's note on RNTL and is exactly what a two-field edit walks into.
 */
const type = async (field: string, value: string): Promise<void> => {
  fireEvent.changeText(screen.getByTestId(`form-field-${field}`), value);
  await waitFor(() => expect(screen.getByTestId(`form-field-${field}`).props.value).toBe(value));
};

const startAct = (): void => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
};

describe('ViewerScreen — a fresh install has nobody to be', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  beforeEach(() => {
    startAct();
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(EMPTY)).repository;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('asks who you are rather than opening a form over nobody', async () => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });

    expect(screen.getByTestId('viewer-choice-empty')).toBeTruthy();
    // No name field anywhere: this screen selects a player, it never invents one.
    expect(screen.queryByTestId('form-field-name')).toBeNull();
  });

  it('sends an empty roster to the add-player form rather than growing one of its own', async () => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('viewer-choice-add-player'));

    expect(mockPush).toHaveBeenCalledWith('/player/new');
  });
});

describe('ViewerScreen — choosing your player', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let nyxId: PlayerId;
  let orrinId: PlayerId;

  beforeEach(() => {
    startAct();
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(EMPTY)).repository;

    const nyx = repository.createPlayer(draft('Nyx', 2500));
    const orrin = repository.createPlayer(draft('Orrin', 9000));
    if (!nyx.ok || !orrin.ok) throw new Error('fixture: the players could not be created');
    nyxId = nyx.value.id;
    orrinId = orrin.value.id;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('offers every player on the ladder as a candidate', async () => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });

    expect(screen.getByTestId(`viewer-choice-row-${nyxId}`)).toBeTruthy();
    expect(screen.getByTestId(`viewer-choice-row-${orrinId}`)).toBeTruthy();
  });

  it('stores the choice and opens that player, with their stats already in the inputs', async () => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId(`viewer-choice-row-${nyxId}`));

    // The preference is what the next launch reads, so it is what this asserts.
    expect(repository.getViewerId()).toBe(nyxId);
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));
    expect(screen.getByTestId('form-field-combatPower').props.value).toBe('2500');
  });

  it('names whose stats these are, so a wrong choice is visible rather than silent', async () => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId(`viewer-choice-row-${nyxId}`));

    await waitFor(() => expect(screen.getByText('YOUR AVATAR')).toBeTruthy());
    expect(screen.getByText('Nyx')).toBeTruthy();
  });
});

describe('ViewerScreen — updating your own stats', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let nyxId: PlayerId;
  let orrinId: PlayerId;

  beforeEach(() => {
    startAct();
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(EMPTY)).repository;

    const nyx = repository.createPlayer(draft('Nyx', 2500));
    const orrin = repository.createPlayer(draft('Orrin', 9000));
    if (!nyx.ok || !orrin.ok) throw new Error('fixture: the players could not be created');
    nyxId = nyx.value.id;
    orrinId = orrin.value.id;
    if (!repository.setViewerId(nyxId).ok) throw new Error('fixture: the viewer was refused');
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const renderViewer = async (): Promise<void> => {
    await render(<ViewerScreen />, { wrapper: wrapWith(repository) });
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));
  };

  it('opens straight on your stats once there is a viewer', async () => {
    await renderViewer();

    expect(screen.queryByTestId('viewer-choice-list')).toBeNull();
    expect(screen.getByTestId('form-field-combatPower').props.value).toBe('2500');
  });

  it('rewrites the stats the roster shows as yours', async () => {
    await renderViewer();

    await type('combatPower', '2145880');
    // The Int32 overflow the formatting contract exists for, entered by hand.
    await type('atk', '2418904113');
    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => {
      const live = repository.observeViewer();
      const viewer = live.map(live.query.all());
      expect(viewer?.combatPower).toBe(2_145_880);
      expect(viewer?.atk).toBe(2_418_904_113);
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('offers no remove control, because you do not delete yourself', async () => {
    await renderViewer();

    expect(screen.queryByTestId('form-delete')).toBeNull();
  });

  it('lets a wrong choice be corrected without leaving the screen', async () => {
    await renderViewer();

    fireEvent.press(screen.getByTestId('form-change-viewer'));

    // The current answer is announced as a selected control, not merely tinted.
    const current = await screen.findByTestId(`viewer-choice-row-${nyxId}`);
    expect(current.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

    fireEvent.press(screen.getByTestId(`viewer-choice-row-${orrinId}`));

    expect(repository.getViewerId()).toBe(orrinId);
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Orrin'));
  });

  it('keeps the current avatar when the correction is cancelled', async () => {
    await renderViewer();

    fireEvent.press(screen.getByTestId('form-change-viewer'));
    fireEvent.press(await screen.findByTestId('viewer-choice-cancel'));

    expect(repository.getViewerId()).toBe(nyxId);
    // Back to the stats, not out to the roster: cancelling undoes the detour, not the visit.
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));
    expect(mockBack).not.toHaveBeenCalled();
  });
});
