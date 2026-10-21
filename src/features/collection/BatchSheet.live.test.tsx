/**
 * The batch sheet in live mode (ADR-0044, the cart, step 2b), with a fake sender: nothing here
 * reaches a node.
 *
 * The build's own switch (`LIVE_SENDING_BUILT`) stays off, so `resolveMode` is replaced in this file
 * to let the live sheet be rendered at all; what is under test is the batch's behaviour once a person
 * has turned real purchases on. The points: the first button never pays, only the confirmation does;
 * the pieces are sent one at a time, each settled before the next; and the batch stops at the first
 * thing that goes wrong and leaves the rest untouched.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type MarketListing, type TransactionSender } from '@/core/common';
import { parsePurchaseLog } from '@/core/common/purchaseLog';
import { transactionId } from '@/core/common/transaction';
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

jest.mock('@/core/common/purchasePolicy', () => {
  const actual = jest.requireActual('@/core/common/purchasePolicy');
  return {
    ...actual,
    // The build's switch is off; here a stored `live` is honoured so the live sheet can be seen.
    resolveMode: (stored: string | null) => (stored === 'live' ? 'live' : 'dry-run'),
  };
});

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
const PLAN: BatchPlan = {
  items: [A, B].map((l) => ({ key: l.productId, shown: l, label: 'Long Sword +0' })),
  excluded: 0,
  total: 7,
};

describe('BatchSheet, live', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let node: FakeTransactionNode;
  let staged: Uint8Array[];
  let order: string[];
  let stageAnswer: 'accept' | 'refuse-first';
  let results: ('SUCCESS' | 'FAILURE')[];
  let keystoreText: string | null;
  let purchaseLog: string | null;
  let held: number;
  let batchLimit: number | null;

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
    getLimit: () => 100,
    setLimit: () => {},
    getBatchLimit: () => batchLimit,
    setBatchLimit: () => {},
    getLog: () => purchaseLog,
    setLog: (json) => {
      purchaseLog = json;
    },
    getMode: () => 'live',
    setMode: () => {},
  };
  const sender: TransactionSender = {
    name: 'fake',
    stage: (_planet, signed) => {
      staged.push(signed);
      order.push('stage');
      return Promise.resolve(
        stageAnswer === 'refuse-first' && staged.length === 1
          ? err({ kind: 'REFUSED' as const, message: 'nonce too old' })
          : ok(transactionId(signed)),
      );
    },
    result: () => {
      // The chain's answer for the transaction staged last, one verdict per piece, in order.
      const verdict = results[Math.max(0, staged.length - 1)] ?? 'SUCCESS';
      order.push('look');
      return Promise.resolve(
        ok({
          status: verdict,
          blockIndex: 9,
          exceptions:
            verdict === 'FAILURE' ? ['Nekoyume.Exceptions.InsufficientBalanceException'] : [],
        }),
      );
    },
  };

  const wrapper = () =>
    function Harness({ children }: { children: ReactNode }) {
      const market = {
        scan: jest.fn(() => Promise.resolve(ok({ listings: [A, B], readAt: 1 }))),
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
              sender,
            }}
          >
            {children}
          </ArenaDataProvider>
        </SafeAreaProvider>
      );
    };

  beforeEach(async () => {
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
    staged = [];
    order = [];
    stageAnswer = 'accept';
    results = ['SUCCESS', 'SUCCESS'];
    keystoreText = writeTestKeystore(PASSPHRASE);
    purchaseLog = null;
    held = 50;
    batchLimit = 20;
    await render(<BatchSheet planet="heimdall" plan={PLAN} onClose={() => {}} />, {
      wrapper: wrapper(),
    });
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const press = async (testID: string): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };
  const text = (testID: string): unknown => screen.getByTestId(testID).props.children;
  const confirmWith = async (passphrase: string): Promise<void> => {
    await press('batch-buy-button');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('batch-passphrase'), passphrase);
    });
    await press('batch-confirm-button');
  };

  it('shows a button that carries the total, says it is real, and pays nothing by itself', async () => {
    expect(screen.queryByTestId('batch-try-button')).toBeNull();
    expect(text('batch-mode-note')).toContain('spends NCG');

    await press('batch-buy-button');

    expect(text('batch-confirm-warning')).toBe(words.batchWarning(2, '7'));
    expect(screen.getByTestId('batch-confirm-button')).toBeTruthy();
    // Opening the confirmation asked the node nothing, sent nothing and wrote nothing.
    expect(staged).toEqual([]);
    expect(node.calls).toEqual([]);
    expect(purchaseLog).toBeNull();
  });

  it('goes back from the confirmation without paying', async () => {
    await press('batch-buy-button');

    await press('batch-confirm-cancel');

    expect(screen.queryByTestId('batch-confirm')).toBeNull();
    expect(screen.getByTestId('batch-buy-button')).toBeTruthy();
    expect(staged).toEqual([]);
  });

  it('pays every piece, one at a time, each settled before the next, and records them', async () => {
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-result')).toBeTruthy());

    expect(text('batch-result')).toBe(words.batchAllBought(2, '7'));
    // Staged, then looked at until decided, and only then the next one.
    expect(order).toEqual(['stage', 'look', 'stage', 'look']);
    const records = parsePurchaseLog(purchaseLog).records;
    expect(records.map((r) => [r.productId, r.mode, r.status, r.price])).toEqual([
      [A.productId, 'live', 'confirmed', 3],
      [B.productId, 'live', 'confirmed', 4],
    ]);
    expect(records[0]?.transactionId).toBe(transactionId(staged[0] as Uint8Array));
    expect(records[1]?.transactionId).toBe(transactionId(staged[1] as Uint8Array));
    expect(screen.queryByTestId('batch-buy-button')).toBeNull();
  });

  it('stops when the chain refuses a piece, and leaves the rest untouched', async () => {
    results = ['FAILURE'];
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-result')).toBeTruthy());

    expect(staged).toHaveLength(1);
    expect(String(text(`batch-row-${A.productId}`))).toContain('The chain refused it');
    expect(text(`batch-row-${B.productId}`)).toBe(words.batchRowNotAttempted);
    expect(String(text('batch-result'))).toContain(words.batchStopped('Long Sword +0', 1));
    // The refused piece is free again; the one never reached has no record at all.
    expect(parsePurchaseLog(purchaseLog).records.map((r) => [r.productId, r.status])).toEqual([
      [A.productId, 'failed'],
    ]);
  });

  it('stops when the node does not accept a piece, so nothing after it is sent', async () => {
    stageAnswer = 'refuse-first';
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-result')).toBeTruthy());

    expect(staged).toHaveLength(1);
    expect(String(text(`batch-row-${A.productId}`))).toContain('did not accept it');
    expect(text(`batch-row-${B.productId}`)).toBe(words.batchRowNotAttempted);
  });

  it('refuses before touching the node when the account cannot cover the total', async () => {
    held = 5;
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-refused')).toBeTruthy());

    expect(String(text('batch-refused'))).toContain('below the total');
    expect(staged).toEqual([]);
    expect(purchaseLog).toBeNull();
  });

  it('refuses when no limit is set for a batch, even in live mode', async () => {
    batchLimit = null;
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('batch-refused')).toBeTruthy());

    expect(String(text('batch-refused'))).toContain('Set a limit for a whole batch');
    expect(staged).toEqual([]);
  });

  it('does not pay with a wrong passphrase', async () => {
    await confirmWith('not it');
    await waitFor(() => expect(screen.getByTestId('batch-wrong')).toBeTruthy());

    expect(staged).toEqual([]);
    expect(purchaseLog).toBeNull();
  });
});
