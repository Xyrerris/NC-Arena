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
import {
  err,
  ok,
  type AvatarSource,
  type BalanceSource,
  type CollectionSource,
  type MarketListing,
  type ScanOptions,
  type UnlockedCollections,
} from '@/core/common';
import {
  ArenaDataProvider,
  createCollectionRepository,
  createSheetLibrary,
  type MarketLibrary,
  type RosterRepository,
  type SheetLibrary,
} from '@/core/data';
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

  let sheets: SheetLibrary | undefined;
  let market: MarketLibrary | undefined;
  let avatarSource: AvatarSource | undefined;
  let balance: BalanceSource | undefined;

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
          <ArenaDataProvider
            value={{
              repository,
              useLiveData: createStubLiveData(),
              collections,
              sheets,
              market,
              avatarSource,
              balance,
            }}
          >
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

  it('offers no market button when the sheet comes without names to say what is equipment', async () => {
    makeViewerWithAvatar();
    await mount();

    expect(listedIds()).toContain(2);
    expect(screen.queryByTestId('collection-market-2')).toBeNull();
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

    // The filters start folded, with a line saying what narrows the list.
    expect(screen.queryByTestId('collection-filter-UNLOCKED')).toBeNull();
    expect(text('collection-filters-summary')).toBe('OPEN');

    await press('collection-filters-toggle');
    await press('collection-filter-UNLOCKED');
    expect(listedIds()).toEqual([1]);
    expect(text('collection-filters-summary')).toBe('UNLOCKED');

    await press('collection-filter-DISPUTED');
    expect(listedIds()).toEqual([]);
    expect(screen.getByTestId('collection-empty')).toBeTruthy();
  });

  it('filters by the stats a collection rewards, all of them at once', async () => {
    makeViewerWithAvatar();
    await mount();

    await press('collection-filters-toggle');
    await press('collection-section-stats');
    await press('collection-stat-ATK');
    expect(listedIds()).toEqual([2, 3]);
    expect(text('collection-filters-summary')).toBe('OPEN · ATK');

    // 1 gives ATK and DEF but is unlocked, so the open list holds nothing with both.
    await press('collection-stat-DEF');
    expect(listedIds()).toEqual([]);
    expect(screen.getByTestId('collection-empty')).toBeTruthy();

    await press('collection-stat-DEF');
    expect(listedIds()).toEqual([2, 3]);
    expect(screen.getByTestId('collection-stat-ATK').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('narrows the items view to the collections that reward the stat', async () => {
    makeViewerWithAvatar();
    await mount();
    await act(async () => {
      fireEvent.press(screen.getByText(words.viewItems));
    });

    await press('collection-filters-toggle');
    await press('collection-section-stats');
    await press('collection-stat-SPD');

    // Only collection 5 rewards SPD, so only its item is still to find.
    expect(screen.getByText('40100001 · helps 1 collection')).toBeTruthy();
    expect(screen.queryByText('10110000 · helps 2 collections')).toBeNull();
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

  describe('without a sheet prop (the real route)', () => {
    const EQUIPMENT_CSV = [
      'id,_name,item_sub_type,grade,elemental_type',
      '10110000,Long Sword,Weapon,1,Normal',
      '10310000,Plate Armor,Armor,1,Fire',
    ].join('\r\n');
    // The costume sheet carries lib9c's column-describing rows, which are not items.
    const ITEM_HEADER = 'id,_name,item_sub_type,grade,elemental_type';
    const COSTUME_CSV = [ITEM_HEADER, '_item_sub_type,FullCostume|Title,,,'].join('\r\n');
    const MATERIAL_CSV = [ITEM_HEADER, '600201,Mithril Dust,EquipmentMaterial,1,Normal'].join(
      '\r\n',
    );
    const GAME_SHEETS = {
      collectionCsv: SAMPLE_SHEET_CSV,
      equipmentCsv: EQUIPMENT_CSV,
      costumeCsv: COSTUME_CSV,
      materialCsv: MATERIAL_CSV,
      consumableCsv: ITEM_HEADER,
      source: 'test',
    };

    const mountGated = async (read: jest.Mock): Promise<void> => {
      sheets = createSheetLibrary({ source: { name: 'test', read } });
      await render(<CollectionScreen />, { wrapper: wrapper() });
      await act(async () => {});
    };

    afterEach(() => {
      sheets = undefined;
      market = undefined;
    });

    const sellerAddress = 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63';
    const listing = (n: number, overrides: Partial<MarketListing> = {}): MarketListing => ({
      productId: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
      itemId: 10110000,
      itemSubType: 6,
      level: 0,
      grade: 1,
      elementalType: 0,
      combatPoint: 1000,
      price: n,
      quantity: 1,
      unitPrice: n,
      hasSkill: true,
      sellerAvatarAddress: sellerAddress,
      registeredBlockIndex: 1,
      ...overrides,
    });
    const scanned = (listings: MarketListing[]) => ok({ listings, readAt: NOW });
    /** A market that answers per item id, and says how far it got while it did. */
    const fakeMarket = (
      answer: (itemId: number) => ReturnType<typeof scanned> | ReturnType<typeof err>,
    ) => {
      const scan = jest.fn(
        (_planet: string, _route: number, itemId: number, options?: ScanOptions) => {
          options?.onProgress?.(3);
          return Promise.resolve(answer(itemId));
        },
      );
      return { library: { scan } as unknown as MarketLibrary, scan };
    };
    // Long Sword (10110000) +0 with a skill: two of these four are what collection 2 asks for.
    const SWORDS = [
      listing(5),
      listing(3),
      listing(1, { hasSkill: false }),
      listing(2, { level: 2 }),
    ];

    it('opens the cheapest matching listings of a collection, and closes again', async () => {
      makeViewerWithAvatar();
      const fake = fakeMarket(() => scanned(SWORDS));
      market = fake.library;
      await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));

      await press('collection-market-2');

      expect(fake.scan).toHaveBeenCalledWith('heimdall', 6, 10110000, expect.anything());
      expect(text('market-summary')).toBe('2 listings · from 3 NCG');
      expect(
        screen.getByTestId('market-listing-00000000-0000-0000-0000-000000000003'),
      ).toBeTruthy();
      expect(screen.getByText('3 NCG')).toBeTruthy();
      expect(screen.getByText('5 NCG')).toBeTruthy();
      // The cheaper piece without a skill, and the one at another level, are not this requirement.
      expect(screen.queryByText('1 NCG')).toBeNull();
      expect(screen.queryByText('2 NCG')).toBeNull();
      expect(text('market-freshness')).toContain('Asking prices, not what was paid');

      await press('market-close');
      expect(screen.queryByTestId('market-sheet')).toBeNull();
    });

    it('lets a collection of several pieces choose which one to look for, with a count on each', async () => {
      makeViewerWithAvatar();
      // Collection 3 asks for the Long Sword and the Plate Armor; only the sword is on sale.
      const fake = fakeMarket((itemId) => scanned(itemId === 10110000 ? SWORDS : []));
      market = fake.library;
      await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));

      await press('collection-market-3');

      expect(screen.getByText('Long Sword +0 · Normal · skill · 2')).toBeTruthy();
      expect(screen.getByText('Plate Armor +0 · Fire · skill · 0')).toBeTruthy();
      expect(text('market-summary')).toBe('2 listings · from 3 NCG');

      await press('market-piece-1');
      expect(text('market-empty')).toBe(words.marketNothing);
    });

    it('says the market could not be read, and reads it again when asked', async () => {
      makeViewerWithAvatar();
      const answers = [err({ reason: 'OFFLINE' as const, message: 'down' }), scanned(SWORDS)];
      const fake = fakeMarket(() => answers.shift() ?? scanned([]));
      market = fake.library;
      await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));

      await press('collection-market-2');
      expect(text('market-error')).toBe(words.marketFailedOffline);

      await press('market-retry');
      expect(text('market-summary')).toBe('2 listings · from 3 NCG');
      expect(fake.scan).toHaveBeenCalledTimes(2);
    });

    it('filters by category, any of the selected, with the equipment types under Equipment', async () => {
      makeViewerWithAvatar();
      const sheetsWithAll = {
        ...GAME_SHEETS,
        equipmentCsv: `${EQUIPMENT_CSV}\r\n10750000,Old Grimoire,Grimoire,1,Normal`,
        costumeCsv: [ITEM_HEADER, '40100001,Black Dress,FullCostume,2,Normal'].join('\r\n'),
      };
      await mountGated(jest.fn(() => Promise.resolve(ok(sheetsWithAll))));
      await press('collection-filters-toggle');
      await press('collection-section-category');

      await press('collection-category-COSTUME');
      expect([...listedIds()].sort()).toEqual([5, 6]);

      // Another category widens the list rather than narrowing it.
      await press('collection-category-GRIMOIRE');
      expect([...listedIds()].sort()).toEqual([4, 5, 6]);
      expect(text('collection-filters-summary')).toBe('OPEN · GRIMOIRE · COSTUME');

      await press('collection-category-COSTUME');
      await press('collection-category-GRIMOIRE');
      expect(screen.queryByTestId('collection-equipment-types')).toBeNull();

      // Equipment opens its types; Armor leaves the collection that asks for one (3).
      await press('collection-category-EQUIPMENT');
      expect([...listedIds()].sort()).toEqual([2, 3]);
      await press('collection-equipment-Armor');
      expect(listedIds()).toEqual([3]);
      expect(text('collection-filters-summary')).toBe('OPEN · EQUIPMENT (Armor)');

      // Reset puts everything back, and the line goes back to saying only the status.
      await press('collection-filters-reset');
      expect([...listedIds()].sort()).toEqual([2, 3, 4, 5, 6]);
      expect(text('collection-filters-summary')).toBe('OPEN');
      expect(screen.queryByTestId('collection-filters-reset')).toBeNull();
    });

    describe('the purchase card', () => {
      const AGENT = '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB';
      const identity = { name: 'Xyrerris', level: 400, agentAddress: AGENT };
      const withAccount = (held: number | 'offline') => {
        avatarSource = {
          name: 'test',
          readAvatar: jest.fn(() => Promise.resolve(ok(identity))),
        };
        balance = {
          name: 'test',
          readNcg: jest.fn(() =>
            Promise.resolve(
              held === 'offline' ? err({ reason: 'OFFLINE' as const, message: 'down' }) : ok(held),
            ),
          ),
        };
      };
      afterEach(() => {
        avatarSource = undefined;
        balance = undefined;
      });
      const FIRST = 'market-listing-00000000-0000-0000-0000-000000000003';

      it('re-reads the listing, shows the price, the balance and what would be left, and buys nothing', async () => {
        makeViewerWithAvatar();
        withAccount(10);
        const fake = fakeMarket(() => scanned(SWORDS));
        market = fake.library;
        await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));
        await press('collection-market-2');

        await press(FIRST);
        await act(async () => {});

        // The first scan filled the list; the card asks again, fresh.
        expect(fake.scan).toHaveBeenLastCalledWith(
          'heimdall',
          6,
          10110000,
          expect.objectContaining({ fresh: true }),
        );
        expect(text('purchase-price')).toBe('3 NCG');
        expect(text('purchase-balance')).toBe('You hold 10 NCG');
        expect(text('purchase-after')).toBe('Would leave 7 NCG');
        expect(text('purchase-not-built')).toBe(words.purchaseNotBuilt);

        await press('purchase-back');
        expect(screen.queryByTestId('purchase-card')).toBeNull();
        expect(screen.getByTestId(FIRST)).toBeTruthy();
      });

      it('says how much is missing when the balance is not enough', async () => {
        makeViewerWithAvatar();
        withAccount(1);
        market = fakeMarket(() => scanned(SWORDS)).library;
        await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));
        await press('collection-market-2');
        await press(FIRST);
        await act(async () => {});
        expect(text('purchase-after')).toBe('2 NCG short of the price');
      });

      it('says the balance is unknown, never zero, when the chain cannot be reached', async () => {
        makeViewerWithAvatar();
        withAccount('offline');
        market = fakeMarket(() => scanned(SWORDS)).library;
        await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));
        await press('collection-market-2');
        await press(FIRST);
        await act(async () => {});

        expect(text('purchase-balance')).toBe(words.purchaseBalanceOffline);
        expect(screen.queryByTestId('purchase-after')).toBeNull();
        expect(text('purchase-price')).toBe('3 NCG');
      });

      it('says the offer is gone when the fresh read no longer has it', async () => {
        makeViewerWithAvatar();
        withAccount(10);
        let reads = 0;
        market = fakeMarket(() => {
          reads += 1;
          return scanned(reads === 1 ? SWORDS : []);
        }).library;
        await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));
        await press('collection-market-2');

        await press(FIRST);
        await act(async () => {});

        expect(text('purchase-gone')).toBe(words.purchaseGone);
        expect(screen.queryByTestId('purchase-price')).toBeNull();
      });
    });

    it('searches a costume by its own route, and shows a lot by its unit price', async () => {
      makeViewerWithAvatar();
      // Collection 5 asks for one costume (the sample sheet marks it with a skill flag; the real
      // sheet leaves it FALSE for costumes, and the listing here follows the sample).
      const costume = (n: number, overrides: Partial<MarketListing> = {}) =>
        listing(n, { itemId: 40100001, itemSubType: 1, combatPoint: 1534169646, ...overrides });
      const fake = fakeMarket(() =>
        scanned([costume(7), costume(4, { price: 8, quantity: 2, unitPrice: 4 })]),
      );
      market = fake.library;
      const withCostume = {
        ...GAME_SHEETS,
        costumeCsv: [ITEM_HEADER, '40100001,Black Dress,FullCostume,2,Normal'].join('\r\n'),
      };
      await mountGated(jest.fn(() => Promise.resolve(ok(withCostume))));

      await press('collection-market-5');

      expect(fake.scan).toHaveBeenCalledWith('heimdall', 1, 40100001, expect.anything());
      expect(text('market-summary')).toBe('2 listings · from 4 NCG each');
      expect(screen.getByText('4 NCG each')).toBeTruthy();
      expect(screen.getByText('7 NCG')).toBeTruthy();
    });

    it('says a collection of pieces the market does not sell is not sold, and offers no button', async () => {
      makeViewerWithAvatar();
      market = fakeMarket(() => scanned([])).library;
      const withGrimoire = {
        ...GAME_SHEETS,
        equipmentCsv: `${EQUIPMENT_CSV}\r\n10750000,Old Grimoire,Grimoire,1,Normal`,
      };
      await mountGated(jest.fn(() => Promise.resolve(ok(withGrimoire))));

      // Collection 4 is the single Grimoire.
      expect(text('collection-market-note-4')).toBe(words.marketNotSold);
      expect(screen.queryByTestId('collection-market-4')).toBeNull();
    });

    it('loads the sheets, then lists the missing equipment by name, level, element and skill', async () => {
      makeViewerWithAvatar();
      const read = jest.fn(() => Promise.resolve(ok(GAME_SHEETS)));
      await mountGated(read);

      expect(read).toHaveBeenCalledWith('heimdall');
      await act(async () => {
        fireEvent.press(screen.getByText(words.viewItems));
      });

      expect(screen.getByText('Long Sword +0 · Normal · with skill')).toBeTruthy();
      expect(screen.getByText('helps 2 collections')).toBeTruthy();
      // Collection 1 is unlocked. Of the open ones, 10750000 and the two 40100001 slots are not in
      // the equipment catalog, so they are counted rather than listed.
      expect(text('collection-unlisted-note')).toBe(words.unlistedNote(3));
    });

    it('marks the pieces that need a skill, with a legend, but only once names say they are equipment', async () => {
      makeViewerWithAvatar();
      await mountGated(jest.fn(() => Promise.resolve(ok(GAME_SHEETS))));

      expect(screen.getByTestId('collection-skill-legend')).toBeTruthy();
      // Collection 3 asks for the Long Sword (equipment, skill) and 10310000 (a Plate Armor here,
      // also equipment): one line each, both marked.
      const lines = screen.getAllByLabelText(/needs a skill/);
      expect(lines.length).toBeGreaterThan(0);
      // The diamond is hidden from screen readers on purpose, so the query has to ask for it.
      const marks = screen.getAllByTestId('skill-mark', { includeHiddenElements: true });
      expect(marks.length).toBeGreaterThan(lines.length - 1);
    });

    it('draws no mark and no legend on a sheet handed in without names', async () => {
      makeViewerWithAvatar();
      await mount();

      expect(screen.queryByTestId('collection-skill-legend')).toBeNull();
      expect(screen.queryAllByTestId('skill-mark')).toEqual([]);
    });

    it('says it could not load and tries again when asked, without a list in the meantime', async () => {
      makeViewerWithAvatar();
      const read = jest
        .fn()
        .mockResolvedValueOnce(err({ reason: 'OFFLINE', message: 'down' }))
        .mockResolvedValueOnce(ok(GAME_SHEETS));
      await mountGated(read);

      expect(screen.getByText(words.sheetFailedOffline)).toBeTruthy();
      expect(screen.queryByTestId('collection-list')).toBeNull();

      await press('collection-sheets-retry');

      expect(read).toHaveBeenCalledTimes(2);
      expect(text('collection-progress')).toBe('1 of 6 unlocked');
    });

    it('refuses a collection sheet it cannot parse instead of showing a shorter list', async () => {
      makeViewerWithAvatar();
      const read = jest.fn(() =>
        Promise.resolve(ok({ ...GAME_SHEETS, collectionCsv: 'id,item_id1\r\n1,notanumber' })),
      );
      await mountGated(read);

      expect(screen.getByText(words.sheetMalformed)).toBeTruthy();
      expect(screen.queryByTestId('collection-list')).toBeNull();
    });
  });
});
