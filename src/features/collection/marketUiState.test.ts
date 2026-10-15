/**
 * The market sheet's wording and choices without rendering anything: which pieces of a collection
 * it offers and in what order, how a price and a seller read, and what a listing line says.
 */

import {
  parseCollectionSheet,
  parseEquipmentCatalog,
  parseOtherItems,
  SAMPLE_SHEET_CSV,
  type Collection,
} from '@/core/collection';
import type { MarketListing } from '@/core/common';

import {
  canSearchMarket,
  cheapestLabel,
  formatNcg,
  marketPieces,
  shortSeller,
  toListingUi,
} from './marketUiState';

const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);
const collection = (id: number): Collection => {
  const found = SHEET.find((c) => c.id === id);
  if (found === undefined) throw new Error(`fixture: no collection ${id}`);
  return found;
};

const catalog = parseEquipmentCatalog(
  [
    'id,_name,item_sub_type,grade,elemental_type',
    '10110000,Long Sword,Weapon,1,Normal',
    '10310000,Plate Armor,Armor,1,Fire',
    '10750000,Old Grimoire,Grimoire,1,Normal',
  ].join('\r\n'),
);

describe('marketPieces', () => {
  it('offers each piece of the collection, named, with the route it is sold through', () => {
    const { pieces, unlisted } = marketPieces(collection(3), catalog);

    expect(pieces.map((p) => [p.label, p.route, p.needsSkill])).toEqual([
      ['Long Sword +0 · Normal', { kind: 'route', itemSubType: 6 }, true],
      ['Plate Armor +0 · Fire', { kind: 'route', itemSubType: 7 }, true],
    ]);
    expect(unlisted).toBe(0);
  });

  it('puts the pieces that have a market before the ones that do not, so the sheet opens on one', () => {
    const withGrimoire: Collection = {
      id: 99,
      bonuses: [],
      requirements: [
        { itemId: 10750000, count: 1, level: 0, skillContains: true },
        { itemId: 10110000, count: 1, level: 0, skillContains: true },
      ],
    };

    const { pieces } = marketPieces(withGrimoire, catalog);

    expect(pieces.map((p) => p.route.kind)).toEqual(['route', 'not-sold']);
  });

  it('counts what it cannot search instead of hiding it', () => {
    const { pieces, unlisted } = marketPieces(collection(1), catalog);

    // 10110000 is known; 10210000 and 10660000 are not in this catalog.
    expect(pieces).toHaveLength(1);
    expect(unlisted).toBe(2);
  });

  it('lists a piece once even if the collection asks for it twice', () => {
    const twice: Collection = {
      id: 98,
      bonuses: [],
      requirements: [
        { itemId: 10110000, count: 1, level: 0, skillContains: true },
        { itemId: 10110000, count: 1, level: 0, skillContains: true },
        // Same item at another level is another piece.
        { itemId: 10110000, count: 1, level: 4, skillContains: true },
      ],
    };

    expect(marketPieces(twice, catalog).pieces.map((p) => p.key)).toEqual([
      '10110000|0|true',
      '10110000|4|true',
    ]);
  });

  it('offers a button only when at least one piece can be looked for', () => {
    expect(canSearchMarket(marketPieces(collection(2), catalog))).toBe(true);
    // Collection 4 is a single Grimoire: known, and not sold.
    expect(canSearchMarket(marketPieces(collection(4), catalog))).toBe(false);
    // Collection 5 is a costume the catalog does not hold.
    expect(canSearchMarket(marketPieces(collection(5), catalog))).toBe(false);
    expect(canSearchMarket(marketPieces(collection(2), new Map()))).toBe(false);
  });
});

