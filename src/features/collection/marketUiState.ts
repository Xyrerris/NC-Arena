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
  type OtherItemCatalog,
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
  /** Equipment only: what `label` is made of, so it can be said again at another level. */
  readonly equipment?: { readonly name: string; readonly element: string };
  /** Only equipment has a skill to carry: the sheet's flag means nothing for a costume or a material. */
  readonly needsSkill: boolean;
  /** Units the collection asks for: more than 1 only for materials and food, which are sold in lots. */
  readonly count: number;
}

export interface MarketPieces {
  /** The pieces to offer, those with a market first: the first one is what the sheet opens on. */
  readonly pieces: readonly MarketPiece[];
  /** Requirements the sheet cannot search (an item in no sheet, or one with no market route): counted, not hidden. */
  readonly unlisted: number;
}

export const pieceKey = (requirement: CollectionRequirement): string =>
  `${requirement.itemId}|${requirement.level}|${requirement.skillContains}`;

const NO_OTHERS: OtherItemCatalog = new Map();

/** The piece a requirement is, or null when neither catalog can say where it is sold. */
export const marketPieceFor = (
  requirement: CollectionRequirement,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog = NO_OTHERS,
): MarketPiece | null => {
  const route = marketRouteFor(requirement, catalog, others);
  if (route.kind === 'unknown') return null;

  const info = catalog.get(requirement.itemId);
  const other = others.get(requirement.itemId);
  return {
    key: pieceKey(requirement),
    requirement,
    route,
    label:
      info !== undefined
        ? words.piece(info.name, requirement.level, info.element)
        : other !== undefined && other.name !== ''
          ? other.name
          : String(requirement.itemId),
    ...(info === undefined ? {} : { equipment: { name: info.name, element: info.element } }),
    needsSkill: info !== undefined && requirement.skillContains,
    count: requirement.count,
  };
};

/**
 * The piece as the listing sells it. A piece a few levels under the target is bought at its own
 * level and raised afterwards, so the label has to say the level that is paid for, not the target.
 */
export const pieceAsListed = (
  piece: MarketPiece,
  listing: MarketListing | undefined,
): MarketPiece =>
  piece.equipment === undefined ||
  listing === undefined ||
  listing.level === piece.requirement.level
    ? piece
    : {
        ...piece,
        label: words.piece(piece.equipment.name, listing.level, piece.equipment.element),
      };

export const marketPieces = (
  collection: Collection,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog = NO_OTHERS,
): MarketPieces => {
  const seen = new Set<string>();
  const sold: MarketPiece[] = [];
  const notSold: MarketPiece[] = [];
  let unlisted = 0;

  for (const requirement of collection.requirements) {
    const piece = marketPieceFor(requirement, catalog, others);
    if (piece === null) {
      unlisted += 1;
      continue;
    }
    if (seen.has(piece.key)) continue;
    seen.add(piece.key);
    (piece.route.kind === 'route' ? sold : notSold).push(piece);
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

/**
 * What a listing costs, as said: a single piece by its price, a lot by its unit price (lots of
 * different sizes are compared by that, and the whole price is in the detail line).
 */
export const askingPrice = (listing: MarketListing): string =>
  listing.quantity > 1
    ? words.listingEach(formatNcg(listing.unitPrice))
    : `${formatNcg(listing.price)} NCG`;

/** The summary's "from …": the cheapest listing's asking price, per unit when it is a lot. */
export const cheapestLabel = (cheapest: MarketListing | undefined): string =>
  cheapest === undefined ? '' : askingPrice(cheapest);

export const toListingUi = (listing: MarketListing): ListingUi => {
  const price = askingPrice(listing);
  const parts: string[] = [];
  if (listing.quantity > 1) {
    parts.push(words.listingLot(statFormatter.exact(listing.quantity), formatNcg(listing.price)));
  }
  // Combat point is the equipment and costume's; a material has none and "CP 0" would be noise.
  if (listing.combatPoint > 0)
    parts.push(words.listingCp(statFormatter.exact(listing.combatPoint)));
  parts.push(words.listingSeller(shortSeller(listing.sellerAvatarAddress)));
  const detail = parts.join(' · ');
  return { key: listing.productId, price, detail, a11y: `${price}, ${detail}` };
};
