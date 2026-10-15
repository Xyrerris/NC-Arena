/**
 * Which listing satisfies which requirement, and where to look (ADR-0044, "Next: buying"). The
 * rule is lib9c's `Requirement.Validate`, so each case below is one of its three terms or one of
 * the ways a listing of the right item is still the wrong piece.
 */

import type { MarketListing } from '../common';
import type { CollectionRequirement } from './collectionSheet';
import { parseEquipmentCatalog } from './equipmentCatalog';
import { listingMatches, marketRouteFor, matchingListings } from './marketMatch';
import { parseOtherItems } from './otherItems';

const requirement = (
  itemId: number,
  level: number,
  skillContains: boolean,
): CollectionRequirement => ({ itemId, count: 1, level, skillContains });

const listing = (overrides: Partial<MarketListing> = {}): MarketListing => {
  const made = {
    productId: '00000000-0000-0000-0000-000000000001',
    itemId: 10110000,
    itemSubType: 6,
    level: 4,
    grade: 1,
    elementalType: 0,
    combatPoint: 1000,
    price: 10,
    quantity: 1,
    hasSkill: true,
    sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
    registeredBlockIndex: 1,
    ...overrides,
  };
  // The unit price follows the price unless a test sets both, as the service's own rows do.
  return { ...made, unitPrice: overrides.unitPrice ?? made.price / made.quantity };
};

describe('listingMatches', () => {
  const needs = requirement(10110000, 4, true);

  it('accepts the same item, level and skill state', () => {
    expect(listingMatches(needs, listing())).toBe(true);
  });

  it('refuses another level, even of the right item', () => {
    expect(listingMatches(needs, listing({ level: 3 }))).toBe(false);
    expect(listingMatches(needs, listing({ level: 5 }))).toBe(false);
  });

  it('refuses another item: the element is part of the id', () => {
    // 10111000 is the Fire Long Sword; 10110000 the Normal one.
    expect(listingMatches(needs, listing({ itemId: 10111000 }))).toBe(false);
  });

  it('wants a skill when the sheet says SkillContains, and none when it says otherwise', () => {
    expect(listingMatches(needs, listing({ hasSkill: false }))).toBe(false);
    const noSkill = requirement(10110000, 4, false);
    expect(listingMatches(noSkill, listing({ hasSkill: false }))).toBe(true);
    // A piece with a skill is not a piece with none: it is the other requirement.
    expect(listingMatches(noSkill, listing({ hasSkill: true }))).toBe(false);
  });
});

describe('matchingListings', () => {
  const needs = requirement(10110000, 0, false);
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  it('keeps only what is accepted, cheapest first', () => {
    const all = [
      listing({ productId: id(1), level: 0, hasSkill: false, price: 30 }),
      listing({ productId: id(2), level: 0, hasSkill: false, price: 5 }),
      listing({ productId: id(3), level: 0, hasSkill: true, price: 1 }),
      listing({ productId: id(4), level: 2, hasSkill: false, price: 2 }),
    ];

    expect(matchingListings(needs, all).map((l) => l.productId)).toEqual([id(2), id(1)]);
  });

  it('breaks a price tie by combat point, then by listing id, so the order never shuffles', () => {
    const all = [
      listing({ productId: id(9), level: 0, hasSkill: false, price: 7, combatPoint: 100 }),
      listing({ productId: id(3), level: 0, hasSkill: false, price: 7, combatPoint: 500 }),
      listing({ productId: id(2), level: 0, hasSkill: false, price: 7, combatPoint: 100 }),
    ];

    expect(matchingListings(needs, all).map((l) => l.productId)).toEqual([id(3), id(2), id(9)]);
  });

  it('compares lots by unit price: five at 2 each beats one at 3, whatever the lot costs', () => {
    const material = requirement(600201, 0, false);
    const all = [
      listing({ productId: id(1), itemId: 600201, level: 0, hasSkill: false, price: 3 }),
      listing({
        productId: id(2),
        itemId: 600201,
        level: 0,
        hasSkill: false,
        price: 10,
        quantity: 5,
      }),
    ];

    expect(matchingListings(material, all).map((l) => l.productId)).toEqual([id(2), id(1)]);
  });

  it('is empty when nothing is accepted, and leaves the scan untouched', () => {
    const all = [listing({ level: 9 })];

    expect(matchingListings(needs, all)).toEqual([]);
    expect(all).toHaveLength(1);
  });
});

