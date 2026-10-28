/**
 * The best offer for every piece the avatar still lacks, across its open collections.
 *
 * Pure: it is given what the avatar holds, the collections and the listings already read, and
 * says what to buy and in which order to show it. Reading the market is `core/data`'s, and which
 * piece is in which state of being read is the screen's; nothing here waits for anything.
 *
 * **Order.** Cheapest total first. On the same price the higher required level comes first — a
 * Long Sword +9 at 1 NCG before a +0 at 1 NCG — then the stronger piece, then the key, so the same
 * market always gives the same list. The level is the *requirement's*: a collection accepts one
 * exact level, so a listing of another level is never an offer (`listingMatches`) — except, when
 * the upgrade costs are given, a single piece a few levels under it that can be raised: its offer
 * is priced at the listing plus the upgrade, and sorted by that total (ADR-0046).
 *
 * **Verdict.** With the costs, every equipment offer is set against the standard price of its level
 * (the cumulative upgrade cost from +0): `good` under it, `fair` up to 30% over, `dear` beyond.
 * `dear` offers leave `offers` for `overpriced`, so the list is not padded with them but the
 * screen can still count and show them.
 *
 * **Distinct.** A listing is offered for one piece only: the cheapest offer takes it, and a piece
 * that wanted it gets its next best, or none (`bestOffers`).
 *
 * **Lots.** A material or a food is sold in lots that are bought whole, and a collection asks for
 * a count. The cheapest way to hold at least `need` units is a small knapsack over the lots, in
 * whole hundredths of NCG so no float is added up. It looks at the cheapest lots by unit price and
 * by total price only, which bounds the work and is exact for every size seen on the market.
 */

import type { AvatarInventory, MarketListing } from '../common';
import type { Collection, CollectionRequirement } from './collectionSheet';
import { matchingListings } from './marketMatch';
import { ownedCount } from './ownership';
import {
  MAX_UPGRADE_GAP,
  standardPrice,
  upgradeNcg,
  verdictFor,
  type EnhancementCosts,
  type Verdict,
} from './upgradeCost';

type Holdings = Pick<AvatarInventory, 'equipment' | 'stackable'>;

/** Item, level and skill state: two requirements of one item at different levels are two pieces. */
export const requirementKey = (requirement: CollectionRequirement): string =>
  `${requirement.itemId}|${requirement.level}|${requirement.skillContains}`;

/** A piece the avatar lacks, with how many units and for which collections. */
export interface MissingPiece {
  readonly key: string;
  readonly requirement: CollectionRequirement;
  /** Units still to find: what the open collections ask for in all, less what is held. Never 0. */
  readonly need: number;
  /** The open collections that ask for it. */
  readonly collectionIds: readonly number[];
}

/**
 * The distinct pieces still missing from the collections `isOpen` accepts, in the sheet's order. A
 * piece several collections ask for is one entry whose `need` adds their counts: each collection
 * takes its own copy, and what the avatar holds is spent once.
 */
export const missingPieces = (
  collections: readonly Collection[],
  holdings: Holdings,
  isOpen: (collection: Collection) => boolean = () => true,
): readonly MissingPiece[] => missingAfterRaising(collections, holdings, isOpen).missing;

/** A piece held below what a collection asks, set aside to be raised instead of bought again. */
export interface HeldToRaise {
  readonly requirement: CollectionRequirement;
  /** The level it is held at. */
  readonly fromLevel: number;
  readonly count: number;
}

/**
 * What is still missing, once the pieces held below a requirement are counted towards it.
 *
 * A held piece is first spent on the requirements of its own exact level, as `ownedCount` does.
 * What is left over of an item (same skill state), from 1 to `MAX_UPGRADE_GAP` levels under a
 * requirement that is still missing, can be raised to it instead of buying another: it is set
 * against that requirement and each piece is used once. The highest requirements are served first,
 * each from the nearest level under it, so the pieces that are closest to a target are not wasted
 * on a lower one. Raising costs materials and NCG that are not counted here (ADR-0046).
 */
