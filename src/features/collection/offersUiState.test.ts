import type { Collection, EquipmentCatalog, Offer } from '@/core/collection';
import type { MarketListing } from '@/core/common';

import type { MarketPiece } from './marketUiState';
import {
  arrangeOffers,
  collectionsById,
  offerLevels,
  offerTargets,
  offersStatus,
  selectionSummary,
  toOfferRow,
} from './offersUiState';

const SWORD = { itemId: 10110000, level: 9, skillContains: false, count: 1 };
const catalog: EquipmentCatalog = new Map([
  [10110000, { name: 'Long Sword', subType: 'Weapon', element: 'Normal' } as never],
]);

const collection = (id: number, ...requirements: (typeof SWORD)[]): Collection => ({
  id,
  requirements,
  bonuses: [],
});

const listing = (overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId: 'p1',
  itemId: 10110000,
  itemSubType: 6,
  level: 9,
  grade: 1,
  elementalType: 0,
  combatPoint: 1200,
  price: 3,
  quantity: 1,
  unitPrice: 3,
  hasSkill: false,
  sellerAvatarAddress: '0xebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  sellerAgentAddress: '0xaaaa',
  tradableId: 'g',
  legacy: false,
  registeredBlockIndex: 1,
  ...overrides,
});

const piece: MarketPiece = {
  key: '10110000|9|false',
  requirement: SWORD,
  route: { kind: 'route', itemSubType: 6 },
  label: 'Long Sword +9 · Normal',
  needsSkill: false,
  count: 1,
};

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  key: piece.key,
  requirement: SWORD,
  need: 1,
  collectionIds: [1],
  picks: [listing()],
  units: 1,
  price: 3,
  combatPoint: 1200,
  upgradeNcg: 0,
  fromLevel: null,
  total: 3,
  verdict: null,
  ...overrides,
});

describe('offerTargets', () => {
  it('lists what is missing with a route, and counts the rest as not searchable', () => {
    const unknown = { itemId: 999, level: 0, skillContains: false, count: 1 };
    const result = offerTargets([collection(1, SWORD, unknown)], null, catalog);
    expect(result.targets.map((t) => t.piece.key)).toEqual(['10110000|9|false']);
    expect(result.unsearchable).toBe(1);
  });

  it('drops what the bag holds', () => {
    const held = {
      equipment: [{ itemId: 10110000, level: 9, hasSkill: false }],
      stackable: new Map<number, number>(),
    };
    expect(offerTargets([collection(1, SWORD)], held, catalog)).toEqual({
      targets: [],
      unsearchable: 0,
    });
  });
});

describe('collectionsById', () => {
  const sheet = [collection(1, SWORD), collection(2, SWORD), collection(3, SWORD)];

  it('keeps the sheet order and ignores ids it does not have', () => {
    expect(collectionsById(sheet, '3,1,9').map((c) => c.id)).toEqual([1, 3]);
  });

  it('is empty for an empty list', () => {
    expect(collectionsById(sheet, '')).toEqual([]);
  });
});

describe('toOfferRow', () => {
  it('shows a single piece by its asking price, with its seller and what it helps', () => {
    const ui = toOfferRow(offer({ collectionIds: [1, 2] }), piece);
    expect(ui.title).toBe('Long Sword +9 · Normal');
    expect(ui.price).toBe('3 NCG');
    expect(ui.detail).toBe('helps 2 collections · CP 1.200 · seller 0xebb8…AA63');
  });

  it('names a raised piece at the level it is sold at, not the target it will reach', () => {
    const equipment = { name: 'Long Sword', element: 'Normal' };
    const ui = toOfferRow(
      offer({
        picks: [listing({ level: 3, price: 5 })],
        price: 5,
        upgradeNcg: 20,
        fromLevel: 3,
        total: 25,
      }),
      { ...piece, equipment },
    );
    expect(ui.title).toBe('Long Sword +3 · Normal');
    expect(ui.detail).toContain('bought as +3 at 5 NCG · +20 NCG to raise it to +9');
  });

  it('shows a counted piece by what all of it costs, and says how many lots', () => {
    const lots = [listing({ productId: 'a', price: 4 }), listing({ productId: 'b', price: 6 })];
    const ui = toOfferRow(offer({ need: 2, picks: lots, units: 2, price: 10 }), piece);
    expect(ui.title).toBe('Long Sword +9 · Normal · needs 2');
    expect(ui.price).toBe('10 NCG');
    expect(ui.detail).toContain('2 units in 2 lots');
    expect(ui.detail).not.toContain('seller');
  });
});

