import {
  GRADE_RANGES,
  parseBaseExp,
  parseEnhancementExp,
  parseEquipmentCatalog,
  scoreMaterial,
} from '@/core/collection';
import type { MarketListing } from '@/core/common';

import {
  filterListings,
  parseCeiling,
  readingStatus,
  selectionTitle,
  toMaterialRow,
  upgradePlan,
} from './upgradeUiState';

const EQUIPMENT = [
  'id,_name,item_sub_type,grade,elemental_type,exp',
  '10181000,Transcendent Sword,Weapon,8,Fire,1200000000',
  '10281000,Transcendent Armor,Armor,8,Water,1200000000',
  '10191000,Ultimate Sword,Weapon,9,Fire,9600000000',
].join('\r\n');
const BASE = parseBaseExp(EQUIPMENT);
const CATALOG = parseEquipmentCatalog(EQUIPMENT);
const LEVELS = parseEnhancementExp(
  ['id,item_sub_type,grade,level,cost,exp', '1,Weapon,8,1,0,1280000000'].join('\r\n'),
);

const listing = (productId: string, over: Partial<MarketListing> = {}): MarketListing => ({
  productId,
  itemId: 10181000,
  itemSubType: 6,
  level: 1,
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

const scored = (item: MarketListing) =>
  scoreMaterial(item, BASE, LEVELS, GRADE_RANGES[item.grade]!, 11.5)!;

describe('filterListings', () => {
  const all = [
    listing('a'),
    listing('b', { itemId: 10281000, itemSubType: 7 }),
    listing('c', { itemId: 10191000, grade: 9, level: 0 }),
  ];

  it('keeps everything with no filter, and narrows by grade and by slot', () => {
    const ids = (grade: number | null, slot: string | null) =>
      filterListings(all, BASE, { grade, slot }).map((l) => l.productId);

    expect(ids(null, null)).toEqual(['a', 'b', 'c']);
    expect(ids(9, null)).toEqual(['c']);
    expect(ids(null, 'Armor')).toEqual(['b']);
    expect(ids(8, 'Weapon')).toEqual(['a']);
  });
});

describe('parseCeiling', () => {
  it('reads a positive number with a comma or a point, and nothing else', () => {
    expect(parseCeiling('2,5')).toBe(2.5);
    expect(parseCeiling(' 3.25 ')).toBe(3.25);
    expect(parseCeiling('')).toBeNull();
    expect(parseCeiling('0')).toBeNull();
    expect(parseCeiling('-1')).toBeNull();
    expect(parseCeiling('abc')).toBeNull();
  });
});

describe('toMaterialRow', () => {
  it('names the piece with its level and element, and says what it costs and gives', () => {
    const row = toMaterialRow(scored(listing('a', { price: 10 })), CATALOG);

    expect(row.label).toBe('Transcendent Sword +1 · Fire');
    expect(row.price).toBe('10 NCG');
    expect(row.detail).toBe('7,81 NCG per Gexp · 1,28 Gexp · 9,38 NCG per +0 piece');
    expect(row.band).toBe('in range');
  });

  it('calls a very cheap piece a bargain, and an unknown item by its id', () => {
    const cheap = toMaterialRow(scored(listing('a', { price: 1 })), CATALOG);
    const unknown = toMaterialRow(scored(listing('a')), new Map());

    expect(cheap.band).toBe('bargain');
    expect(unknown.label).toBe('10181000 +1');
  });
});

describe('upgradePlan', () => {
  it('buys each chosen listing in order and totals them', () => {
    const plan = upgradePlan(
      [scored(listing('a', { price: 10 })), scored(listing('b', { price: 4.5 }))],
      CATALOG,
    );

    expect(plan.items.map((item) => [item.key, item.label])).toEqual([
      ['a', 'Transcendent Sword +1 · Fire'],
      ['b', 'Transcendent Sword +1 · Fire'],
    ]);
    expect(plan.total).toBe(14.5);
    expect(plan.excluded).toBe(0);
  });

  it('leaves out and counts a listing a purchase cannot do (not a single piece)', () => {
    const plan = upgradePlan(
      [scored(listing('a')), scored(listing('lot', { quantity: 3, unitPrice: 3, price: 9 }))],
      CATALOG,
    );

    expect(plan.items.map((item) => item.key)).toEqual(['a']);
    expect(plan.excluded).toBe(1);
  });
});

describe('selectionTitle and readingStatus', () => {
  it('words the selection and the progress of a read', () => {
    expect(selectionTitle([scored(listing('a', { price: 10 })), scored(listing('b'))])).toBe(
      '2 pieces selected · 20 NCG',
    );
    expect(readingStatus('idle', 0, 5)).toBeNull();
    expect(readingStatus('running', 2, 5)).toBe('Reading the market: 2 of 5 items…');
    expect(readingStatus('stopped', 2, 5)).toBe('Read 2 of 5 items.');
  });
});
