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
  type Verdict,
} from '@/core/collection';
import { statFormatter, type AvatarInventory } from '@/core/common';

import {
  askingPrice,
  formatNcg,
  marketPieceFor,
  pieceAsListed,
  shortSeller,
  type MarketPiece,
} from './marketUiState';
import { balanceMessage, type BalanceState } from './purchaseCardState';
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

const VERDICT_WORDS: Readonly<Record<Verdict, string>> = {
  good: words.offersVerdictGood,
  fair: words.offersVerdictFair,
  dear: words.offersVerdictDear,
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
export const toOfferRow = (offer: Offer, target: MarketPiece): OfferRowUi => {
  const first = offer.picks[0];
  // What is bought, at the level it is sold at: a raised piece is not yet the target's level.
  const piece = pieceAsListed(target, first);
  const counted = offer.need > 1 || offer.picks.length > 1;
  const raised = offer.upgradeNcg > 0 && offer.fromLevel !== null;
  // A raised piece shows what it costs in the end, so it sorts and reads like the rest.
  const price = raised
    ? words.offersTotal(formatNcg(offer.total))
    : counted || first === undefined
      ? words.offersTotal(formatNcg(offer.price))
      : askingPrice(first);

  const parts: string[] = [];
  if (offer.verdict !== null) parts.push(VERDICT_WORDS[offer.verdict]);
  parts.push(words.offersHelps(offer.collectionIds.length));
  if (raised && offer.fromLevel !== null) {
    parts.push(
      words.offersRaise(
        offer.fromLevel,
        offer.requirement.level,
        formatNcg(offer.price),
        formatNcg(offer.upgradeNcg),
      ),
    );
  }
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

export type OfferSort = 'price' | 'level';

/** The level a piece is bought at; null for what has none (a costume, a material). */
export const offerLevel = (offer: Offer, piece: MarketPiece): number | null =>
  piece.equipment === undefined ? null : (offer.picks[0]?.level ?? null);

/** The distinct levels the offers are sold at, highest first: the choices of the level filter. */
export const offerLevels = <T extends { offer: Offer; piece: MarketPiece }>(
  rows: readonly T[],
): readonly number[] => {
  const levels = new Set<number>();
  for (const row of rows) {
    const level = offerLevel(row.offer, row.piece);
    if (level !== null) levels.add(level);
  }
  return [...levels].sort((a, b) => b - a);
};

/**
 * The rows as the person asked to see them: only one level when `level` is given, and by price
 * (the order they come in) or by level, highest first, the cheaper first within a level. What has
 * no level goes last.
 */
export const arrangeOffers = <T extends { offer: Offer; piece: MarketPiece }>(
  rows: readonly T[],
  sort: OfferSort,
  level: number | null,
): readonly T[] => {
  const kept =
    level === null ? rows : rows.filter((row) => offerLevel(row.offer, row.piece) === level);
  if (sort === 'price') return kept;
  const rank = (row: T): number => offerLevel(row.offer, row.piece) ?? -1;
  return [...kept].sort((a, b) => rank(b) - rank(a) || a.offer.total - b.offer.total);
};

export interface SelectionUi {
  readonly count: number;
  /** Everything the selected offers cost, in NCG, as the sum of their asking prices. */
  readonly total: number;
  readonly title: string;
  /** Units held by counted offers, when any is selected: a count of pieces would hide them. */
  readonly units: string | null;
  readonly balanceLine: string;
  readonly afterLine: string | null;
  /** What the selected pieces still cost to raise after they are bought, when any have to be. */
  readonly raiseLine: string | null;
  /** `short` only when the balance is known and below the total. */
  readonly enough: 'yes' | 'short' | 'unknown';
}

const hundredths = (ncg: number): number => Math.round(ncg * 100);

/**
 * What the selected offers add up to and whether the account covers it. Prices are added in whole
 * hundredths so no float is summed, and a balance that is not known is never "short".
 */
export const selectionSummary = (
  selected: readonly Offer[],
  balance: BalanceState | null,
): SelectionUi => {
  const cents = selected.reduce((sum, offer) => sum + hundredths(offer.price), 0);
  const total = cents / 100;
  const raiseCents = selected.reduce((sum, offer) => sum + hundredths(offer.upgradeNcg), 0);
  const units = selected.some((offer) => offer.need > 1)
    ? words.offersBarUnits(statFormatter.exact(selected.reduce((sum, o) => sum + o.units, 0)))
    : null;

  let enough: SelectionUi['enough'] = 'unknown';
  let afterLine: string | null = null;
  if (balance?.kind === 'known') {
    const left = hundredths(balance.ncg) - cents;
    enough = left >= 0 ? 'yes' : 'short';
    afterLine =
      left >= 0
        ? words.purchaseLeft(formatNcg(left / 100))
        : words.purchaseShort(formatNcg(-left / 100));
  }
  return {
    count: selected.length,
    total,
    title: words.offersBarTitle(selected.length, formatNcg(total)),
    units,
    balanceLine: balance === null ? words.offersBarReading : balanceMessage(balance),
    afterLine,
    raiseLine: raiseCents === 0 ? null : words.offersBarRaise(formatNcg(raiseCents / 100)),
    enough,
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
