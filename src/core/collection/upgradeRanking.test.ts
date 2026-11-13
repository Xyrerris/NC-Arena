/**
 * Grade 8 and 9 rows are the ones the Heimdall node answered with on 2026-10-27 (ADR-0047). The
 * grade 7 curve is shaped so that a +3 holds 4.68 pieces, the cheapest raised grade 7 of that day
 * (5 NCG, R 1.07, 8.9 NCG per Gexp). Items 1, 2 and 3 are synthetic, with 1 Gexp each, so that two
 * grades can tie exactly.
 */

import type { MarketListing } from '../common';
import { parseBaseExp, parseEnhancementExp } from './upgradeExp';
import {
  ceilingAt,
  GRADE_RANGES,
  observedFloors,
  RAMP_START,
  rangeFor,
  rankMaterials,
  scoreMaterial,
} from './upgradeRanking';

const BASE = parseBaseExp(
  [
    'id,_name,item_sub_type,grade,exp',
    '10171000,Valkyrie Sword,Weapon,7,120000000',
    '10181000,Transcendent Sword,Weapon,8,1200000000',
    '10191000,Ultimate Sword,Weapon,9,9600000000',
    '1,Synthetic nine,Weapon,9,1000000000',
    '2,Synthetic eight,Weapon,8,1000000000',
    '3,Synthetic ten,Weapon,10,1000000000',
  ].join('\r\n'),
);

const LEVELS = parseEnhancementExp(
  [
    'id,item_sub_type,grade,level,cost,exp',
    '1,Weapon,7,3,0,562000000',
    '2,Weapon,8,1,0,1280000000',
    '3,Weapon,8,10,140,38400000000',
  ].join('\r\n'),
);

const OPENING = new Date(RAMP_START);

const listing = (over: Partial<MarketListing>): MarketListing => ({
  productId: 'p',
  itemId: 10191000,
  itemSubType: 6,
  level: 0,
  grade: 9,
  elementalType: 0,
  combatPoint: 0,
  price: 100,
  quantity: 1,
  unitPrice: 100,
  hasSkill: false,
  sellerAvatarAddress: '0xavatar',
  sellerAgentAddress: '0xseller',
  tradableId: 't',
  legacy: false,
  registeredBlockIndex: 1,
  ...over,
});

const score = (item: Partial<MarketListing>) => {
  const l = listing(item);
  return scoreMaterial(l, BASE, LEVELS, GRADE_RANGES[l.grade]!, 10);
};

describe('scoreMaterial', () => {
  it('values a grade 9 +0 at its base: k 1, R the price, 9.6 Gexp', () => {
    expect(score({ price: 29 })).toMatchObject({ exp: 9_600_000_000, k: 1, r: 29 });
    expect(score({ price: 29 })?.ng).toBeCloseTo(3.02, 2);
  });

  it('values a grade 8 +10 at 38.4 Gexp, 32 pieces of base', () => {
    const scored = score({ itemId: 10181000, grade: 8, level: 10, price: 100 });

    expect(scored?.k).toBeCloseTo(32, 10);
    expect(scored?.r).toBeCloseTo(3.125, 10);
    expect(scored?.ng).toBeCloseTo(2.604, 3);
  });

  it('puts the cheapest raised grade 7 of the day at R 1.07 and 8.9 NCG per Gexp', () => {
    const scored = score({ itemId: 10171000, grade: 7, level: 3, price: 5 });

    expect(scored?.r).toBeCloseTo(1.07, 2);
    expect(scored?.ng).toBeCloseTo(8.9, 1);
  });

  it('says nothing about a piece the sheets cannot value, never a guess', () => {
    expect(score({ itemId: 999, grade: 9 })).toBeNull();
    // Grade 8 +5 has no row in the curve above.
    expect(score({ itemId: 10181000, grade: 8, level: 5 })).toBeNull();
  });

  it('bands an offer by the optimum and the ceiling', () => {
    const at = (price: number) => score({ price })?.band;

    expect(at(9)).toBe('optimum'); // 0.94 /G
    expect(at(50)).toBe('within'); // 5.2 /G against a ceiling of 10
    expect(at(150)).toBe('over'); // 15.6 /G
  });
});

describe('ceilingAt', () => {
  it('opens at the opening ceiling and does not rise before the start', () => {
    expect(ceilingAt(GRADE_RANGES[9]!, OPENING)).toBeCloseTo(12, 10);
    expect(ceilingAt(GRADE_RANGES[9]!, new Date('2026-01-01'))).toBeCloseTo(12, 10);
  });

  it('falls 30% a month and stops at the target', () => {
    const month = new Date(OPENING.getTime() + 30.4375 * 24 * 3_600_000);
    const afterYear = new Date('2027-12-01');

    expect(ceilingAt(GRADE_RANGES[9]!, month)).toBeCloseTo(8.4, 6);
    expect(ceilingAt(GRADE_RANGES[9]!, afterYear)).toBe(3);
    expect(ceilingAt(GRADE_RANGES[8]!, afterYear)).toBe(2.5);
  });

  it('reaches the grade 9 target in about four months', () => {
    expect(ceilingAt(GRADE_RANGES[9]!, new Date('2027-02-20'))).toBeGreaterThan(3);
    expect(ceilingAt(GRADE_RANGES[9]!, new Date('2027-03-05'))).toBe(3);
  });
});