export const missingAfterRaising = (
  collections: readonly Collection[],
  holdings: Holdings,
  isOpen: (collection: Collection) => boolean = () => true,
): { readonly missing: readonly MissingPiece[]; readonly raised: readonly HeldToRaise[] } => {
  const asked = new Map<
    string,
    { requirement: CollectionRequirement; total: number; ids: number[] }
  >();
  for (const collection of collections) {
    if (!isOpen(collection)) continue;
    for (const requirement of collection.requirements) {
      const key = requirementKey(requirement);
      const entry = asked.get(key) ?? { requirement, total: 0, ids: [] };
      entry.total += Math.max(1, requirement.count);
      if (!entry.ids.includes(collection.id)) entry.ids.push(collection.id);
      asked.set(key, entry);
    }
  }
  const open = new Map<string, MissingPiece>();
  for (const [key, entry] of asked) {
    const need = entry.total - ownedCount(entry.requirement, holdings);
    if (need > 0) {
      open.set(key, { key, requirement: entry.requirement, need, collectionIds: entry.ids });
    }
  }

  // What is held beyond the exact requirements of its own level, by item, skill state and level.
  const spare = new Map<string, number>();
  for (const piece of holdings.equipment) {
    const key = `${piece.itemId}|${piece.level}|${piece.hasSkill}`;
    spare.set(key, (spare.get(key) ?? 0) + 1);
  }
  for (const [key, count] of spare) {
    spare.set(key, Math.max(0, count - (asked.get(key)?.total ?? 0)));
  }

  const raised: HeldToRaise[] = [];
  const byLevelDesc = [...open.values()].sort((a, b) => b.requirement.level - a.requirement.level);
  for (const piece of byLevelDesc) {
    const { itemId, level, skillContains } = piece.requirement;
    let need = piece.need;
    for (let gap = 1; gap <= MAX_UPGRADE_GAP && need > 0; gap += 1) {
      const from = level - gap;
      if (from < 0) break;
      const held = `${itemId}|${from}|${skillContains}`;
      const take = Math.min(need, spare.get(held) ?? 0);
      if (take === 0) continue;
      spare.set(held, (spare.get(held) as number) - take);
      raised.push({ requirement: piece.requirement, fromLevel: from, count: take });
      need -= take;
    }
    open.set(piece.key, { ...piece, need });
  }

  return {
    missing: [...open.values()].filter((piece) => piece.need > 0),
    raised,
  };
};

const toHundredths = (price: number): number => Math.round(price * 100);

/** How many lots of each ranking the knapsack considers, and the largest need it will solve. */
const LOTS_PER_RANKING = 40;
const MAX_NEED = 20_000;

/**
 * The cheapest set of lots holding at least `need` units, or null when the listings cannot reach it.
 * `candidates` are already the ones that satisfy the requirement.
 */
export const cheapestLots = (
  need: number,
  candidates: readonly MarketListing[],
): readonly MarketListing[] | null => {
  if (need < 1 || need > MAX_NEED) return null;
  const byUnit = [...candidates].sort(
    (a, b) =>
      a.unitPrice - b.unitPrice || a.price - b.price || a.productId.localeCompare(b.productId),
  );
  const byTotal = [...candidates].sort(
    (a, b) =>
      a.price - b.price || b.quantity - a.quantity || a.productId.localeCompare(b.productId),
  );
  const seen = new Set<string>();
  const lots: MarketListing[] = [];
  for (const listing of [
    ...byUnit.slice(0, LOTS_PER_RANKING),
    ...byTotal.slice(0, LOTS_PER_RANKING),
  ]) {
    if (seen.has(listing.productId)) continue;
    seen.add(listing.productId);
    lots.push(listing);
  }

  // best[i][u]: the least whole hundredths that holds at least u units using the first i lots.
  const width = need + 1;
  const best: number[][] = [Array.from({ length: width }, (_, u) => (u === 0 ? 0 : Infinity))];
  lots.forEach((lot, index) => {
    const before = best[index] as number[];
    const cost = toHundredths(lot.price);
    best.push(
      before.map((skip, u) =>
        Math.min(skip, cost + (before[Math.max(0, u - lot.quantity)] as number)),
      ),
    );
  });

  if ((best[lots.length] as number[])[need] === Infinity) return null;
  const picked: MarketListing[] = [];
  let units = need;
  for (let index = lots.length; index > 0 && units > 0; index -= 1) {
    const here = (best[index] as number[])[units] as number;
    // Leaving a lot out wins ties, so the answer has no lot it does not need.
    if (here === (best[index - 1] as number[])[units]) continue;
    const lot = lots[index - 1] as MarketListing;
    picked.push(lot);
    units = Math.max(0, units - lot.quantity);
  }
  return picked.sort(
    (a, b) =>
      a.unitPrice - b.unitPrice || a.price - b.price || a.productId.localeCompare(b.productId),
  );
};

