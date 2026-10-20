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
 * exact level, so a listing of another level is never an offer (`listingMatches`).
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
): readonly MissingPiece[] => {
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
  const missing: MissingPiece[] = [];
  for (const [key, entry] of asked) {
    const need = entry.total - ownedCount(entry.requirement, holdings);
    if (need > 0) {
      missing.push({ key, requirement: entry.requirement, need, collectionIds: entry.ids });
    }
  }
  return missing;
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
  /** Everything the picks cost, in NCG. */
  readonly price: number;
  readonly combatPoint: number;
}

export interface BestOffers {
  /** Cheapest first; see the file comment for the order. */
  readonly offers: readonly Offer[];
  /** Pieces nothing on the market satisfies (nothing on sale, or too few units). */
  readonly withoutOffer: readonly MissingPiece[];
}

export interface BestOffersOptions {
  /** The buyer's own agent address: its listings are not offers, a purchase would refuse them. */
  readonly excludeSeller?: string;
}

const sameAddress = (a: string, b: string): boolean =>
  a.replace(/^0x/i, '').toLowerCase() === b.replace(/^0x/i, '').toLowerCase();

export const bestOffers = (
  inputs: readonly OfferInput[],
  options: BestOffersOptions = {},
): BestOffers => {
  const offers: Offer[] = [];
  const withoutOffer: MissingPiece[] = [];
  const own = options.excludeSeller;

  for (const input of inputs) {
    const { listings, ...piece } = input;
    const usable = matchingListings(
      piece.requirement,
      own === undefined
        ? listings
        : listings.filter((l) => !sameAddress(l.sellerAgentAddress, own)),
    );
    const picks = cheapestLots(piece.need, usable);
    if (picks === null || picks.length === 0) {
      withoutOffer.push(piece);
      continue;
    }
    offers.push({
      key: piece.key,
      requirement: piece.requirement,
      need: piece.need,
      collectionIds: piece.collectionIds,
      picks,
      units: picks.reduce((sum, l) => sum + l.quantity, 0),
      price: picks.reduce((sum, l) => sum + toHundredths(l.price), 0) / 100,
      combatPoint: picks.reduce((sum, l) => sum + l.combatPoint, 0),
    });
  }

  offers.sort(
    (a, b) =>
      toHundredths(a.price) - toHundredths(b.price) ||
      b.requirement.level - a.requirement.level ||
      b.combatPoint - a.combatPoint ||
      a.key.localeCompare(b.key),
  );
  return { offers, withoutOffer };
};
