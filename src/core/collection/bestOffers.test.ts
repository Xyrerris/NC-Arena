import type { AvatarInventory, MarketListing } from '../common';
import { bestOffers, cheapestLots, missingPieces, requirementKey } from './bestOffers';
import type { Collection, CollectionRequirement } from './collectionSheet';
import { parseEnhancementCosts } from './upgradeCost';

const inventory = (
  equipment: AvatarInventory['equipment'] = [],
  stackable: [number, number][] = [],
): AvatarInventory => ({ equipment, stackable: new Map(stackable), source: 'node', readAt: 0 });

const req = (
  itemId: number,
  level: number,
  skillContains = false,
  count = 1,
): CollectionRequirement => ({ itemId, level, skillContains, count });

const collection = (id: number, ...requirements: CollectionRequirement[]): Collection => ({
  id,
  requirements,
  bonuses: [],
});

let serial = 0;
const listing = (overrides: Partial<MarketListing> = {}): MarketListing => {
  serial += 1;
  const price = overrides.price ?? 1;
  const quantity = overrides.quantity ?? 1;
  return {
    productId: `p${String(serial).padStart(4, '0')}`,
    itemId: 10110000,
    itemSubType: 6,
    level: 0,
    grade: 1,
    elementalType: 0,
    combatPoint: 1000,
    price,
    quantity,
    unitPrice: price / quantity,
    hasSkill: false,
    sellerAvatarAddress: '0xaaaa',
    sellerAgentAddress: '0xbbbb',
    tradableId: 'g',
    legacy: false,
    registeredBlockIndex: 1,
    ...overrides,
  };
};

const piece = (requirement: CollectionRequirement, need = 1) => ({
  key: requirementKey(requirement),
  requirement,
  need,
  collectionIds: [1],
});

describe('missingPieces', () => {
  it('lists what is not held, once, across collections, and adds the copies each one needs', () => {
    const sheet = [
      collection(1, req(10110000, 9), req(10210000, 0)),
      collection(2, req(10110000, 9)),
    ];
    const held = inventory([{ itemId: 10210000, level: 0, hasSkill: false }]);
    const missing = missingPieces(sheet, held);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ need: 2, collectionIds: [1, 2] });
  });

  it('spends what is held once: one copy held against two collections leaves one to find', () => {
    const sheet = [collection(1, req(10110000, 9)), collection(2, req(10110000, 9))];
    const held = inventory([{ itemId: 10110000, level: 9, hasSkill: false }]);
    expect(missingPieces(sheet, held)[0]?.need).toBe(1);
  });

  it('subtracts a stack from the count a collection asks for, and skips collections not open', () => {
    const sheet = [collection(1, req(201000, 0, false, 5)), collection(2, req(10110000, 0))];
    const missing = missingPieces(sheet, inventory([], [[201000, 3]]), (c) => c.id === 1);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.need).toBe(2);
  });

  it('leaves out a piece that is fully held', () => {
    const sheet = [collection(1, req(201000, 0, false, 5))];
    expect(missingPieces(sheet, inventory([], [[201000, 5]]))).toEqual([]);
  });
});

describe('cheapestLots', () => {
  it('takes the cheapest single listing when one unit is needed, even against a cheaper unit price', () => {
    const lot = listing({ price: 10, quantity: 100 }); // 0.1 each, but 10 NCG to buy
    const single = listing({ price: 2 });
    expect(cheapestLots(1, [lot, single])).toEqual([single]);
  });

  it('reaches a count with the cheapest lots, not with the cheapest unit price alone', () => {
    const big = listing({ price: 100, quantity: 40 }); // 2.5 each
    const a = listing({ price: 20, quantity: 5 }); // 4 each
    const b = listing({ price: 20, quantity: 5 });
    // need 10: a+b costs 40, big alone costs 100.
    expect(
      cheapestLots(10, [big, a, b])
        ?.map((l) => l.productId)
        .sort(),
    ).toEqual([a.productId, b.productId].sort());
  });

  it('may overshoot when that is cheaper than an exact fit', () => {
    const lotOfSix = listing({ price: 6, quantity: 6 });
    const pair = listing({ price: 9, quantity: 2 });
    expect(cheapestLots(5, [lotOfSix, pair])).toEqual([lotOfSix]);
  });

  it('answers null when the market holds too few units', () => {
    expect(cheapestLots(10, [listing({ price: 1, quantity: 4 })])).toBeNull();
    expect(cheapestLots(1, [])).toBeNull();
  });

  it('adds prices in whole hundredths', () => {
    const lots = [listing({ price: 0.1 }), listing({ price: 0.2 }), listing({ price: 0.3 })];
    const offers = bestOffers([{ ...piece(req(10110000, 0), 3), listings: lots }]).offers;
    expect(offers[0]?.price).toBe(0.6);
  });
});

