import type { MarketListing } from '@/core/common';
import type { BatchItem, BatchResult, StepOutcome } from '@/core/common/purchaseBatch';

import { describeResult, describeStep, planOf } from './batchState';

const listing = (productId: string, overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId,
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 3,
  quantity: 1,
  unitPrice: 3,
  hasSkill: false,
  sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: 'g',
  legacy: false,
  registeredBlockIndex: 1,
  ...overrides,
});

describe('planOf', () => {
  it('totals the items the way the batch will spend them, and keeps the count left out', () => {
    const items: BatchItem[] = [
      { key: 'a', shown: listing('a', { price: 3 }), label: 'A' },
      { key: 'b', shown: listing('b', { price: 4.5 }), label: 'B' },
    ];

    expect(planOf(items, 2)).toEqual({ items, excluded: 2, total: 7.5 });
    expect(planOf([])).toEqual({ items: [], excluded: 0, total: 0 });
  });
});

describe('describeStep', () => {
  it('words each outcome, and never calls a piece of unknown fate failed', () => {
    const say = (outcome: StepOutcome) => describeStep(outcome);

    expect(say({ kind: 'confirmed', transactionId: 'abcdef0123456789' }).text).toBe(
      'Bought (0xabcdef…6789).',
    );
    expect(say({ kind: 'signed', transactionId: 'abcdef0123456789' }).text).toContain(
      'nothing sent',
    );
    expect(say({ kind: 'refused', refusal: { code: 'GONE', message: 'It is gone.' } })).toEqual({
      tone: 'subtle',
      text: 'Skipped, nothing moved: It is gone.',
    });
    expect(say({ kind: 'chain-failed', transactionId: 't', reason: 'no Mead.' }).text).toBe(
      'The chain refused it, nothing was bought: no Mead.',
    );

    const unknown = say({
      kind: 'unknown',
      transactionId: 'abcdef0123456789',
      message: 'No verdict.',
    });
    expect(unknown.tone).toBe('negative');
    expect(unknown.text).toContain('Do not buy this piece again');
    expect(unknown.text).not.toMatch(/failed/i);
  });
});

describe('describeResult', () => {
  const item = (key: string): BatchItem => ({ key, shown: listing(key, { price: 3 }), label: key });
  const done = (key: string, outcome: StepOutcome) => ({ item: item(key), outcome });

  it('says a whole dry run was checked and signed, and nothing was sent', () => {
    const result: BatchResult = {
      steps: [done('a', { kind: 'signed', transactionId: 't' })],
      stoppedAt: null,
      notAttempted: [],
      spentNcg: 3,
    };
    expect(describeResult(result, true).text).toBe('1 piece checked and signed. Nothing was sent.');
  });

  it('says a whole real batch was bought, for how much', () => {
    const result: BatchResult = {
      steps: [
        done('a', { kind: 'confirmed', transactionId: 't' }),
        done('b', { kind: 'confirmed', transactionId: 'u' }),
      ],
      stoppedAt: null,
      notAttempted: [],
      spentNcg: 6,
    };
    expect(describeResult(result, false)).toEqual({
      tone: 'accent',
      text: 'All 2 pieces bought for 6 NCG.',
    });
  });

  it('says where a batch stopped, how many were left alone, and what was spent before it', () => {
    const stopped = done('b', { kind: 'chain-failed', transactionId: 'u', reason: 'x' });
    const result: BatchResult = {
      steps: [done('a', { kind: 'confirmed', transactionId: 't' }), stopped],
      stoppedAt: stopped,
      notAttempted: [item('c'), item('d')],
      spentNcg: 3,
    };
    const ui = describeResult(result, false);

    expect(ui.tone).toBe('negative');
    expect(ui.text).toBe(
      'The batch stopped at b. 2 pieces were not attempted. Spent so far: 3 NCG.',
    );
  });
});