describe('marketRouteFor', () => {
  const catalog = parseEquipmentCatalog(
    [
      'id,_name,item_sub_type,grade,elemental_type',
      '10110000,Long Sword,Weapon,1,Normal',
      '10210000,Plate Armor,Armor,1,Normal',
      '10310000,Belt,Belt,1,Normal',
      '10410000,Necklace,Necklace,1,Normal',
      '10510000,Ring,Ring,1,Normal',
      '10610000,Aura,Aura,1,Normal',
      '10710000,Grimoire,Grimoire,1,Normal',
      '10810000,Something New,Shield,1,Normal',
    ].join('\r\n'),
  );
  const route = (itemId: number) => marketRouteFor(requirement(itemId, 0, true), catalog);

  it("routes each equipment type through lib9c's ItemSubType number", () => {
    expect([10110000, 10210000, 10310000, 10410000, 10510000].map(route)).toEqual([
      { kind: 'route', itemSubType: 6 },
      { kind: 'route', itemSubType: 7 },
      { kind: 'route', itemSubType: 8 },
      { kind: 'route', itemSubType: 9 },
      { kind: 'route', itemSubType: 10 },
    ]);
  });

  it('says Aura and Grimoire are not sold, rather than that nobody is selling them', () => {
    expect(route(10610000)).toEqual({ kind: 'not-sold' });
    expect(route(10710000)).toEqual({ kind: 'not-sold' });
  });

  it('does not know an item no catalog has, or a type it was not told about', () => {
    // A costume is not in the equipment catalog; a new sub type is not in ROUTES.
    expect(route(40100001)).toEqual({ kind: 'unknown' });
    expect(route(10810000)).toEqual({ kind: 'unknown' });
  });

  it('routes costumes, titles, food and materials through the other-items catalog', () => {
    const others = parseOtherItems({
      costumeCsv: [
        'id,_name,item_sub_type,grade,elemental_type',
        '40100001,Dress,FullCostume,1,Normal',
        '49900011,Champion,Title,1,Normal',
      ].join('\r\n'),
      materialCsv: [
        'id,_name,item_sub_type,grade,elemental_type',
        '600201,Mithril Dust,EquipmentMaterial,1,Normal',
        '400000,Hourglass,Hourglass,1,Normal',
        '500000,AP Stone,ApStone,1,Normal',
        '800201,Herb,FoodMaterial,1,Normal',
      ].join('\r\n'),
      consumableCsv: [
        'id,_name,item_sub_type,grade,elemental_type',
        '201000,Tea,Food,1,Normal',
      ].join('\r\n'),
    });
    const routeOf = (itemId: number) =>
      marketRouteFor(requirement(itemId, 0, false), catalog, others);

    expect([40100001, 49900011, 600201, 400000, 500000, 201000].map(routeOf)).toEqual([
      { kind: 'route', itemSubType: 1 },
      { kind: 'route', itemSubType: 18 },
      { kind: 'route', itemSubType: 11 },
      { kind: 'route', itemSubType: 15 },
      { kind: 'route', itemSubType: 16 },
      { kind: 'route', itemSubType: 0 },
    ]);
    // Probed on no route: unknown, not "not sold". And an equipment id still wins its own route.
    expect(routeOf(800201)).toEqual({ kind: 'unknown' });
    expect(routeOf(10110000)).toEqual({ kind: 'route', itemSubType: 6 });
  });
});
