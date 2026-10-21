/**
 * A batch of purchases (ADR-0044, step 2b). What must hold: nothing is bought without a ceiling on
 * the batch or without the money for all of it, the pieces are bought one at a time with the balance
 * the earlier ones left, a piece that moves no money is skipped, and anything not understood ends
 * the batch with the rest untouched.
 */

import type { MarketListing } from './marketSource';
import {
  batchTotal,
  checkBatch,
  continuesAfter,
  runBatch,
  type BatchItem,
  type StepOutcome,
} from './purchaseBatch';

const listing = (n: number, overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId: `product-${n}`,
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 10,
  quantity: 1,
  unitPrice: 10,
  hasSkill: false,
  sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
  legacy: false,
  registeredBlockIndex: 1,
  ...overrides,
});

const item = (n: number, overrides: Partial<MarketListing> = {}): BatchItem => ({
  key: `product-${n}`,
  shown: listing(n, overrides),
  label: `Piece ${n}`,
});

const signed = (n: number): StepOutcome => ({ kind: 'signed', transactionId: `tx-${n}` });
const confirmed = (n: number): StepOutcome => ({ kind: 'confirmed', transactionId: `tx-${n}` });
const refused = (code: 'GONE' | 'SHORT' | 'WRONG_ACCOUNT'): StepOutcome => ({
  kind: 'refused',
  refusal: { code, message: code },
});

describe('batchTotal', () => {
  it('adds the prices in whole hundredths', () => {
    expect(batchTotal([item(1, { price: 0.1 }), item(2, { price: 0.2 })])).toBe(0.3);
  });
});

describe('checkBatch', () => {
  const ok = { batchLimitNcg: 100, balanceNcg: 100 };

  it('lets a batch through when there is a ceiling and the money', () => {
    expect(checkBatch({ items: [item(1), item(2)], ...ok })).toBeNull();
  });

  it('refuses an empty batch', () => {
    expect(checkBatch({ items: [], ...ok })?.code).toBe('EMPTY');
  });

  it('refuses a batch when no ceiling is set: none means no batch', () => {
    expect(checkBatch({ items: [item(1)], ...ok, batchLimitNcg: null })?.code).toBe(
      'NO_BATCH_LIMIT',
    );
  });

  it('refuses a batch that costs more than its ceiling, even when the account could pay', () => {
    const result = checkBatch({
      items: [item(1), item(2)],
      batchLimitNcg: 19.99,
      balanceNcg: 1000,
    });
    expect(result?.code).toBe('OVER_BATCH_LIMIT');
  });

  it('accepts a batch that costs exactly its ceiling', () => {
    expect(checkBatch({ items: [item(1), item(2)], batchLimitNcg: 20, balanceNcg: 20 })).toBeNull();
  });

  it('refuses when the balance is unknown or below the total', () => {
    expect(checkBatch({ items: [item(1)], ...ok, balanceNcg: null })?.code).toBe('NO_BALANCE');
    expect(checkBatch({ items: [item(1), item(2)], ...ok, balanceNcg: 19 })?.code).toBe('SHORT');
  });

  it('refuses the same offer twice, and anything that is not a single piece of equipment', () => {
    expect(checkBatch({ items: [item(1), item(1)], ...ok })?.code).toBe('DUPLICATE');
    expect(checkBatch({ items: [item(1, { itemSubType: 11 })], ...ok })?.code).toBe('NOT_BUYABLE');
    expect(checkBatch({ items: [item(1, { quantity: 5 })], ...ok })?.code).toBe('NOT_BUYABLE');
  });
});

describe('continuesAfter', () => {
  it('goes on after a piece that was bought, and after one that moved no money', () => {
    expect(continuesAfter(signed(1))).toBe(true);
    expect(continuesAfter(confirmed(1))).toBe(true);
    expect(continuesAfter(refused('GONE'))).toBe(true);
  });

  it('stops at everything else, and at the refusals that are about the account', () => {
    expect(continuesAfter(refused('SHORT'))).toBe(false);
    expect(continuesAfter(refused('WRONG_ACCOUNT'))).toBe(false);
    expect(continuesAfter({ kind: 'chain-failed', transactionId: 't', reason: 'x' })).toBe(false);
    expect(continuesAfter({ kind: 'unknown', transactionId: 't', message: 'x' })).toBe(false);
    expect(continuesAfter({ kind: 'not-accepted', message: 'x' })).toBe(false);
    expect(continuesAfter({ kind: 'problem', message: 'x' })).toBe(false);
  });
});

