/**
 * The collection screen's view-models: plain values built from the reconciliation
 * (`core/collection`), so every sentence and every flag is testable without rendering.
 *
 * The rules — what is disputed, what counts as open, what the bundle does not know — live in
 * `core/collection`. This file only decides how they are worded.
 */

import {
  ITEM_CATEGORIES,
  type CollectionBonus,
  type CollectionRequirement,
  type CollectionRow,
  type EquipmentCatalog,
  type ItemCategory,
  type MissingEquipmentList,
  type OtherItemCatalog,
  type CollectionStatus,
  type ItemGroup,
  type Reconciliation,
  type RowFilter,
  type RowSort,
} from '@/core/collection';
import { timeSince } from '@/core/common';
import type { StoredChainRead } from '@/core/data';
import type { Tone } from '@/core/design-system';

import { canSearchMarket, marketPieces } from './marketUiState';
import { collectionStrings as words } from './strings';

export type CollectionView = 'COLLECTIONS' | 'ITEMS';

export const VIEW_TABS: readonly { value: CollectionView; label: string }[] = [
  { value: 'COLLECTIONS', label: words.viewCollections },
  { value: 'ITEMS', label: words.viewItems },
];

export const FILTER_OPTIONS: readonly { filter: RowFilter; label: string }[] = [
  { filter: 'OPEN', label: words.filterOpen },
  { filter: 'DISPUTED', label: words.filterDisputed },
  { filter: 'UNLOCKED', label: words.filterUnlocked },
  { filter: 'ALL', label: words.filterAll },
];

export const SORT_OPTIONS: readonly { sort: RowSort; label: string }[] = [
  { sort: 'FEWEST_ITEMS', label: words.sortFewest },
  { sort: 'SHEET', label: words.sortSheet },
];

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  EQUIPMENT: words.categoryEquipment,
  GRIMOIRE: words.categoryGrimoire,
  COSTUME: words.categoryCostume,
  TITLE: words.categoryTitle,
  FOOD: words.categoryFood,
  OTHER: words.categoryOther,
};

/** The categories chosen, in the filter's order; Equipment carries its chosen sub types. */
export const categorySummary = (
  categories: ReadonlySet<ItemCategory>,
  equipmentTypes: ReadonlySet<string>,
): string => {
  if (categories.size === 0) return words.filtersNone;
  return ITEM_CATEGORIES.filter((category) => categories.has(category))
    .map((category) =>
      category === 'EQUIPMENT' && equipmentTypes.size > 0
        ? `${CATEGORY_LABEL[category]} (${[...equipmentTypes].join(', ')})`
        : CATEGORY_LABEL[category],
    )
    .join(' · ');
};

export const statsSummary = (stats: ReadonlySet<string>): string =>
  stats.size === 0 ? words.filtersNone : [...stats].join(' + ');

/** One line for the folded filters: what is narrowing the list, so a closed panel is not silent. */
export const filterSummary = (selection: {
  filter: RowFilter;
  categories: ReadonlySet<ItemCategory>;
  equipmentTypes: ReadonlySet<string>;
  stats: ReadonlySet<string>;
}): string => {
  const status = FILTER_OPTIONS.find((option) => option.filter === selection.filter)?.label;
  const parts = [status ?? selection.filter];
  if (selection.categories.size > 0) {
    parts.push(categorySummary(selection.categories, selection.equipmentTypes));
  }
  if (selection.stats.size > 0) parts.push(statsSummary(selection.stats));
  return parts.join(' · ');
};

const STATUS: Record<CollectionStatus, { label: string; tone: Tone }> = {
  UNLOCKED: { label: words.statusUnlocked, tone: 'accent' },
  CLAIMED: { label: words.statusClaimed, tone: 'subtle' },
  DISPUTED: { label: words.statusDisputed, tone: 'negative' },
  MISSING: { label: words.statusMissing, tone: 'subtle' },
};

/**
 * `ATK +500`, or `HP +2%`. A `Percentage` value is in percentage points: lib9c applies it as
 * `value * Value / 100` and prints it with a `%` itself (`StatModifier.ToString`).
 */
export const bonusLabel = (bonuses: readonly CollectionBonus[]): string =>
  bonuses.map((b) => `${b.stat} +${b.value}${b.operation === 'Percentage' ? '%' : ''}`).join(' · ');

export interface CollectionRowUi {
  /** Stable list key. */
  readonly key: string;
  readonly collectionId: number;
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone: Tone;
  readonly itemCountLabel: string;
  /** One line per piece the collection asks for, in the sheet's order. */
  readonly items: readonly RequirementUi[];
  readonly bonusText: string;
  /** The button that opens the market sheet, or null when no piece of the collection has a market. */
  readonly market: { readonly label: string; readonly a11y: string } | null;
  /** Said instead of the button when every piece is one the market does not sell (Aura, Grimoire). */
  readonly marketNote: string | null;
  /** What the row's button does, or null when there is nothing to do. */
  readonly action: { readonly tick: boolean; readonly label: string; readonly a11y: string } | null;
}

/** `Long Sword +4 · Fire`: what a collection asks for, in words when the catalog knows the id. */
export const requirementLabel = (
  requirement: CollectionRequirement,
  catalog: EquipmentCatalog,
): string => {
  const info = catalog.get(requirement.itemId);
  return info === undefined
    ? String(requirement.itemId)
    : words.piece(info.name, requirement.level, info.element);
};

export interface RequirementUi {
  readonly key: string;
  readonly label: string;
  /** Draws the skill mark. Only for a piece the catalog knows is equipment (see `requirementUi`). */
  readonly needsSkill: boolean;
  readonly a11y: string;
}