describe('arrangeOffers', () => {
  const equipment = { name: 'Long Sword', element: 'Normal' };
  const row = (id: string, level: number | null, total: number) => ({
    offer: offer({
      key: id,
      picks: [listing({ productId: id, level: level ?? 0 })],
      price: total,
      total,
    }),
    piece: level === null ? piece : { ...piece, equipment },
  });
  const rows = [
    row('a', 3, 5),
    row('b', 9, 40),
    row('c', null, 1),
    row('d', 9, 30),
    row('e', 0, 2),
  ];
  const ids = (list: readonly { offer: Offer }[]) => list.map((r) => r.offer.key);

  it('lists the levels sold, highest first, leaving out what has none', () => {
    expect(offerLevels(rows)).toEqual([9, 3, 0]);
  });

  it('keeps the order it was given when sorting by price', () => {
    expect(ids(arrangeOffers(rows, 'price', null))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sorts by level, highest first, cheaper first within a level, no level last', () => {
    expect(ids(arrangeOffers(rows, 'level', null))).toEqual(['d', 'b', 'a', 'e', 'c']);
  });

  it('keeps one level only, and drops what has no level', () => {
    expect(ids(arrangeOffers(rows, 'price', 9))).toEqual(['b', 'd']);
  });
});

describe('selectionSummary', () => {
  const cheap = (price: number) => offer({ key: `k${price}`, price, picks: [listing({ price })] });

  it('adds the asking prices in whole hundredths', () => {
    const ui = selectionSummary([cheap(0.1), cheap(0.2)], null);
    expect(ui.total).toBe(0.3);
    expect(ui.title).toBe('2 offers selected · 0,3 NCG');
  });

  it('says what would be left, or how much is short, once the balance is known', () => {
    const enough = selectionSummary([cheap(3)], { kind: 'known', ncg: 10 });
    expect(enough.enough).toBe('yes');
    expect(enough.afterLine).toBe('Would leave 7 NCG');

    const short = selectionSummary([cheap(3), cheap(9)], { kind: 'known', ncg: 10 });
    expect(short.enough).toBe('short');
    expect(short.afterLine).toBe('2 NCG short of the price');
  });

  it('never calls a balance it could not read short, and says it is still being read', () => {
    const unknown = selectionSummary([cheap(3)], { kind: 'unknown', why: 'offline' });
    expect(unknown.enough).toBe('unknown');
    expect(unknown.afterLine).toBeNull();
    expect(unknown.balanceLine).toBe('Your balance is unknown: the chain could not be reached.');

    expect(selectionSummary([cheap(3)], null).balanceLine).toBe('Reading your balance…');
  });

  it('counts the units of counted offers, and says nothing of them for single pieces', () => {
    expect(selectionSummary([cheap(3)], null).units).toBeNull();
    const counted = offer({ need: 5, units: 6, price: 12 });
    expect(selectionSummary([counted], null).units).toBe('6 units in all');
  });
});

describe('offersStatus', () => {
  const base = { total: 10, done: 4, offers: 3, withoutOffer: 1 };

  it('says nothing before a read, how far it is during one, and what came out of it after', () => {
    expect(offersStatus({ ...base, phase: 'idle' })).toBeNull();
    expect(offersStatus({ ...base, phase: 'running' })).toContain('4 of 10 pieces');
    expect(offersStatus({ ...base, phase: 'done' })).toBe(
      '3 offers found, 1 with nothing on sale.',
    );
    expect(offersStatus({ ...base, phase: 'stopped' })).toContain('the rest not read');
  });
});
