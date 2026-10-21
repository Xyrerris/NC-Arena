/**
 * The purchase card in live mode (ADR-0044, step D), with a fake sender: nothing here reaches a node.
 *
 * The build's own switch (`LIVE_SENDING_BUILT`) stays off, so `resolveMode` is replaced in this file
 * to let the live card be rendered at all; what is under test is the card's behaviour once a person
 * has turned real purchases on. The point of each case: pressing the first button never pays, only
 * the confirmation does, and whatever the answer is, the card says it plainly.
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

import type { MarketPiece } from './marketUiState';
import { PurchaseCard } from './PurchaseCard';

jest.mock('@/core/common/purchasePolicy', () => {
  const actual = jest.requireActual('@/core/common/purchasePolicy');
  return {
    ...actual,
    // The build's switch is off; here a stored `live` is honoured so the live card can be seen.
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

const listing: MarketListing = {
  productId: '00000000-0000-0000-0000-000000000003',
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 3,
  quantity: 1,
  unitPrice: 3,
  hasSkill: true,
  sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: '00000000-0000-0000-0000-0000000000aa',
  legacy: false,
  registeredBlockIndex: 1,
};

const piece: MarketPiece = {
  key: 'k',
  requirement: { itemId: 10110000, count: 1, level: 0, skillContains: true },
  route: { kind: 'route', itemSubType: 6 },
  label: 'Long Sword +0',
  needsSkill: true,
  count: 1,
};

describe('PurchaseCard, live', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let node: FakeTransactionNode;
  let staged: Uint8Array[];
  let stageAnswer: 'accept' | 'refuse';
  let finalStatus: 'SUCCESS' | 'FAILURE';
  let keystoreText: string | null;
  let purchaseLog: string | null;

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
    getBatchLimit: () => null,
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
      return Promise.resolve(
        stageAnswer === 'refuse'
          ? err({ kind: 'REFUSED' as const, message: 'nonce too old' })
          : ok(transactionId(signed)),
      );
    },
    result: () =>
      Promise.resolve(
        ok({
          status: finalStatus,
          blockIndex: 9,
          exceptions:
            finalStatus === 'FAILURE' ? ['Nekoyume.Exceptions.ProductNotFoundException'] : [],
        }),
      ),
  };

  const wrapper = () =>
    function Harness({ children }: { children: ReactNode }) {
      const market = {
        scan: jest.fn(() => Promise.resolve(ok({ listings: [listing], readAt: 1 }))),
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
              balance: { name: 'test', readNcg: () => Promise.resolve(ok(50)) },
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
    stageAnswer = 'accept';
    finalStatus = 'SUCCESS';
    keystoreText = writeTestKeystore(PASSPHRASE);
    purchaseLog = null;
    await render(
      <PurchaseCard planet="heimdall" piece={piece} listing={listing} onBack={() => {}} />,
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(screen.getByTestId('purchase-buy-button')).toBeTruthy());
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
    await press('purchase-buy-button');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('purchase-passphrase'), passphrase);
    });
    await press('purchase-confirm-button');
  };

  it('shows a button that carries the price, says the purchase is real, and pays nothing by itself', async () => {
    expect(screen.queryByTestId('purchase-try-button')).toBeNull();
    expect(text('purchase-dry-note')).toContain('spends NCG');

    await press('purchase-buy-button');

    expect(text('purchase-confirm-warning')).toBe(
      'You are about to pay 3 NCG for Long Sword +0. The payment cannot be undone once it is sent.',
    );
    expect(screen.getByTestId('purchase-confirm-button')).toBeTruthy();
    // Opening the confirmation asked the node nothing and sent nothing.
    expect(staged).toEqual([]);
    expect(node.calls).toEqual([]);
    expect(purchaseLog).toBeNull();
  });

  it('goes back from the confirmation without paying', async () => {
    await press('purchase-buy-button');

    await press('purchase-confirm-cancel');

    expect(screen.queryByTestId('purchase-confirm')).toBeNull();
    expect(screen.getByTestId('purchase-buy-button')).toBeTruthy();
    expect(staged).toEqual([]);
  });

  it('pays after the confirmation with the right passphrase, waits for the chain and says it is bought', async () => {
    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('purchase-attempt-settled')).toBeTruthy());

    expect(String(text('purchase-attempt-settled'))).toContain('Bought.');
    expect(staged).toHaveLength(1);
    const [record] = parsePurchaseLog(purchaseLog).records;
    expect(record).toMatchObject({
      productId: '00000000-0000-0000-0000-000000000003',
      mode: 'live',
      status: 'confirmed',
      price: 3,
    });
    expect(record?.transactionId).toBe(transactionId(staged[0] as Uint8Array));
    // No button offers to buy it again.
    expect(screen.queryByTestId('purchase-buy-button')).toBeNull();
    expect(screen.queryByTestId('purchase-confirm-button')).toBeNull();
  });

  it('stages nothing for a wrong passphrase', async () => {
    await confirmWith('nope');
    await waitFor(() => expect(screen.getByTestId('purchase-attempt-wrong')).toBeTruthy());

    expect(staged).toEqual([]);
    expect(purchaseLog).toBeNull();
  });

  it('says a node that refused the send bought nothing, and the offer can be tried again', async () => {
    stageAnswer = 'refuse';

    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('purchase-attempt-done')).toBeTruthy());

    expect(String(text('purchase-attempt-done'))).toContain('nothing was bought');
    expect(parsePurchaseLog(purchaseLog).records[0]?.status).toBe('failed');
    expect(screen.getByTestId('purchase-buy-button')).toBeTruthy();
  });

  it('says the chain refused it, with the reason, when the transaction fails on chain', async () => {
    finalStatus = 'FAILURE';

    await confirmWith(PASSPHRASE);
    await waitFor(() => expect(screen.getByTestId('purchase-attempt-settled')).toBeTruthy());

    expect(String(text('purchase-attempt-settled'))).toBe(
      'The chain refused it, so nothing was bought: the piece was already sold or withdrawn.',
    );
    expect(parsePurchaseLog(purchaseLog).records[0]?.status).toBe('failed');
  });
});