describe('runBatch', () => {
  it('buys the pieces in order, one at a time, with the balance the earlier ones left', async () => {
    const seen: [string, number | null][] = [];
    let inFlight = 0;
    let overlapped = false;
    const result = await runBatch({
      items: [item(1), item(2, { price: 25 }), item(3)],
      balanceNcg: 100,
      buy: async (it, balance) => {
        inFlight += 1;
        overlapped = overlapped || inFlight > 1;
        seen.push([it.key, balance]);
        await Promise.resolve();
        inFlight -= 1;
        return confirmed(seen.length);
      },
    });

    expect(seen).toEqual([
      ['product-1', 100],
      ['product-2', 90],
      ['product-3', 65],
    ]);
    expect(overlapped).toBe(false);
    expect(result.stoppedAt).toBeNull();
    expect(result.notAttempted).toEqual([]);
    expect(result.spentNcg).toBe(45);
  });

  it('skips a piece that moved no money and goes on, without taking its price off the balance', async () => {
    const seen: (number | null)[] = [];
    const outcomes = [refused('GONE'), confirmed(2)];
    const result = await runBatch({
      items: [item(1), item(2)],
      balanceNcg: 50,
      buy: (_it, balance) => {
        seen.push(balance);
        return Promise.resolve(outcomes.shift() as StepOutcome);
      },
    });

    expect(seen).toEqual([50, 50]);
    expect(result.steps.map((s) => s.outcome.kind)).toEqual(['refused', 'confirmed']);
    expect(result.stoppedAt).toBeNull();
    expect(result.spentNcg).toBe(10);
  });

  it('stops at a chain failure and leaves the pieces after it untouched', async () => {
    const bought: string[] = [];
    const outcomes: StepOutcome[] = [
      confirmed(1),
      { kind: 'chain-failed', transactionId: 'tx-2', reason: 'not enough Mead for the fee.' },
      confirmed(3),
    ];
    const result = await runBatch({
      items: [item(1), item(2), item(3)],
      balanceNcg: 100,
      buy: (it) => {
        bought.push(it.key);
        return Promise.resolve(outcomes.shift() as StepOutcome);
      },
    });

    expect(bought).toEqual(['product-1', 'product-2']);
    expect(result.stoppedAt?.item.key).toBe('product-2');
    expect(result.notAttempted.map((i) => i.key)).toEqual(['product-3']);
    expect(result.spentNcg).toBe(10);
  });

  it('stops at doubt: a send with no verdict ends the batch, and is not counted as spent', async () => {
    const result = await runBatch({
      items: [item(1), item(2)],
      balanceNcg: 100,
      buy: () => Promise.resolve({ kind: 'unknown', transactionId: 'tx-1', message: 'no verdict' }),
    });

    expect(result.stoppedAt?.outcome.kind).toBe('unknown');
    expect(result.notAttempted).toHaveLength(1);
    expect(result.spentNcg).toBe(0);
  });

  it('turns a purchase that throws into a stop, with the rest untouched', async () => {
    let calls = 0;
    const result = await runBatch({
      items: [item(1), item(2)],
      balanceNcg: 100,
      buy: () => {
        calls += 1;
        return Promise.reject(new Error('the keystore changed'));
      },
    });

    expect(calls).toBe(1);
    expect(result.stoppedAt?.outcome).toEqual({ kind: 'problem', message: 'the keystore changed' });
    expect(result.notAttempted).toHaveLength(1);
  });

  it('hands an unknown balance on as unknown, never as zero', async () => {
    const seen: (number | null)[] = [];
    await runBatch({
      items: [item(1), item(2)],
      balanceNcg: null,
      buy: (_it, balance) => {
        seen.push(balance);
        return Promise.resolve(signed(1));
      },
    });
    expect(seen).toEqual([null, null]);
  });

  it('tells each piece when it begins and when it ends', async () => {
    const told: string[] = [];
    await runBatch({
      items: [item(1), item(2)],
      balanceNcg: 100,
      buy: () => Promise.resolve(signed(1)),
      onStep: (index, _it, outcome) =>
        told.push(`${index}:${outcome === null ? 'begin' : outcome.kind}`),
    });
    expect(told).toEqual(['0:begin', '0:signed', '1:begin', '1:signed']);
  });
});
