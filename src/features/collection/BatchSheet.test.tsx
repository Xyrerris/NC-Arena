/**
 * The batch sheet in the default mode (ADR-0044, the cart, step 2b): every piece checked and signed
 * and nothing sent. With the build's own switch off — as it is in the repository — this is the only
 * mode a batch can run in, and the thing worth proving is that it refuses before it writes anything
 * when the ceiling or the money is missing, and that it never has a way to send.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ok, type MarketListing } from '@/core/common';
import { parsePurchaseLog } from '@/core/common/purchaseLog';
import {
  ArenaDataProvider,
  type KeystoreStore,
  type MarketLibrary,
  type PurchaseStore,
  type RosterRepository,
} from '@/core/data';
import {
  TEST_AGENT_ADDRESS,
  createFakeTransactionSource,
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  writeTestKeystore,
  type FakeTransactionNode,
  type TestDatabase,
} from '@/core/testing';

import { BatchSheet } from './BatchSheet';
import type { BatchPlan } from './batchUiState';
import { collectionStrings as words } from './strings';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};
const AVATAR = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
} as const;
const PASSPHRASE = 'hunter2';

const listing = (n: number, price: number): MarketListing => ({
  productId: `00000000-0000-0000-0000-00000000000${n}`,
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price,
  quantity: 1,
  unitPrice: price,
  hasSkill: true,
  sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: `00000000-0000-0000-0000-0000000000a${n}`,
  legacy: false,
  registeredBlockIndex: 1,
});
const A = listing(1, 3);
const B = listing(2, 4);

const planOf = (...shown: MarketListing[]): BatchPlan => ({
  items: shown.map((l) => ({ key: l.productId, shown: l, label: 'Long Sword +0' })),
  excluded: 0,
  total: shown.reduce((sum, l) => sum + l.price, 0),
});

describe('BatchSheet, dry run', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let node: FakeTransactionNode;
  let onMarket: MarketListing[];
  let keystoreText: string | null;
  let purchaseLog: string | null;
  let limit: number | null;
  let batchLimit: number | null;
  let held: number;

  const keystore: KeystoreStore = {
    get: () => keystoreText,
    set: (json) => {
      keystoreText = json;
    },
    clear: () => {
      keystoreText = null;
    },
  };
  const purchases: PurchaseStore = {
    getLimit: () => limit,
    setLimit: () => {},
    getBatchLimit: () => batchLimit,
    setBatchLimit: () => {},
    getLog: () => purchaseLog,
    setLog: (json) => {
      purchaseLog = json;
    },
    getMode: () => null,
    setMode: () => {},
  };

  const wrapper = () =>
    function Harness({ children }: { children: ReactNode }) {
      const market = {
        scan: jest.fn(() => Promise.resolve(ok({ listings: onMarket, readAt: 1 }))),
      } as unknown as MarketLibrary;
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ArenaDataProvider
            value={{
              repository,
              useLiveData: createStubLiveData(),
              market,
              avatarSource: {
                name: 'test',
                readAvatar: () =>
                  Promise.resolve(
                    ok({ name: 'X', level: 1, agentAddress: `0x${TEST_AGENT_ADDRESS}` }),
                  ),
              },
              balance: { name: 'test', readNcg: () => Promise.resolve(ok(held)) },
              keystore,
              purchases,
              transactions: node,
            }}
          >
            {children}
          </ArenaDataProvider>
        </SafeAreaProvider>
      );
    };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
    const me = repository.createPlayer({
      name: 'Xyrerris',
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
    if (!me.ok) throw new Error('fixture: the player was refused');
    repository.setViewerId(me.value.id);
    repository.setViewerAvatar(AVATAR);
    node = createFakeTransactionSource();
    onMarket = [A, B];
    keystoreText = writeTestKeystore(PASSPHRASE);
    purchaseLog = null;
    limit = 100;
    batchLimit = 20;
    held = 50;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const mount = async (plan: BatchPlan): Promise<void> => {
    await render(<BatchSheet planet="heimdall" plan={plan} onClose={() => {}} />, {
      wrapper: wrapper(),
    });
  };
  const press = async (testID: string): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };
  const text = (testID: string): unknown => screen.getByTestId(testID).props.children;
  const tryWith = async (passphrase: string): Promise<void> => {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('batch-passphrase'), passphrase);
    });
    await press('batch-try-button');
  };

  it('lists what would be bought and for how much, and says nothing is sent', async () => {
    await mount(planOf(A, B));

    expect(text('batch-total')).toBe(words.batchTotalLine(2, '7'));
    expect(text('batch-limit')).toBe(words.batchLimitLine('20'));
    expect(screen.getByTestId(`batch-line-${A.productId}`)).toBeTruthy();
    expect(screen.getByTestId(`batch-line-${B.productId}`)).toBeTruthy();
    expect(text('batch-mode-note')).toContain('nothing is sent');
    expect(screen.queryByTestId('batch-buy-button')).toBeNull();
  });

  it('checks and signs every piece, writes a record for each, and sends nothing', async () => {
    await mount(planOf(A, B));

    await tryWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-result')).toBeTruthy());

    expect(text('batch-result')).toBe(words.batchAllDry(2));
    const records = parsePurchaseLog(purchaseLog).records;
    expect(records.map((r) => [r.productId, r.mode, r.status])).toEqual([
      [A.productId, 'dry-run', 'dry-run'],
      [B.productId, 'dry-run', 'dry-run'],
    ]);
    expect(node.calls.filter((c) => c === 'attachSignature')).toHaveLength(2);
    // Once run, nothing offers to run it again.
    expect(screen.queryByTestId('batch-try-button')).toBeNull();
  });

  it('refuses before writing anything when no limit is set for a batch', async () => {
    batchLimit = null;
    await mount(planOf(A, B));
    expect(String(text('batch-limit'))).toContain('No batch limit is set');

    await tryWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-refused')).toBeTruthy());

    expect(String(text('batch-refused'))).toContain('Set a limit for a whole batch');
    expect(purchaseLog).toBeNull();
    expect(node.calls).toEqual([]);
  });

  it('refuses a batch that costs more than its limit, even when the account could pay', async () => {
    batchLimit = 5;
    await mount(planOf(A, B));

    await tryWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-refused')).toBeTruthy());

    expect(String(text('batch-refused'))).toContain('more than your batch limit of 5 NCG');
    expect(purchaseLog).toBeNull();
  });

  it('refuses a batch the balance cannot cover', async () => {
    held = 6;
    await mount(planOf(A, B));

    await tryWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-refused')).toBeTruthy());

    expect(String(text('batch-refused'))).toContain('below the total');
    expect(purchaseLog).toBeNull();
  });

  it('skips a piece that was sold meanwhile and carries on with the next', async () => {
    onMarket = [B];
    await mount(planOf(A, B));

    await tryWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-result')).toBeTruthy());

    expect(String(text(`batch-row-${A.productId}`))).toContain('Skipped, nothing moved');
    expect(String(text(`batch-row-${B.productId}`))).toContain('Checked and signed');
    expect(text('batch-result')).toBe(words.batchAllDry(1));
    // The skipped piece moved no money and left no record.
    expect(parsePurchaseLog(purchaseLog).records.map((r) => r.productId)).toEqual([B.productId]);
  });

  it('says a wrong passphrase is wrong, and signs nothing', async () => {
    await mount(planOf(A, B));

    await tryWith('not it');
    await waitFor(() => expect(screen.getByTestId('batch-wrong')).toBeTruthy());

    expect(purchaseLog).toBeNull();
    // It can be tried again.
    expect(screen.getByTestId('batch-try-button')).toBeTruthy();
  });

  it('has nothing to buy when the selection holds nothing a purchase can do, and says what was left out', async () => {
    await mount({ items: [], excluded: 2, total: 0 });

    expect(text('batch-nothing')).toBe(words.batchNothing);
    expect(text('batch-excluded')).toBe(words.batchExcluded(2));
    expect(screen.queryByTestId('batch-try-button')).toBeNull();
  });

  it('points at the You tab when there is no keystore', async () => {
    keystoreText = null;
    await mount(planOf(A));

    expect(screen.getByTestId('batch-no-keystore')).toBeTruthy();
    expect(screen.queryByTestId('batch-try-button')).toBeNull();
  });
});