/** A missing piece together with the listings read for it. */
export interface OfferInput extends MissingPiece {
  readonly listings: readonly MarketListing[];
}

export interface Offer {
  readonly key: string;
  readonly requirement: CollectionRequirement;
  readonly need: number;
  readonly collectionIds: readonly number[];
  /** What to buy: one listing for a piece, the cheapest lots that reach `need` for a counted one. */
  readonly picks: readonly MarketListing[];
  /** Units the picks hold: at least `need`, more when the lots do not divide evenly. */
  readonly units: number;
  /** Everything the picks cost to buy, in NCG: what the purchase pays, upgrade not included. */
  readonly price: number;
  readonly combatPoint: number;
  /** The NCG still to spend raising the picks to the requirement's level; 0 for an exact match. */
  readonly upgradeNcg: number;
  /** The level the picks are listed at when they have to be raised, else null. */
  readonly fromLevel: number | null;
  /** `price + upgradeNcg`: what the piece costs by the time it is what the collection asks for. */
  readonly total: number;
  /** `total` against the standard price of the level (ADR-0046); null when there is none. */
  readonly verdict: Verdict | null;
}

export interface BestOffers {
  /** Cheapest first; see the file comment for the order. Offers judged `dear` are not here. */
  readonly offers: readonly Offer[];
  /** The offers set aside as `dear`, in the same order: kept so the screen can count and show them. */
  readonly overpriced: readonly Offer[];
  /** Pieces nothing on the market satisfies (nothing on sale, or too few units). */
  readonly withoutOffer: readonly MissingPiece[];
}

export interface BestOffersOptions {
  /** The buyer's own agent address: its listings are not offers, a purchase would refuse them. */
  readonly excludeSeller?: string;
  /**
   * The upgrade costs. With them, a listing a few levels under the requirement is an offer too
   * (its price plus the upgrade), and every offer gets a verdict. Without, only exact levels.
   */
  readonly costs?: EnhancementCosts;
}

const sameAddress = (a: string, b: string): boolean =>
  a.replace(/^0x/i, '').toLowerCase() === b.replace(/^0x/i, '').toLowerCase();

/**
 * Single pieces of the same item and skill state that are `1..MAX_UPGRADE_GAP` levels under the
 * requirement and can be raised. Each is returned as the listing with the upgrade added to its
 * price, so the knapsack ranks it by what it costs in the end; `raised` remembers the real listing.
 */
const raisable = (
  requirement: CollectionRequirement,
  listings: readonly MarketListing[],
  costs: EnhancementCosts,
  raised: Map<string, { listing: MarketListing; ncg: number }>,
): readonly MarketListing[] => {
  const adjusted: MarketListing[] = [];
  for (const listing of listings) {
    const gap = requirement.level - listing.level;
    if (
      listing.itemId !== requirement.itemId ||
      listing.hasSkill !== requirement.skillContains ||
      listing.quantity !== 1 ||
      gap < 1 ||
      gap > MAX_UPGRADE_GAP
    ) {
      continue;
    }
    const ncg = upgradeNcg(
      costs,
      listing.itemSubType,
      listing.grade,
      listing.level,
      requirement.level,
    );
    if (ncg === null) continue;
    raised.set(listing.productId, { listing, ncg });
    const price = (toHundredths(listing.price) + toHundredths(ncg)) / 100;
    adjusted.push({ ...listing, price, unitPrice: price });
  }
  return adjusted;
};

/** The offer's order: cheapest total, then the higher level, the stronger piece, the key. */
const byOrder = (a: Offer, b: Offer): number =>
  toHundredths(a.total) - toHundredths(b.total) ||
  b.requirement.level - a.requirement.level ||
  b.combatPoint - a.combatPoint ||
  a.key.localeCompare(b.key);