describe('bestOffers', () => {
  it('puts the higher required level first on the same price', () => {
    const plus9 = req(10110000, 9);
    const plus0 = req(10110000, 0);
    const result = bestOffers([
      { ...piece(plus0), listings: [listing({ level: 0, price: 1 })] },
      { ...piece(plus9), listings: [listing({ level: 9, price: 1 })] },
    ]);
    expect(result.offers.map((o) => o.requirement.level)).toEqual([9, 0]);
  });

  it('puts the cheaper total first whatever the level', () => {
    const result = bestOffers([
      { ...piece(req(10110000, 9)), listings: [listing({ level: 9, price: 5 })] },
      { ...piece(req(10210000, 0)), listings: [listing({ itemId: 10210000, price: 1 })] },
    ]);
    expect(result.offers.map((o) => o.price)).toEqual([1, 5]);
  });

  it('breaks a tie of price and level by combat point', () => {
    const a = req(10110000, 0);
    const b = req(10210000, 0);
    const result = bestOffers([
      { ...piece(a), listings: [listing({ price: 1, combatPoint: 100 })] },
      { ...piece(b), listings: [listing({ itemId: 10210000, price: 1, combatPoint: 900 })] },
    ]);
    expect(result.offers.map((o) => o.requirement.itemId)).toEqual([10210000, 10110000]);
  });

  it('never offers a listing of another level or another skill state', () => {
    const wanted = req(10110000, 9, true);
    const result = bestOffers([
      {
        ...piece(wanted),
        listings: [
          listing({ level: 8, hasSkill: true, price: 1 }),
          listing({ level: 9, hasSkill: false, price: 1 }),
          listing({ level: 9, hasSkill: true, price: 7 }),
        ],
      },
    ]);
    expect(result.offers[0]?.price).toBe(7);
  });

  it("skips the buyer's own listings, and reports a piece with nothing left as without an offer", () => {
    const wanted = req(10110000, 0);
    const result = bestOffers(
      [{ ...piece(wanted), listings: [listing({ sellerAgentAddress: '0xBBBB', price: 1 })] }],
      { excludeSeller: 'bbbb' },
    );
    expect(result.offers).toEqual([]);
    expect(result.withoutOffer.map((p) => p.key)).toEqual([requirementKey(wanted)]);
  });

  it('gives the same list whatever order the pieces arrive in', () => {
    const inputs = [req(10110000, 0), req(10210000, 0), req(10310000, 0)].map((r, i) => ({
      ...piece(r),
      listings: [listing({ itemId: r.itemId, price: 1, combatPoint: 5 + (i % 2) })],
    }));
    const first = bestOffers(inputs).offers.map((o) => o.key);
    const second = bestOffers([...inputs].reverse()).offers.map((o) => o.key);
    expect(second).toEqual(first);
  });
});

describe('bestOffers with upgrade costs', () => {
  // Legend (grade 5) weapons, cumulative NCG from +0.
  const costs = parseEnhancementCosts(
    [
      'id,item_sub_type,grade,level,cost,exp',
      ...[0, 0, 0, 20, 40, 80, 160, 320, 640].map(
        (cost, i) => `${i + 1},Weapon,5,${i + 1},${cost},0`,
      ),
    ].join('\r\n'),
  );
  const wanted = req(10110000, 9);
  const legend = (overrides: Partial<MarketListing>): MarketListing =>
    listing({ grade: 5, ...overrides });
  const run = (listings: MarketListing[]) =>
    bestOffers([{ ...piece(wanted), listings }], { costs });

  it('offers a piece a few levels under, priced at the listing plus the upgrade', () => {
    const result = run([legend({ level: 8, price: 100 })]);
    expect(result.offers[0]).toMatchObject({
      price: 100,
      upgradeNcg: 320,
      total: 420,
      fromLevel: 8,
      verdict: 'good',
    });
  });

  it('prefers the cheaper end result, an exact level or a raised one', () => {
    const result = run([
      legend({ level: 9, price: 700, productId: 'exact' }),
      legend({ level: 8, price: 100, productId: 'raised' }),
    ]);
    expect(result.offers.map((o) => o.picks[0]?.productId)).toEqual(['raised']);
    expect(result.offers[0]?.fromLevel).toBe(8);
  });

  it('does not reach further than three levels, nor raise what is not equipment', () => {
    expect(run([legend({ level: 5, price: 1 })]).offers).toEqual([]);
    expect(run([legend({ level: 8, price: 1, quantity: 2 })]).offers).toEqual([]);
    expect(run([legend({ level: 8, price: 1, hasSkill: true })]).offers).toEqual([]);
  });

  it('judges an exact listing against the standard price: 600 good, 900 set aside as dear', () => {
    expect(run([legend({ level: 9, price: 600 })]).offers[0]?.verdict).toBe('good');
    expect(run([legend({ level: 9, price: 800 })]).offers[0]?.verdict).toBe('fair');
    const dear = run([legend({ level: 9, price: 900 })]);
    expect(dear.offers).toEqual([]);
    expect(dear.overpriced).toHaveLength(1);
    expect(dear.withoutOffer).toEqual([]);
  });

  it('adds nothing without the costs: exact levels only, no verdict', () => {
    const result = bestOffers([
      {
        ...piece(wanted),
        listings: [legend({ level: 8, price: 1 }), legend({ level: 9, price: 900 })],
      },
    ]);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ price: 900, verdict: null, upgradeNcg: 0 });
  });
});
