/**
 * What the collection screen shows, computed (ADR-0044): the sheet, the last complete chain
 * read and the user's ticks, reconciled into rows, counts and the list of items still to hunt.
 *
 * Pure, like the rest of this module. `collectionStatus` already says what one collection is;
 * this file answers the questions around it that a screen would otherwise answer in JSX — how
 * far along am I, what disagrees, which ids does the bundle not know — so they can be tested
 * without rendering anything.
 *
 * **Nothing here drops a disagreement.** A chain-unlocked id the sheet does not contain, and a
 * tick on one, are returned rather than skipped: a bundled sheet that is older than the chain is
 * the failure that reads as "you are further along than the list says", and the one place that
 * can tell is this one.
 */

import {
  collectionProgress,
  missingItems,
  type ChainRead,
  type CollectionProgress,
  type CollectionStatus,
  type MissingItem,
} from './collectionProgress';
import type { Collection } from './collectionSheet';

export interface CollectionRow extends CollectionProgress {
  /**
   * How many distinct items the collection asks for. The app does not know what the user owns
   * (ADR-0044 tracks collections, not inventory), so this is the size of the hunt, not what is
   * left of it — for the 716 collections that need one item it is exactly "one away".
   */
  readonly itemsNeeded: number;
  /** A tick can be made: the collection is open and nobody has claimed it. */
  readonly canTick: boolean;
  /** A tick can be dropped: it is a claim (`CLAIMED`) or a dispute (`DISPUTED`). */
  readonly canDropTick: boolean;
}

export interface Reconciliation {
  /** One row per collection in the sheet, in sheet order. */
  readonly rows: readonly CollectionRow[];
  readonly counts: Readonly<Record<CollectionStatus, number>>;
  readonly total: number;
  /** `null` while no complete read has been applied — the screen says "not checked yet". */
  readonly chainReadAt: number | null;
  /**
   * Ids the chain says are unlocked that the bundled sheet does not contain. Non-empty means
   * the bundle is older than the chain (ADR-0044, "where the sheet comes from"): the progress
   * above is a lower bound and the screen should say so.
   */
  readonly unknownUnlockedIds: readonly number[];
  /** Ticked ids the sheet does not contain: nothing to show them against. */
  readonly unknownTickedIds: readonly number[];
}

const STATUSES: readonly CollectionStatus[] = ['UNLOCKED', 'CLAIMED', 'DISPUTED', 'MISSING'];

const sorted = (ids: Iterable<number>): number[] => [...ids].sort((a, b) => a - b);

export function reconcile(
  collections: readonly Collection[],
  chain: ChainRead | null,
  ticked: ReadonlySet<number>,
): Reconciliation {
  const rows: CollectionRow[] = collectionProgress(collections, chain, ticked).map((progress) => ({
    ...progress,
    itemsNeeded: progress.collection.requirements.length,
    canTick: progress.status === 'MISSING',
    canDropTick: progress.status === 'CLAIMED' || progress.status === 'DISPUTED',
  }));

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    CollectionStatus,
    number
  >;
  for (const row of rows) counts[row.status] += 1;

  const known = new Set(collections.map((c) => c.id));
  return {
    rows,
    counts,
    total: rows.length,
    chainReadAt: chain?.readAt ?? null,
    unknownUnlockedIds: sorted([...(chain?.unlockedIds ?? [])].filter((id) => !known.has(id))),
    unknownTickedIds: sorted([...ticked].filter((id) => !known.has(id))),
  };
}

export type RowFilter = 'ALL' | 'OPEN' | CollectionStatus;

/**
 * `OPEN` is everything the chain has not unlocked, which includes a disputed claim: a collection
 * the user says they have and the chain says they do not is still open until one of them gives.
 */
export function filterRows(rows: readonly CollectionRow[], filter: RowFilter): CollectionRow[] {
  if (filter === 'ALL') return [...rows];
  if (filter === 'OPEN') return rows.filter((row) => row.status !== 'UNLOCKED');
  return rows.filter((row) => row.status === filter);
}

export type RowSort = 'SHEET' | 'FEWEST_ITEMS';

/** Stable: rows that tie keep the sheet's order, so the list does not shuffle between renders. */
export function sortRows(rows: readonly CollectionRow[], sort: RowSort): CollectionRow[] {
  if (sort === 'SHEET') return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.itemsNeeded - b.row.itemsNeeded || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * An item's kind: the first three digits of its id, as it appears in the sheet (`101…`, `107…`,
 * `401…`, `800…`). The sheet does not name them, so neither does this — a screen that wants words
 * for them has to bring its own, and until it does the digits are honest.
 */
export const itemFamily = (itemId: number): string => String(itemId).slice(0, 3);

export interface ItemGroup {
  readonly family: string;
  readonly items: readonly MissingItem[];
}

/**
 * The items still to hunt, grouped by kind. Within a group the order is `missingItems`' — the
 * item that unlocks the most open collections first — and the groups are ordered by the best
 * item they hold, so the screen opens on the most useful thing to look for.
 */
export function missingItemGroups(rows: readonly CollectionRow[]): readonly ItemGroup[] {
  const byFamily = new Map<string, MissingItem[]>();
  for (const item of missingItems(rows)) {
    const family = itemFamily(item.itemId);
    const group = byFamily.get(family) ?? [];
    group.push(item);
    byFamily.set(family, group);
  }
  return [...byFamily.entries()]
    .map(([family, items]) => ({ family, items }))
    .sort(
      (a, b) =>
        (b.items[0]?.neededBy.length ?? 0) - (a.items[0]?.neededBy.length ?? 0) ||
        a.family.localeCompare(b.family),
    );
}
