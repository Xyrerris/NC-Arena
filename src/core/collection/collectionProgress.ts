/**
 * What is still missing from a collection, given two unreliable sources of "what I own".
 *
 * The chain is the truth and a manual tick is a provisional claim (ADR-0044). This file is
 * the rule written as a function, so the screen only renders what it returns.
 */

import type { Collection } from './collectionSheet';

/** A complete read of the unlocked collection ids from the node, and when it was taken. */
export interface ChainRead {
  readonly unlockedIds: ReadonlySet<number>;
  readonly readAt: number;
}

export type CollectionStatus =
  /** The chain says it is unlocked. */
  | 'UNLOCKED'
  /** Ticked by hand, and there is no chain read to contradict it. */
  | 'CLAIMED'
  /** Ticked by hand, but a chain read says it is not unlocked. Shown, never erased. */
  | 'DISPUTED'
  | 'MISSING';

export interface CollectionProgress {
  readonly collection: Collection;
  readonly status: CollectionStatus;
}

/**
 * `chain` is `null` when no complete read has ever been applied. A partial or failed read must
 * not be passed in as an empty set: that would turn every tick into a dispute.
 */
export function collectionStatus(
  collection: Collection,
  chain: ChainRead | null,
  manualIds: ReadonlySet<number>,
): CollectionStatus {
  if (chain?.unlockedIds.has(collection.id)) return 'UNLOCKED';
  if (manualIds.has(collection.id)) return chain === null ? 'CLAIMED' : 'DISPUTED';
  return 'MISSING';
}

export function collectionProgress(
  collections: readonly Collection[],
  chain: ChainRead | null,
  manualIds: ReadonlySet<number>,
): readonly CollectionProgress[] {
  return collections.map((collection) => ({
    collection,
    status: collectionStatus(collection, chain, manualIds),
  }));
}

/** An item still needed, and how many open collections it would help finish. */
export interface MissingItem {
  readonly itemId: number;
  readonly neededBy: readonly number[];
}

/**
 * Items of every collection that is not UNLOCKED. A disputed collection counts as open: if
 * the chain is right it really is missing, and hiding it would hide the disagreement too.
 * Sorted by how many collections an item serves, then by id, so the order is stable.
 */
export function missingItems(progress: readonly CollectionProgress[]): readonly MissingItem[] {
  const byItem = new Map<number, number[]>();
  for (const { collection, status } of progress) {
    if (status === 'UNLOCKED') continue;
    for (const { itemId } of collection.requirements) {
      const list = byItem.get(itemId) ?? [];
      list.push(collection.id);
      byItem.set(itemId, list);
    }
  }
  return [...byItem.entries()]
    .map(([itemId, neededBy]) => ({ itemId, neededBy }))
    .sort((a, b) => b.neededBy.length - a.neededBy.length || a.itemId - b.itemId);
}

/** Open collections that lack exactly `n` items, given the items the avatar already owns. */
export function collectionsMissingItems(
  progress: readonly CollectionProgress[],
  ownedItemIds: ReadonlySet<number>,
  n: number,
): readonly Collection[] {
  return progress
    .filter(({ status }) => status !== 'UNLOCKED')
    .map(({ collection }) => collection)
    .filter(
      (collection) =>
        collection.requirements.filter(({ itemId }) => !ownedItemIds.has(itemId)).length === n,
    );
}
