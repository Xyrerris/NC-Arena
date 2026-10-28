/**
 * What the Upgrade screen shows, as plain values (the upgrade plan, phase 3). The ranking, the
 * ceilings and the experience are `core/collection`'s; this decides which listings are asked about,
 * how a row reads and what a selection buys.
 */

import type { BaseExpByItem, EquipmentCatalog, ScoredMaterial } from '@/core/collection';
import type { MarketListing } from '@/core/common';
import type { BatchItem } from '@/core/common/purchaseBatch';
import { toPurchaseOffer } from '@/core/common/purchasePolicy';
import { formatNcg, planOf, type BatchPlan } from '@/core/purchase';

import { upgradeStrings as words } from './strings';

/** The slots the market sells, in the order the filter shows them. */
export const SLOTS = ['Weapon', 'Armor', 'Belt', 'Necklace', 'Ring'] as const;

export interface MaterialFilters {
  /** Only this grade, or every grade. */
  readonly grade: number | null;
  /** Only this slot (the sheet's spelling), or every slot. */
  readonly slot: string | null;
}

/** The listings the filters leave; done before the ranking so its counts describe what is shown. */
export const filterListings = (
  listings: readonly MarketListing[],
  base: BaseExpByItem,
  { grade, slot }: MaterialFilters,
): readonly MarketListing[] =>
  grade === null && slot === null
    ? listings
    : listings.filter(
        (listing) =>
          (grade === null || listing.grade === grade) &&
          (slot === null || base.get(listing.itemId)?.slot === slot),
      );

/**
 * A ceiling typed by the owner, in NCG per Gexp: a positive number, with a comma or a point. Empty,
 * or anything else, is "no ceiling of my own" (null), and the default applies.
 */
export const parseCeiling = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};

const labelOf = (listing: MarketListing, catalog: EquipmentCatalog): string => {
  const info = catalog.get(listing.itemId);
  return words.piece(info?.name ?? String(listing.itemId), listing.level, info?.element ?? '');
};

export interface MaterialRowUi {
  readonly key: string;
  readonly label: string;
  readonly price: string;
  readonly detail: string;
  readonly band: string;
  readonly a11y: string;
}

export const toMaterialRow = (scored: ScoredMaterial, catalog: EquipmentCatalog): MaterialRowUi => {
  const { listing } = scored;
  const label = labelOf(listing, catalog);
  return {
    key: listing.productId,
    label,
    price: words.price(formatNcg(listing.price)),
    detail: words.detail(formatNcg(scored.r), formatNcg(scored.ng), formatNcg(scored.exp / 1e9)),
    band: scored.band === 'optimum' ? words.bandOptimum : words.bandWithin,
    a11y: words.rowA11y(label, formatNcg(listing.price)),
  };
};

/**
 * The batch a selection makes. A listing the purchase cannot do (not a single piece of equipment) is
 * left out and counted, as the collection's offers are.
 */
export const upgradePlan = (
  chosen: readonly ScoredMaterial[],
  catalog: EquipmentCatalog,
): BatchPlan => {
  const items: BatchItem[] = [];
  let excluded = 0;
  for (const { listing } of chosen) {
    if (toPurchaseOffer(listing) === null) {
      excluded += 1;
      continue;
    }
    items.push({ key: listing.productId, shown: listing, label: labelOf(listing, catalog) });
  }
  return planOf(items, excluded);
};

export const selectionTitle = (chosen: readonly ScoredMaterial[]): string =>
  words.barTitle(
    chosen.length,
    formatNcg(chosen.reduce((sum, { listing }) => sum + listing.price, 0)),
  );

export const readingStatus = (
  phase: 'idle' | 'running' | 'done' | 'stopped',
  done: number,
  total: number,
): string | null => (phase === 'idle' ? null : words.status(done, total, phase === 'running'));