describe('marketPieces with costumes and materials', () => {
  const others = parseOtherItems({
    costumeCsv: [
      'id,_name,item_sub_type,grade,elemental_type',
      '40100001,Black Dress,FullCostume,1,Normal',
    ].join('\r\n'),
    materialCsv: [
      'id,_name,item_sub_type,grade,elemental_type',
      '600201,Mithril Dust,EquipmentMaterial,0,Normal',
    ].join('\r\n'),
    consumableCsv: 'id,_name,item_sub_type,grade,elemental_type',
  });
  const mixed: Collection = {
    id: 97,
    bonuses: [],
    requirements: [
      { itemId: 40100001, count: 1, level: 0, skillContains: true },
      { itemId: 600201, count: 5, level: 0, skillContains: false },
      { itemId: 999, count: 1, level: 0, skillContains: false },
    ],
  };

  it('offers a costume and a counted material by name, and the skill flag means nothing for them', () => {
    const { pieces, unlisted } = marketPieces(mixed, catalog, others);

    expect(pieces.map((p) => [p.label, p.route, p.needsSkill, p.count])).toEqual([
      ['Black Dress', { kind: 'route', itemSubType: 1 }, false, 1],
      ['Mithril Dust', { kind: 'route', itemSubType: 11 }, false, 5],
    ]);
    // Item 999 is in no sheet at all: counted, not hidden.
    expect(unlisted).toBe(1);
  });

  it('offers a button for a collection of a costume, which had none before', () => {
    expect(canSearchMarket(marketPieces(collection(5), catalog))).toBe(false);
    const dress = parseOtherItems({
      costumeCsv: [
        'id,_name,item_sub_type,grade,elemental_type',
        '40100001,Black Dress,FullCostume,1,Normal',
      ].join('\r\n'),
      materialCsv: 'id,_name,item_sub_type,grade,elemental_type',
      consumableCsv: 'id,_name,item_sub_type,grade,elemental_type',
    });
    expect(canSearchMarket(marketPieces(collection(5), catalog, dress))).toBe(true);
  });

  it('falls back to the id when the sheet has no name for it', () => {
    const unnamed = parseOtherItems({
      costumeCsv: [
        'id,_name,item_sub_type,grade,elemental_type',
        '40100001,,FullCostume,1,Normal',
      ].join('\r\n'),
      materialCsv: 'id,_name,item_sub_type,grade,elemental_type',
      consumableCsv: 'id,_name,item_sub_type,grade,elemental_type',
    });

    expect(marketPieces(collection(5), catalog, unnamed).pieces[0]?.label).toBe('40100001');
  });
});

describe('formatNcg', () => {
  it('writes whole prices bare and groups thousands the way the app does', () => {
    expect(formatNcg(1)).toBe('1');
    expect(formatNcg(1250)).toBe('1.250');
    expect(formatNcg(0)).toBe('0');
  });

  it('writes up to two decimals with a comma, and drops a trailing zero', () => {
    expect(formatNcg(142.5)).toBe('142,5');
    expect(formatNcg(0.25)).toBe('0,25');
    expect(formatNcg(3.05)).toBe('3,05');
    expect(formatNcg(1234.56)).toBe('1.234,56');
  });

  it('does not show a real price as zero', () => {
    expect(formatNcg(0.004)).toBe('<0,01');
  });
});

describe('shortSeller', () => {
  it('keeps the ends of an address, with or without its prefix', () => {
    expect(shortSeller('ebb88102b3C561168aF72f71fdB9eA1469FDAA63')).toBe('0xebb8…AA63');
    expect(shortSeller('0xebb88102b3C561168aF72f71fdB9eA1469FDAA63')).toBe('0xebb8…AA63');
  });

  it('leaves a short value whole', () => {
    expect(shortSeller('abcd')).toBe('0xabcd');
  });
});

describe('toListingUi', () => {
  it('reads as a price, then combat point and seller, and says the same to a screen reader', () => {
    const listing: MarketListing = {
      productId: '00000000-0000-0000-0000-000000000001',
      itemId: 10110000,
      itemSubType: 6,
      level: 0,
      grade: 1,
      elementalType: 0,
      combatPoint: 12450,
      price: 142.5,
      quantity: 1,
      unitPrice: 142.5,
      hasSkill: true,
      sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
      registeredBlockIndex: 1,
    };

    expect(toListingUi(listing)).toEqual({
      key: '00000000-0000-0000-0000-000000000001',
      price: '142,5 NCG',
      detail: 'CP 12.450 · seller 0xebb8…AA63',
      a11y: '142,5 NCG, CP 12.450 · seller 0xebb8…AA63',
    });
  });

  it('says a lot by its unit price, with the lot and its total below, and no combat point of 0', () => {
    const lot: MarketListing = {
      productId: '00000000-0000-0000-0000-000000000002',
      itemId: 600201,
      itemSubType: 11,
      level: 0,
      grade: 0,
      elementalType: 0,
      combatPoint: 0,
      price: 20,
      quantity: 4,
      unitPrice: 5,
      hasSkill: false,
      sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
      registeredBlockIndex: 1,
    };

    expect(toListingUi(lot)).toEqual({
      key: '00000000-0000-0000-0000-000000000002',
      price: '5 NCG each',
      detail: '4 for 20 NCG · seller 0xebb8…AA63',
      a11y: '5 NCG each, 4 for 20 NCG · seller 0xebb8…AA63',
    });
    expect(cheapestLabel(lot)).toBe('5 NCG each');
    expect(cheapestLabel(undefined)).toBe('');
  });
});
