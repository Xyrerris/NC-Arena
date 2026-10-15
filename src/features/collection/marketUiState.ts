/**
 * The market sheet's view-models: plain values, so every sentence and every choice of what to
 * show is testable without rendering (ADR-0044, "Next: buying").
 *
 * What a listing *is* and which one a requirement accepts is `core/collection`'s
 * (`matchingListings`); where a piece is sold is its `marketRouteFor`. This file decides which
 * pieces of a collection the sheet offers, and how a price and a seller are worded.
 */

import {
  marketRouteFor,
  type Collection,
  type CollectionRequirement,
  type EquipmentCatalog,
  type MarketRoute,
} from '@/core/collection';
import { statFormatter, type MarketListing } from '@/core/common';

import { collectionStrings as words } from './strings';

/** Listings drawn in the sheet. The rest are counted: the cheapest ones are what is asked for. */
export const MAX_SHOWN_LISTINGS = 50;

/** One piece of a collection that the market can be asked about. */
export interface MarketPiece {
  /** Item, level and skill state: two requirements of one item at different levels are two pieces. */
  readonly key: string;
  readonly requirement: CollectionRequirement;
  readonly route: Extract<MarketRoute, { kind: 'route' | 'not-sold' }>;
  readonly label: string;
  readonly needsSkill: boolean;
}

export interface MarketPieces {
  /** The pieces to offer, those with a market first: the first one is what the sheet opens on. */
  readonly pieces: readonly MarketPiece[];
  /** Requirements the sheet cannot search yet (costumes, materials): counted, not hidden. */
  readonly unlisted: number;
}

export const pieceKey = (requirement: CollectionRequirement): string =>
  `${requirement.itemId}|${requirement.level}|${requirement.skillContains}`;

export const marketPieces = (collection: Collection, catalog: EquipmentCatalog): MarketPieces => {
  const seen = new Set<string>();
  const sold: MarketPiece[] = [];
  const notSold: MarketPiece[] = [];
  let unlisted = 0;

  for (const requirement of collection.requirements) {
    const route = marketRouteFor(requirement, catalog);
    if (route.kind === 'unknown') {
      unlisted += 1;
      continue;
    }
    const key = pieceKey(requirement);
    if (seen.has(key)) continue;
    seen.add(key);

    const info = catalog.get(requirement.itemId);
    const piece: MarketPiece = {
      key,
      requirement,
      route,
      label:
        info === undefined
          ? String(requirement.itemId)
          : words.piece(info.name, requirement.level, info.element),
      needsSkill: requirement.skillContains,
    };
    (route.kind === 'route' ? sold : notSold).push(piece);
  }
  return { pieces: [...sold, ...notSold], unlisted };
};

/** Whether the row gets a button: at least one of its pieces has a market to look in. */
export const canSearchMarket = (offered: MarketPieces): boolean =>
  offered.pieces.some((piece) => piece.route.kind === 'route');

/**
 * `142,5`, `1.250`, `0,25`: the app's punctuation (ADR-0025), two decimals at most and none when
 * the price is whole. Done in whole hundredths so no floating-point `toFixed` is involved
 * (ARCHITECTURE.md §2.2); a price under a hundredth is shown as such rather than as `0`.
 */
export const formatNcg = (price: number): string => {
  const hundredths = Math.round(price * 100);
  if (hundredths === 0 && price > 0) return '<0,01';
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  const grouped = statFormatter.exact(whole);
  if (fraction === 0) return grouped;
  const digits = String(fraction).padStart(2, '0').replace(/0$/, '');
  return `${grouped},${digits}`;
};

/** `0xebb8…AA63`: enough to tell sellers apart, short enough to share a line with the price. */
export const shortSeller = (address: string): string => {
  const bare = address.replace(/^0x/i, '');
  return bare.length <= 8 ? `0x${bare}` : `0x${bare.slice(0, 4)}…${bare.slice(-4)}`;
};

export interface ListingUi {
  readonly key: string;
  readonly price: string;
  readonly detail: string;
  readonly a11y: string;
}

export const toListingUi = (listing: MarketListing): ListingUi => {
  const price = `${formatNcg(listing.price)} NCG`;
  const cp = words.listingCp(statFormatter.exact(listing.combatPoint));
  const detail = `${cp} · ${words.listingSeller(shortSeller(listing.sellerAvatarAddress))}`;
  return { key: listing.productId, price, detail, a11y: `${price}, ${detail}` };
};
