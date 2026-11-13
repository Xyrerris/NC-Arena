/**
 * Grade 8 rows are the ones the Heimdall node answered with on 2026-10-27 (ADR-0047): base 1.2 G,
 * +1 1.28 G, +2 2.56 G, +10 38.4 G. The NCG costs are shaped for the test.
 */

import type { MarketListing } from '../common';
import { parseEnhancementCosts } from './upgradeCost';
import { maxLevelOf, planUpgrade } from './upgradePlan';
import { parseBaseExp, parseEnhancementExp } from './upgradeExp';
import { GRADE_RANGES, scoreMaterial, type ScoredMaterial } from './upgradeRanking';

const BASE = parseBaseExp(
  [
    'id,_name,item_sub_type,grade,exp',
    '10181000,Transcendent Sword,Weapon,8,1200000000',
    '10191000,Ultimate Sword,Weapon,9,9600000000',
    '5,Half Sword,Weapon,8,600000000',
  ].join('\r\n'),
);
const SHEET = [
  'id,item_sub_type,grade,level,cost,exp',
  '1,Weapon,8,1,0,1280000000',
  '2,Weapon,8,2,50,2560000000',
  '3,Weapon,8,3,120,3840000000',
  '4,Weapon,8,10,140,38400000000',
].join('\r\n');
const LEVELS = parseEnhancementExp(SHEET);
const COSTS = parseEnhancementCosts(SHEET);

const listing = (productId: string, over: Partial<MarketListing>): MarketListing => ({
  productId,
  itemId: 10181000,
  itemSubType: 6,
  level: 0,
  grade: 8,
  elementalType: 0,
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

const offer = (productId: string, over: Partial<MarketListing>): ScoredMaterial => {
  const grade = over.grade ?? 8;
  return scoreMaterial(listing(productId, over), BASE, LEVELS, GRADE_RANGES[grade]!, 99)!;
};

// A +0 grade 8 sword holds its base, 1.2 G; it is to be raised to +2 (2.56 G): 1.36 G to gain.
const TARGET = { itemId: 10181000, level: 0, exp: 1_200_000_000 };

describe('maxLevelOf', () => {
  it('is the highest level the sheet has for the piece, and unknown for a piece it lacks', () => {
    expect(maxLevelOf(BASE, LEVELS, 10181000)).toBe(10);
    expect(maxLevelOf(BASE, LEVELS, 10191000)).toBeNull();
    expect(maxLevelOf(BASE, LEVELS, 1)).toBeNull();
  });
});

describe('planUpgrade', () => {
  it('needs the target level’s experience less what the piece already holds', () => {
    const plan = planUpgrade(TARGET, 2, [], BASE, LEVELS, COSTS)!;

    expect(plan.neededExp).toBe(1_360_000_000);
    expect(plan.upgradeNcg).toBe(50);
    expect(plan.picks).toEqual([]);
    expect(plan.shortfall).toBe(1_360_000_000);
  });

  it('buys the cheapest per Gexp first and swaps the last for the cheapest that covers the rest', () => {
    const cheap = offer('cheap', { level: 1, price: 11 }); // 1.28 G, 8.6 per Gexp
    const dear = offer('dear', { price: 13 }); // 1.2 G, 10.8 per Gexp
    const ok = offer('ok', { price: 12 }); // 1.2 G, 10 per Gexp

    const plan = planUpgrade(TARGET, 2, [dear, cheap, ok], BASE, LEVELS, COSTS)!;

    // 1.28 G from `cheap`, then 0.08 G still missing: `ok` (12) covers it for less than `dear` (13).
    expect(plan.picks.map((pick) => pick.listing.productId)).toEqual(['cheap', 'ok']);
    expect(plan.materialNcg).toBe(23);
    expect(plan.materialExp).toBe(2_480_000_000);
    expect(plan.surplus).toBe(1_120_000_000);
    expect(plan.shortfall).toBe(0);
    expect(plan.total).toBe(73);
    expect(plan.actions).toBe(1);
  });

  it('takes one big piece when it covers everything for less than the set', () => {
    const small1 = offer('s1', { level: 1, price: 11 });
    const small2 = offer('s2', { price: 12 });
    const big = offer('big', { itemId: 10191000, grade: 9, price: 20 }); // 9.6 G

    const plan = planUpgrade(TARGET, 2, [small1, small2, big], BASE, LEVELS, COSTS)!;

    expect(plan.picks.map((pick) => pick.listing.productId)).toEqual(['big']);
    expect(plan.materialNcg).toBe(20);
  });

  it('says how much is missing when the offers fall short, and asks for nothing when none is needed', () => {
    const only = offer('only', { price: 12 });

    const short = planUpgrade(TARGET, 10, [only], BASE, LEVELS, COSTS)!;
    const enough = planUpgrade({ ...TARGET, exp: 2_600_000_000 }, 2, [only], BASE, LEVELS, COSTS);

    expect(short.shortfall).toBe(38_400_000_000 - 1_200_000_000 - 1_200_000_000);
    expect(short.picks).toHaveLength(1);
    // The piece already holds more than +2 needs, but `to` is above its level: nothing to buy.
    expect(enough?.neededExp).toBe(0);
    expect(enough?.picks).toEqual([]);
    expect(enough?.shortfall).toBe(0);
  });

  it('counts the actions at 50 materials each', () => {
    // Half pieces of 0.6 G: 38.4 G from nothing takes 64 of them, two actions.
    const halves = Array.from({ length: 70 }, (_, index) =>
      offer(`h${index}`, { itemId: 5, price: 10 }),
    );
    const wholes = Array.from({ length: 40 }, (_, index) => offer(`w${index}`, { price: 10 }));

    const two = planUpgrade({ ...TARGET, exp: 0 }, 10, halves, BASE, LEVELS, COSTS)!;
    const one = planUpgrade({ ...TARGET, exp: 0 }, 10, wholes, BASE, LEVELS, COSTS)!;

    expect(two.picks).toHaveLength(64);
    expect(two.actions).toBe(2);
    expect(one.picks).toHaveLength(32);
    expect(one.actions).toBe(1);
  });

  it('has no upgrade cost without the cost sheet, and then no total', () => {
    const plan = planUpgrade(TARGET, 2, [offer('a', { price: 10 })], BASE, LEVELS, null)!;

    expect(plan.upgradeNcg).toBeNull();
    expect(plan.total).toBeNull();
  });

  it('gives no plan for a level not above the piece, past the sheet, or a piece it does not know', () => {
    expect(planUpgrade(TARGET, 0, [], BASE, LEVELS, COSTS)).toBeNull();
    expect(planUpgrade(TARGET, 11, [], BASE, LEVELS, COSTS)).toBeNull();
    expect(planUpgrade({ ...TARGET, itemId: 1 }, 2, [], BASE, LEVELS, COSTS)).toBeNull();
  });
});