/**
 * The best offer for one piece, leaving out the listings already claimed by another piece and the
 * buyer's own, or null when nothing is left that satisfies it.
 */
const offerFor = (
  input: OfferInput,
  claimed: ReadonlySet<string>,
  own: string | undefined,
  costs: EnhancementCosts | undefined,
): Offer | null => {
  const { listings, ...piece } = input;
  const others = listings.filter(
    (l) => !claimed.has(l.productId) && (own === undefined || !isOwn(l, own)),
  );
  const raised = new Map<string, { listing: MarketListing; ncg: number }>();
  const usable = [
    ...matchingListings(piece.requirement, others),
    ...(costs === undefined ? [] : raisable(piece.requirement, others, costs, raised)),
  ];
  const chosen = cheapestLots(piece.need, usable);
  if (chosen === null || chosen.length === 0) return null;
  // A raised pick stands for its real listing; what the purchase pays is that listing's price.
  const picks = chosen.map((pick) => raised.get(pick.productId)?.listing ?? pick);
  const ncgCents = chosen.reduce(
    (sum, pick) => sum + toHundredths(raised.get(pick.productId)?.ncg ?? 0),
    0,
  );
  const priceCents = picks.reduce((sum, l) => sum + toHundredths(l.price), 0);
  const total = (priceCents + ncgCents) / 100;

  let standard: number | null = costs === undefined ? null : 0;
  for (const pick of picks) {
    const one =
      costs === undefined
        ? null
        : standardPrice(costs, pick.itemSubType, pick.grade, piece.requirement.level);
    standard = standard === null || one === null ? null : standard + one;
  }
  const from = picks.find((pick) => raised.has(pick.productId))?.level ?? null;

  return {
    key: piece.key,
    requirement: piece.requirement,
    need: piece.need,
    collectionIds: piece.collectionIds,
    picks,
    units: picks.reduce((sum, l) => sum + l.quantity, 0),
    price: priceCents / 100,
    combatPoint: picks.reduce((sum, l) => sum + l.combatPoint, 0),
    upgradeNcg: ncgCents / 100,
    fromLevel: from,
    total,
    verdict: standard === null ? null : verdictFor(total, standard),
  };
};

/**
 * One offer per piece, and no listing in two of them: a listing is one physical item, which can
 * satisfy one collection, not a +0 one and a +2 one together. The cheapest offer in the order of
 * `byOrder` takes its listings first; a piece whose best listing was taken is offered its next best,
 * or none. Only the offers that shared a listing with the one just taken are worked out again.
 */
export const bestOffers = (
  inputs: readonly OfferInput[],
  options: BestOffersOptions = {},
): BestOffers => {
  const own = options.excludeSeller;
  const costs = options.costs;
  const claimed = new Set<string>();

  const pending = new Map<string, { input: OfferInput; offer: Offer | null }>();
  for (const input of inputs) {
    pending.set(input.key, { input, offer: offerFor(input, claimed, own, costs) });
  }

  const all: Offer[] = [];
  const withoutOffer: MissingPiece[] = [];
  for (;;) {
    let best: { input: OfferInput; offer: Offer } | null = null;
    for (const { input, offer } of pending.values()) {
      if (offer !== null && (best === null || byOrder(offer, best.offer) < 0)) {
        best = { input, offer };
      }
    }
    if (best === null) break;

    pending.delete(best.input.key);
    all.push(best.offer);
    const taken = new Set(best.offer.picks.map((pick) => pick.productId));
    for (const id of taken) claimed.add(id);
    for (const entry of pending.values()) {
      if (entry.offer?.picks.some((pick) => taken.has(pick.productId))) {
        entry.offer = offerFor(entry.input, claimed, own, costs);
      }
    }
  }
  for (const { input, offer } of pending.values()) {
    if (offer === null) {
      const { listings: _listings, ...piece } = input;
      withoutOffer.push(piece);
    }
  }

  all.sort(byOrder);
  return {
    offers: all.filter((offer) => offer.verdict !== 'dear'),
    overpriced: all.filter((offer) => offer.verdict === 'dear'),
    withoutOffer,
  };
};

const isOwn = (listing: MarketListing, agent: string): boolean =>
  sameAddress(listing.sellerAgentAddress, agent);
