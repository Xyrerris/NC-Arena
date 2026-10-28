/**
 * The Upgrade screen from the outside: nothing is read until it is asked, the ranking follows the
 * ceilings and the "only raised" filter says what it hides, and a selection offers to be bought.
 * The sheets and the market are fakes the test controls.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type GameSheets, type MarketListing } from '@/core/common';
import {
  ArenaDataProvider,
  createSheetLibrary,
  type MarketLibrary,
  type RosterRepository,
  type SheetLibrary,
} from '@/core/data';
import { createStubLiveData, createTestDatabase, createTestRepository } from '@/core/testing';
import type { TestDatabase } from '@/core/testing';

import { upgradeStrings as words } from './strings';
import { UpgradeScreen } from './UpgradeScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const SHEETS: GameSheets = {
  collectionCsv: 'id',
  equipmentCsv: [
    'id,_name,item_sub_type,grade,elemental_type,exp',
    '10171000,Valkyrie Sword,Weapon,7,Fire,120000000',
    '10181000,Transcendent Sword,Weapon,8,Fire,1200000000',
    '10191000,Ultimate Sword,Weapon,9,Fire,9600000000',
  ].join('\r\n'),
  costumeCsv: 'id',
  materialCsv: 'id',
  consumableCsv: 'id',
  enhancementCsv: ['id,item_sub_type,grade,level,cost,exp', '1,Weapon,8,1,0,1280000000'].join(
    '\r\n',
  ),
  onChain: true,
  source: 'test',
};

const listing = (productId: string, over: Partial<MarketListing>): MarketListing => ({
  productId,
  itemId: 10181000,
  itemSubType: 6,
  level: 0,
  grade: 8,
  elementalType: 1,
  combatPoint: 0,
  price: 10,
  quantity: 1,
  unitPrice: 10,
  hasSkill: false,
  sellerAvatarAddress: '0xavatar',
  sellerAgentAddress: '0xseller',
  tradableId: 't',
  legacy: false,
  registeredBlockIndex: 1,
  ...over,
});

// A grade 9 +0 at 100 NCG (10.4 per Gexp, in range) and a grade 8 +1 at 10 NCG (7.8, in range).
const ULTIMATE = listing('ult', { itemId: 10191000, grade: 9, level: 0, price: 100 });
const RAISED = listing('raised', { itemId: 10181000, grade: 8, level: 1, price: 10 });

describe('UpgradeScreen', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let sheets: SheetLibrary;
  let scan: jest.Mock;
  let market: MarketLibrary;

  const wrapper = () =>
    function Harness({ children }: { children: ReactNode }) {
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ArenaDataProvider
            value={{ repository, useLiveData: createStubLiveData(), sheets, market }}
          >
            {children}
          </ArenaDataProvider>
        </SafeAreaProvider>
      );
    };

  const mount = async () => {
    await render(<UpgradeScreen />, { wrapper: wrapper() });
    await act(async () => {});
  };
  const press = async (testID: string): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };
  const text = (testID: string): unknown => screen.getByTestId(testID).props.children;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
    sheets = createSheetLibrary({
      source: { name: 'test', read: () => Promise.resolve(ok(SHEETS)) },
    });
    scan = jest.fn((_planet, _subType, itemId: number) =>
      Promise.resolve(
        ok({
          listings: itemId === 10191000 ? [ULTIMATE] : itemId === 10181000 ? [RAISED] : [],
          readAt: 0,
        }),
      ),
    );
    market = { scan } as unknown as MarketLibrary;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('reads nothing until asked, then lists what is in range, best share of the ceiling first', async () => {
    await mount();

    expect(text('upgrade-idle')).toBe(words.nothingYet);
    expect(scan).not.toHaveBeenCalled();

    await press('upgrade-only-raised'); // every level
    await press('upgrade-find');

    // Grades 8 and 9 only: grade 7 starts switched off.
    expect(scan.mock.calls.map((call) => call[2]).sort()).toEqual([10181000, 10191000]);
    expect(text('upgrade-status')).toBe(words.status(2, 2, false));
    const ids = screen
      .queryAllByTestId(/^upgrade-row-/)
      .map((node) => String(node.props.testID).replace('upgrade-row-', ''));
    expect(ids).toEqual(['raised', 'ult']);
  });

  it('hides +0 pieces by default and says how many qualify', async () => {
    await mount();
    await press('upgrade-find');

    expect(screen.queryByTestId('upgrade-row-ult')).toBeNull();
    expect(screen.getByTestId('upgrade-row-raised')).toBeTruthy();
    expect(text('upgrade-left-out')).toBe(words.leftOutAtZero(1));
  });

  it('counts what is over a ceiling set by the owner, without listing it', async () => {
    await mount();
    await press('upgrade-find');
    await press('upgrade-ceilings-toggle');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('upgrade-ceiling-8'), '5');
    });

    expect(screen.queryByTestId('upgrade-row-raised')).toBeNull();
    expect(text('upgrade-over')).toBe(words.overCeiling(1));
  });

  it('offers to buy a selection with its total', async () => {
    await mount();
    await press('upgrade-find');
    await press('upgrade-select-raised');

    expect(text('upgrade-bar-title')).toBe('1 piece selected · 10 NCG');
    expect(screen.getByTestId('upgrade-buy')).toBeTruthy();

    await press('upgrade-clear');

    expect(screen.queryByTestId('upgrade-bar')).toBeNull();
  });

  it('says why the sheets failed and tries again', async () => {
    let attempt = 0;
    sheets = createSheetLibrary({
      source: {
        name: 'test',
        read: () =>
          Promise.resolve(
            attempt++ === 0 ? err({ reason: 'OFFLINE', message: 'down' }) : ok(SHEETS),
          ),
      },
    });
    await mount();

    expect(screen.getByText(words.sheetFailedOffline)).toBeTruthy();

    await press('upgrade-sheets-retry');

    expect(screen.getByTestId('upgrade-find')).toBeTruthy();
  });

  it('warns that the sheets are older than the chain when the node was not read', async () => {
    sheets = createSheetLibrary({
      source: { name: 'test', read: () => Promise.resolve(ok({ ...SHEETS, onChain: false })) },
    });
    await mount();

    expect(text('upgrade-not-on-chain')).toBe(words.notOnChain);
  });
});
