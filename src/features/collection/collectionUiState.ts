/**
 * The collection screen's view-models: plain values built from the reconciliation
 * (`core/collection`), so every sentence and every flag is testable without rendering.
 *
 * The rules — what is disputed, what counts as open, what the bundle does not know — live in
 * `core/collection`. This file only decides how they are worded.
 */

import type {
  CollectionBonus,
  CollectionRow,
  CollectionStatus,
  ItemGroup,
  Reconciliation,
  RowFilter,
  RowSort,
} from '@/core/collection';
import { timeSince } from '@/core/common';
import type { StoredChainRead } from '@/core/data';
import type { Tone } from '@/core/design-system';

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

const STATUS: Record<CollectionStatus, { label: string; tone: Tone }> = {
  UNLOCKED: { label: words.statusUnlocked, tone: 'accent' },
  CLAIMED: { label: words.statusClaimed, tone: 'subtle' },
  DISPUTED: { label: words.statusDisputed, tone: 'negative' },
  MISSING: { label: words.statusMissing, tone: 'subtle' },
};

/**
 * `ATK +500`. A percentage bonus says so in words rather than with a `%`: what unit lib9c's
 * `Percentage` values are in has not been checked against the game, and a wrong symbol is
 * worse than a plain word.
 */
export const bonusLabel = (bonuses: readonly CollectionBonus[]): string =>
  bonuses
    .map((b) => `${b.stat} +${b.value}${b.operation === 'Percentage' ? ' (percentage)' : ''}`)
    .join(' · ');

export interface CollectionRowUi {
  /** Stable list key. */
  readonly key: string;
  readonly collectionId: number;
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone: Tone;
  readonly itemCountLabel: string;
  readonly itemsText: string;
  readonly bonusText: string;
  /** What the row's button does, or null when there is nothing to do. */
  readonly action: { readonly tick: boolean; readonly label: string; readonly a11y: string } | null;
}

export const toRowUi = (row: CollectionRow): CollectionRowUi => {
  const id = row.collection.id;
  const status = STATUS[row.status];
  let action: CollectionRowUi['action'] = null;
  if (row.canTick) {
    action = { tick: true, label: words.tick, a11y: words.tickA11y(id) };
  } else if (row.canDropTick) {
    action = { tick: false, label: words.dropTick, a11y: words.dropTickA11y(id) };
  }
  return {
    key: `collection-${id}`,
    collectionId: id,
    title: words.collectionTitle(id),
    statusLabel: status.label,
    statusTone: status.tone,
    itemCountLabel: words.itemCount(row.itemsNeeded),
    itemsText: words.itemList(row.collection.requirements.map((r) => r.itemId)),
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
