/**
 * ADR-0044 from the screen: the tracker follows the viewer's avatar, shows what the chain says
 * and what the user claimed, keeps a disagreement on screen, and carries on when the chain cannot
 * be read.
 *
 * Over a real `better-sqlite3` database and the real collection repository, with the chain
 * replaced by a source the test controls. jest-expo runs at fontScale 2, so every render here is
 * also a 200 % font-scale render.
 */

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SAMPLE_SHEET_CSV, parseCollectionSheet } from '@/core/collection';
import { err, ok, type CollectionSource, type UnlockedCollections } from '@/core/common';
import { ArenaDataProvider, createCollectionRepository, type RosterRepository } from '@/core/data';
import type { PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { CollectionScreen } from './CollectionScreen';
import { useCollection } from './useCollection';
import { collectionStrings as words } from './strings';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);
const AVATAR = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
} as const;
const NOW = Date.now();

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const draft = (name: string): PlayerDraft => ({
  name,
  level: 400,
  gameCode: '',
  combatPower: 900,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const unlocked = (ids: number[]): UnlockedCollections => ({
  ids: new Set(ids),
  source: 'mimir',
  blockIndex: 100,
});

describe('CollectionScreen', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let answer: Awaited<ReturnType<CollectionSource['readUnlocked']>>;
  let readUnlocked: jest.Mock;

  const wrapper = () => {
    readUnlocked = jest.fn(() => Promise.resolve(answer));
    const collections = createCollectionRepository({
      db: handle.db,
      source: { name: 'test', readUnlocked },
      now: () => NOW,
    });
    return function Harness({ children }: { children: ReactNode }) {
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ArenaDataProvider value={{ repository, useLiveData: createStubLiveData(), collections }}>
            {children}
          </ArenaDataProvider>
        </SafeAreaProvider>
      );
    };
  };

  const mount = async (props: { sampleData?: boolean } = {}) => {
    await render(<CollectionScreen sheet={SHEET} {...props} />, { wrapper: wrapper() });
    // The first read starts on mount; let it land.
    await act(async () => {});
  };

  const makeViewerWithAvatar = (): void => {
    const me = repository.createPlayer(draft('Xyrerris'));
    if (!me.ok) throw new Error('fixture: the player was refused');
    expect(repository.setViewerId(me.value.id).ok).toBe(true);
    expect(repository.setViewerAvatar(AVATAR).ok).toBe(true);
  };

  const press = async (testID: string): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };
  const listedIds = (): number[] =>
    screen
      .queryAllByTestId(/^collection-row-\d+$/)
      .map((node) => Number(String(node.props.testID).replace('collection-row-', '')));
  const text = (testID: string): unknown => screen.getByTestId(testID).props.children;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
    answer = ok(unlocked([1]));
    mockPush.mockClear();
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('asks for an avatar while there is none, and reads nothing', async () => {
    await mount();

    expect(screen.getByTestId('collection-no-avatar')).toBeTruthy();
    expect(readUnlocked).not.toHaveBeenCalled();

    await press('collection-open-viewer');
    expect(mockPush).toHaveBeenCalledWith('/me');
  });

  it('says when the sheet is placeholder data', async () => {
    makeViewerWithAvatar();
    await mount({ sampleData: true });

    expect(text('collection-sample-note')).toBe(words.sampleNote);
  });

  it('reads the chain on opening and shows the progress with its source', async () => {
    makeViewerWithAvatar();
    await mount();

    expect(readUnlocked).toHaveBeenCalledWith(AVATAR);
    expect(text('collection-progress')).toBe('1 of 6 unlocked');
    expect(text('collection-read-label')).toBe('Updated just now · mimir');
  });

  it('lists the open collections, the ones that need the fewest items first', async () => {
    makeViewerWithAvatar();
    await mount();

    // 1 is unlocked and filtered out of OPEN; the single-item ones come before 3.
    expect(listedIds()).toEqual([2, 4, 5, 6, 3]);
  });

  it('filters, and says so when a filter matches nothing', async () => {
    makeViewerWithAvatar();
    await mount();

    await press('collection-filter-UNLOCKED');
    expect(listedIds()).toEqual([1]);

    await press('collection-filter-DISPUTED');
    expect(listedIds()).toEqual([]);
    expect(screen.getByTestId('collection-empty')).toBeTruthy();
  });

  it('moves the sort chip when another order is chosen', async () => {
    makeViewerWithAvatar();
    await mount();

    await press('collection-sort-SHEET');

    expect(screen.getByTestId('collection-sort-SHEET').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(
      screen.getByTestId('collection-sort-FEWEST_ITEMS').props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  // The order itself is read off the view-model rather than the rendered tree: FlashList keeps a
  // cell per key and positions it by index, so the order of its children in a test renderer is
  // not the order on screen. `sortRows` and `filterRows` are covered in core/collection.
  it('hands the list over in the chosen order', async () => {
    makeViewerWithAvatar();
    const { result } = await renderHook(() => useCollection(SHEET), { wrapper: wrapper() });
    await act(async () => {});
    const ids = () => result.current.rows.map((row) => row.collectionId);

    expect(ids()).toEqual([2, 4, 5, 6, 3]);

    await act(async () => result.current.onSort('SHEET'));
    expect(ids()).toEqual([2, 3, 4, 5, 6]);

    await act(async () => result.current.onFilter('ALL'));
    expect(ids()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps a mark the chain contradicts on screen, until the user drops it', async () => {
    makeViewerWithAvatar();
    await mount();

    await press('collection-action-2');

    expect(text('collection-status-2')).toBe(words.statusDisputed);
    // Dropping it is the one thing the user can do, and it puts the collection back.
    await press('collection-action-2');
    expect(text('collection-status-2')).toBe(words.statusMissing);
  });

  it('owns up to unlocked collections the list does not include', async () => {
    makeViewerWithAvatar();
    answer = ok(unlocked([1, 999]));
    await mount();

    expect(String(text('collection-unknown-note'))).toContain('1 unlocked collection that');
    // They do not inflate the sheet's own count.
    expect(text('collection-progress')).toBe('1 of 6 unlocked');
  });

  it('keeps the list when the chain cannot be reached, then recovers on retry', async () => {
    makeViewerWithAvatar();
    answer = err({ reason: 'OFFLINE', message: 'down' });
    await mount();

    expect(text('collection-refresh-error')).toBe(words.failedOffline);
    // Nothing was ever read, so nothing is unlocked and every collection is still listed.
    expect(listedIds()).toEqual([2, 4, 5, 6, 3, 1]);
    expect(text('collection-read-label')).toBe(words.neverRead);

    answer = ok(unlocked([1]));
    await press('collection-retry');

    expect(screen.queryByTestId('collection-refresh-error')).toBeNull();
    expect(text('collection-progress')).toBe('1 of 6 unlocked');
  });

  it('says so when the chain has nothing for this avatar', async () => {
    makeViewerWithAvatar();
    answer = ok(null);
    await mount();

    expect(text('collection-no-state')).toBe(words.noState);
    expect(text('collection-progress')).toBe('0 of 6 unlocked');
  });

  it('shows the items still to find, with how many collections each helps', async () => {
    makeViewerWithAvatar();
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByText(words.viewItems));
    });

    // Collection 1 is unlocked, so the shared weapon now serves two collections, not three.
    expect(screen.getByText('10110000 · helps 2 collections')).toBeTruthy();
    expect(screen.queryByTestId('collection-list')).toBeNull();
  });
});