/**
 * One line of a collection: what to find, and whether it must carry a skill. The mark is drawn
 * for equipment only. The sheet's flag is FALSE or blank for a material and has no meaning for a
 * costume, so with no catalog entry to say "this is equipment" the line stays unmarked rather than
 * claim something the data does not say.
 */
export const requirementUi = (
  requirement: CollectionRequirement,
  index: number,
  catalog: EquipmentCatalog,
): RequirementUi => {
  const label = requirementLabel(requirement, catalog);
  const needsSkill = catalog.has(requirement.itemId) && requirement.skillContains;
  return {
    key: `${requirement.itemId}-${index}`,
    label,
    needsSkill,
    a11y: needsSkill ? words.itemNeedsSkill(label) : label,
  };
};

export const toRowUi = (
  row: CollectionRow,
  catalog: EquipmentCatalog = new Map(),
  others: OtherItemCatalog = new Map(),
): CollectionRowUi => {
  const id = row.collection.id;
  const status = STATUS[row.status];
  let action: CollectionRowUi['action'] = null;
  if (row.canTick) {
    action = { tick: true, label: words.tick, a11y: words.tickA11y(id) };
  } else if (row.canDropTick) {
    action = { tick: false, label: words.dropTick, a11y: words.dropTickA11y(id) };
  }
  // An unlocked collection needs nothing bought. Without a catalog nothing says what is equipment,
  // so no piece has a market and the row stays as it was.
  const offered = row.status === 'UNLOCKED' ? null : marketPieces(row.collection, catalog, others);
  const searchable = offered !== null && canSearchMarket(offered);
  return {
    key: `collection-${id}`,
    collectionId: id,
    market: searchable ? { label: words.marketButton, a11y: words.marketButtonA11y(id) } : null,
    marketNote:
      offered !== null && !searchable && offered.pieces.length > 0 ? words.marketNotSold : null,
    title: words.collectionTitle(id),
    statusLabel: status.label,
    statusTone: status.tone,
    itemCountLabel: words.itemCount(row.itemsNeeded),
    items: row.collection.requirements.map((r, index) => requirementUi(r, index, catalog)),
    bonusText: bonusLabel(row.collection.bonuses),
    action,
  };
};

export interface CollectionHeaderUi {
  readonly unlocked: number;
  readonly open: number;
  readonly progressLabel: string;
  readonly progressA11y: string;
  /** Where the numbers came from and how old they are. */
  readonly readLabel: string;
  /** Set when the chain unlocks ids the list does not contain. */
  readonly unknownNote: string | null;
}

export const toHeaderUi = (
  reconciliation: Reconciliation,
  read: StoredChainRead | null,
  now: number,
): CollectionHeaderUi => {
  const unlocked = reconciliation.counts.UNLOCKED;
  const unknown = reconciliation.unknownUnlockedIds.length;
  return {
    unlocked,
    open: reconciliation.total - unlocked,
    progressLabel: words.progress(unlocked, reconciliation.total),
    progressA11y: words.progressA11y(unlocked, reconciliation.total),
    readLabel:
      read === null ? words.neverRead : words.updated(timeSince(read.readAt, now), read.source),
    unknownNote: unknown === 0 ? null : words.unknownNote(unknown),
  };
};

/** One line of the items view: a kind heading, or an item under it. */
export type ItemLineUi =
  | { readonly kind: 'heading'; readonly key: string; readonly text: string }
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly itemId: number;
      readonly text: string;
      /** A second line under `text`: how many open collections the piece would finish. */
      readonly detail?: string;
    };

/**
 * The equipment still to find, one line per piece (name, level, element, skill) with how many
 * open collections it helps, under a heading per kind of equipment. The list arrives sorted by
 * how many collections a piece helps, so a heading takes its place from the first piece under it.
 */
export const toEquipmentLines = (list: MissingEquipmentList): readonly ItemLineUi[] => {
  const kinds: string[] = [];
  for (const piece of list.entries) if (!kinds.includes(piece.subType)) kinds.push(piece.subType);

  return kinds.flatMap((kind) => [
    { kind: 'heading' as const, key: `kind-${kind}`, text: kind },
    ...list.entries
      .filter((piece) => piece.subType === kind)
      .map((piece) => ({
        kind: 'item' as const,
        key: `piece-${piece.id}-${piece.level}-${piece.skillContains}`,
        itemId: piece.id,
        text: `${words.piece(piece.name, piece.level, piece.element)} · ${
          piece.skillContains ? words.withSkill : words.noSkill
        }`,
        detail: words.helps(piece.neededBy.length),
      })),
  ]);
};

export const toItemLines = (groups: readonly ItemGroup[]): readonly ItemLineUi[] =>
  groups.flatMap((group) => [
    { kind: 'heading' as const, key: `family-${group.family}`, text: words.family(group.family) },
    ...group.items.map((item) => ({
      kind: 'item' as const,
      key: `item-${item.itemId}`,
      itemId: item.itemId,
      text: words.itemUnlocks(item.itemId, item.neededBy.length),
    })),
  ]);

export type RefreshUi =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  /** Read and complete, but the chain has nothing for this avatar. Nothing was stored. */
  | { readonly kind: 'noState' }
  | { readonly kind: 'failed'; readonly message: string };

export const failureMessage = (reason: 'OFFLINE' | 'FAILED'): string =>
  reason === 'OFFLINE' ? words.failedOffline : words.failedOther;