describe('rangeFor', () => {
  it('knows grades 7, 8 and 9', () => {
    expect(rangeFor(9)).toBe(GRADE_RANGES[9]);
    expect(rangeFor(7)).toBe(GRADE_RANGES[7]);
  });

  it('opens a new grade at 1.1 times its floor, with the lowest target and optimum known', () => {
    expect(rangeFor(10, { 10: 20 })).toEqual({ opening: 22, target: 2.5, optimum: 0.8 });
  });

  it('does not offer a new grade nobody has priced', () => {
    expect(rangeFor(10)).toBeNull();
    expect(rangeFor(10, { 10: 0 })).toBeNull();
  });
});

describe('rankMaterials', () => {
  const rank = (listings: MarketListing[], options = {}) =>
    rankMaterials(listings, BASE, LEVELS, { now: OPENING, ...options });

  const opening = [
    listing({ productId: 'A', price: 100 }), // g9 10.4 /G of 12
    listing({ productId: 'B', itemId: 10181000, grade: 8, price: 10 }), // 8.3 of 11.5
    listing({ productId: 'C', itemId: 10181000, grade: 8, price: 13 }), // 10.8 of 11.5
    listing({ productId: 'D', price: 120 }), // 12.5 of 12: over
    listing({ productId: 'E', itemId: 10171000, grade: 7, level: 3, price: 5 }), // 8.9 of 9.5
    listing({ productId: 'F', itemId: 10171000, grade: 7, price: 1 }), // 8.3 of 9.5
  ];

  it('orders by the share of the ceiling an offer spends, and counts what is over it', () => {
    const ranking = rank(opening);

    expect(ranking.offers.map((offer) => offer.listing.productId)).toEqual([
      'B',
      'A',
      'F',
      'E',
      'C',
    ]);
    expect(ranking.over).toBe(1);
  });

  it('breaks a tie of share towards the higher grade, then the cheaper price, then the id', () => {
    const ceilings = { 9: 10, 8: 10 };
    const tied = rank(
      [
        listing({ productId: 'eight', itemId: 2, grade: 8, price: 5 }),
        listing({ productId: 'nine', itemId: 1, grade: 9, price: 5 }),
        listing({ productId: 'nine-b', itemId: 1, grade: 9, price: 5 }),
      ],
      { ceilings },
    );

    expect(tied.offers.map((offer) => offer.listing.productId)).toEqual([
      'nine',
      'nine-b',
      'eight',
    ]);
  });

  it('keeps only raised pieces on request and says how many +0 pieces that left out', () => {
    const ranking = rank(opening, { onlyRaised: true });

    expect(ranking.offers.map((offer) => offer.listing.productId)).toEqual(['E']);
    expect(ranking.leftOutAtZero).toBe(4);
    expect(ranking.over).toBe(1);
  });

  it('takes the ceiling from the owner when given, per grade', () => {
    const ranking = rank(opening, { ceilings: { 9: 5 } });

    // Both grade 9 pieces are now over a ceiling of 5 /G.
    expect(ranking.over).toBe(2);
    expect(ranking.offers.every((offer) => offer.listing.grade !== 9)).toBe(true);
  });

  it('lowers the ceilings with the date, so a later read keeps fewer offers', () => {
    const cheapSeven = listing({ productId: 'G', itemId: 10171000, grade: 7, price: 0.9 }); // 7.5 /G
    const later = rank([...opening, cheapSeven], { now: new Date('2027-03-05') });

    // Grade 9 ceiling is 3 by now, grade 8 is 2.5, grade 7 is 8: only the 0.9 NCG grade 7 is left.
    expect(later.offers.map((offer) => offer.listing.productId)).toEqual(['G']);
    expect(later.over).toBe(6);
  });

  it('counts what it cannot value, skips the buyer’s own listings, and offers a new grade only with a floor', () => {
    const odd = [
      listing({ productId: 'x', itemId: 999 }),
      listing({ productId: 'mine', sellerAgentAddress: '0xme', price: 1 }),
      listing({ productId: 'ten', itemId: 3, grade: 10, price: 20 }), // 20 /G
    ];

    const without = rank(odd, { ownAgentAddress: '0xme' });
    const priced = rank(odd, { ownAgentAddress: '0xme', floors: { 10: 20 } });

    expect(without.offers).toEqual([]);
    expect(without.unvalued).toBe(2);
    expect(priced.offers.map((offer) => offer.listing.productId)).toEqual(['ten']);
    expect(priced.unvalued).toBe(1);
  });
});

describe('observedFloors', () => {
  it('finds the cheapest price per Gexp of each grade that has no range, and ignores the others', () => {
    const floors = observedFloors(
      [
        listing({ productId: 'a', itemId: 3, grade: 10, price: 30 }),
        listing({ productId: 'b', itemId: 3, grade: 10, price: 20 }),
        listing({ productId: 'c', price: 1 }),
        listing({ productId: 'd', itemId: 999, grade: 11, price: 1 }),
      ],
      BASE,
      LEVELS,
    );

    expect(floors).toEqual({ 10: 20 });
  });
});
