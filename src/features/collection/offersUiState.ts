/**
 * The offers view's view-models: plain values, so which pieces are searched, how an offer reads and
 * what the progress says are testable without rendering.
 *
 * What a missing piece is and which offer is best is `core/collection`'s (`missingPieces`,
 * `bestOffers`); where a piece is sold is `marketPieceFor`'s. This file only joins them and words
 * the result.
 */

import {
  missingPieces,
  type Collection,
  type EquipmentCatalog,
  type MissingPiece,
  type Offer,
  type OtherItemCatalog,
} from '@/core/collection';
import { statFormatter, type AvatarInventory } from '@/core/common';

import {
  askingPrice,
  formatNcg,
  marketPieceFor,
  shortSeller,
  type MarketPiece,
} from './marketUiState';
import { collectionStrings as words } from './strings';

type Holdings = Pick<AvatarInventory, 'equipment' | 'stackable'>;

const NO_HOLDINGS: Holdings = { equipment: [], stackable: new Map() };
const NO_OTHERS: OtherItemCatalog = new Map();

/** The sheet's collections whose ids are in a comma-separated list, in the sheet's order. */
export const collectionsById = (
  sheet: readonly Collection[],
  idList: string,
): readonly Collection[] => {
  const ids = new Set(idList === '' ? [] : idList.split(',').map(Number));
  return sheet.filter((collection) => ids.has(collection.id));
};

/** A missing piece the market can be asked about, with how it is sold. */
export interface OfferTarget {
  readonly missing: MissingPiece;
  readonly piece: MarketPiece;
}

export interface OfferTargets {
  readonly targets: readonly OfferTarget[];
  /** Missing pieces with no market to look in (an item in no sheet, or one that is not sold). */
  readonly unsearchable: number;
}

/**
 * The pieces to read the market for: what the given collections still ask for that the avatar does
 * not hold, split into those with a route and those without. Without a reading of the inventory
 * (`holdings` null) nothing is known to be held, so every piece counts as missing.
 */
export const offerTargets = (
  collections: readonly Collection[],
  holdings: Holdings | null,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog = NO_OTHERS,
): OfferTargets => {
  const targets: OfferTarget[] = [];
  let unsearchable = 0;
  for (const missing of missingPieces(collections, holdings ?? NO_HOLDINGS)) {
    const piece = marketPieceFor(missing.requirement, catalog, others);
    if (piece === null || piece.route.kind !== 'route') {
      unsearchable += 1;
      continue;
    }
    targets.push({ missing, piece });
  }
  return { targets, unsearchable };
};

export interface OfferRowUi {
  readonly key: string;
  readonly title: string;
  readonly price: string;
  readonly detail: string;
  readonly a11y: string;
}

/**
 * One offer as a row. A piece bought singly shows the listing's asking price; a counted piece
 * (several units, from one lot or more) shows what all of it costs, since that is what is paid.
 */
export const toOfferRow = (offer: Offer, piece: MarketPiece): OfferRowUi => {
  const first = offer.picks[0];
  const counted = offer.need > 1 || offer.picks.length > 1;
  const price =
    counted || first === undefined ? words.offersTotal(formatNcg(offer.price)) : askingPrice(first);

  const parts: string[] = [words.offersHelps(offer.collectionIds.length)];
  if (counted) {
    parts.push(words.offersUnits(statFormatter.exact(offer.units), offer.picks.length));
  }
  if (offer.combatPoint > 0) parts.push(words.listingCp(statFormatter.exact(offer.combatPoint)));
  if (offer.picks.length === 1 && first !== undefined) {
    parts.push(words.listingSeller(shortSeller(first.sellerAvatarAddress)));
  }
  const detail = parts.join(' · ');
  return {
    key: offer.key,
    title: counted ? `${piece.label} · ${words.marketNeeds(offer.need)}` : piece.label,
    price,
    detail,
    a11y: `${piece.label}, ${price}, ${detail}`,
  };
};

/** The line under the controls: what is happening, or what came out of it. */
export const offersStatus = (state: {
  readonly phase: 'idle' | 'running' | 'done' | 'stopped';
  readonly total: number;
  readonly done: number;
  readonly offers: number;
  readonly withoutOffer: number;
}): string | null => {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'running':
      return words.offersReading(state.done, state.total);
    case 'stopped':
      return words.offersStopped(state.done, state.total, state.offers);
    case 'done':
      return words.offersDone(state.offers, state.withoutOffer);
  }
};
