import type { Offer } from '@/core/collection';
import type { MarketListing } from '@/core/common';
import { batchLines, totalLine } from '@/core/purchase';

import { batchPlan } from './batchUiState';
import type { MarketPiece } from './marketUiState';

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

const requirement = { itemId: 10110000, level: 0, skillContains: false, count: 1 };
const piece = (label: string): MarketPiece => ({
  key: label,
  requirement,
  route: { kind: 'route', itemSubType: 6 },
  label,
  needsSkill: false,
  count: 1,
});
const offer = (picks: MarketListing[], need = picks.length): Offer => ({
  key: picks[0]?.productId ?? 'k',
  requirement,
  need,
  collectionIds: [1],
  picks,
  units: picks.reduce((sum, l) => sum + l.quantity, 0),
  price: picks.reduce((sum, l) => sum + l.price, 0),
  combatPoint: 0,
  upgradeNcg: 0,
  fromLevel: null,
  total: picks.reduce((sum, l) => sum + l.price, 0),
  verdict: null,
});

describe('batchPlan', () => {
  it('turns every lot of every offer into one purchase, in order, with the total', () => {
    const plan = batchPlan([
      { offer: offer([listing('a', { price: 3 })]), piece: piece('Long Sword +0') },
      {
        offer: offer([listing('b', { price: 4 }), listing('c', { price: 5 })]),
        piece: piece('Plate Armor +0'),
      },
    ]);

    expect(plan.items.map((i) => [i.key, i.label])).toEqual([
      ['a', 'Long Sword +0'],
      ['b', 'Plate Armor +0'],
      ['c', 'Plate Armor +0'],
    ]);
    expect(plan.excluded).toBe(0);
    expect(plan.total).toBe(12);
    expect(totalLine(plan)).toBe('3 pieces · 12 NCG in all');
    expect(batchLines(plan)[0]).toEqual({ key: 'a', text: 'Long Sword +0 · 3 NCG' });
  });

  it('leaves out an offer that is not single equipment, whole, and counts it', () => {
    const plan = batchPlan([
      { offer: offer([listing('a')]), piece: piece('Long Sword +0') },
      {
        offer: offer([listing('m', { itemSubType: 11, quantity: 5, unitPrice: 1, price: 5 })], 5),
        piece: piece('Mithril Dust'),
      },
      // One lot of equipment and one that is not: the offer is bought whole or not at all.
      {
        offer: offer([listing('x'), listing('y', { quantity: 2 })]),
        piece: piece('Mixed'),
      },
    ]);

    expect(plan.items.map((i) => i.key)).toEqual(['a']);
    expect(plan.excluded).toBe(2);
  });

  it('is empty for an empty selection', () => {
    expect(batchPlan([])).toEqual({ items: [], excluded: 0, total: 0 });
  });
});
