/**
 * The collection screen's ViewModel-as-a-hook (ARCHITECTURE.md §8).
 *
 * It reads the avatar, the ticks and the stored chain read through the repository, reconciles
 * them against the sheet it is given (`core/collection`), and refreshes the chain read when the
 * avatar appears and when asked. It never decides what a collection *is* — that is
 * `reconcile`'s — and it never touches the network, which is `collections.refresh`'s.
 *
 * **The sheet is a parameter.** Where it comes from is the route's business, and today the
 * route hands it a placeholder (ADR-0044: bundling the real one waits on a licence decision).
 * Nothing here would change when that does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  filterByRewardStats,
  equipmentTypeOptions,
  filterByCategory,
  filterRows,
  missingEquipment,
  missingItemGroups,
  reconcile,
  rewardStats,
  sortRows,
  type Collection,
  type CollectionRow,
  type EquipmentCatalog,
  type ItemCategory,
  type OtherItemCatalog,
  type RowFilter,
  type RowSort,
} from '@/core/collection';
import { nextChangeIn, type AvatarInventory } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { ViewerAvatar } from '@/core/model';

import {
  failureMessage,
  inventoryNote,
  type InventoryRead,
  toHeaderUi,
  toEquipmentLines,
  toItemLines,
  toRowUi,
  type CollectionHeaderUi,
  type CollectionRowUi,
  type CollectionView,
  type ItemLineUi,
  type RefreshUi,
} from './collectionUiState';

/**
 * What the live queries are built against while nobody has an avatar. The screen shows its
 * "no avatar" state and ignores the result; the hooks below still have to be called, and a query
 * for an address no row can have is the cheapest way to call them.
 */
const NO_AVATAR: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x0000000000000000000000000000000000000000',
};

export interface CollectionController {
  avatar: ViewerAvatar | null;
  /** One line about the inventory read, or null when there is nothing to say. */
  inventoryNote: { readonly text: string; readonly tone: 'subtle' | 'negative' | 'accent' } | null;
  header: CollectionHeaderUi;
  rows: readonly CollectionRowUi[];
  itemLines: readonly ItemLineUi[];
  /** Open-collection slots for costumes and materials, which the items view does not list yet. */
  unlistedSlots: number;
  /**
   * The ids of the open collections the filters leave, comma-separated: what the offers view covers.
   * A string, so it compares by content while the rows it comes from are rebuilt on every render.
   */
  offerIds: string;
  /** What the avatar holds, or null while the inventory is unread or unreadable. */
  holdings: AvatarInventory | null;
  view: CollectionView;
  filter: RowFilter;
  sort: RowSort;
  /** The stats the sheet's collections reward, in the game's order: the filter's choices. */
  statOptions: readonly string[];
  /** The reward stats selected. A collection must give all of them to stay in the list. */
  stats: ReadonlySet<string>;
  /** What the collections must ask for (any of the selected). Empty means no filter. */
  categories: ReadonlySet<ItemCategory>;
  /** Equipment sub types, narrowing the `EQUIPMENT` category. Empty means any equipment. */
  equipmentTypes: ReadonlySet<string>;
  /** The sub types the catalog has, in the game's order. Empty without a catalog (no category filter). */
  equipmentTypeOptions: readonly string[];
  /** True when any filter is off its default, which is what the reset puts back. */
  filtersChanged: boolean;
  refresh: RefreshUi;
  onView: (view: CollectionView) => void;
  onFilter: (filter: RowFilter) => void;
  onStat: (stat: string) => void;
  onCategory: (category: ItemCategory) => void;
  onEquipmentType: (type: string) => void;
  onResetFilters: () => void;
  onSort: (sort: RowSort) => void;
  onTick: (collectionId: number, ticked: boolean) => void;
  onRefresh: () => void;
}

const NO_CATALOG: EquipmentCatalog = new Map();
const NO_OTHERS: OtherItemCatalog = new Map();

/** The ids of the collections not unlocked, comma-separated: a value that compares by content. */
const openIdList = (rows: readonly CollectionRow[]): string =>
  rows
    .filter((row) => row.status !== 'UNLOCKED')
    .map((row) => row.collection.id)
    .join(',');

export const useCollection = (
  sheet: readonly Collection[],
  catalog: EquipmentCatalog = NO_CATALOG,
  others: OtherItemCatalog = NO_OTHERS,
): CollectionController => {
  const { collections, inventory: inventorySource, useLiveData } = useArenaData();
  if (collections === undefined) {
    throw new Error(
      'useCollection needs `collections` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }

  const avatar = useViewerAvatar();
  const subject = avatar ?? NO_AVATAR;
  const deps = [subject.planet, subject.address] as const;
  const ticked = useLiveData(collections.tickedIds(subject), deps).data;
  const chainRead = useLiveData(collections.chainRead(subject), deps).data;

  const [view, setView] = useState<CollectionView>('COLLECTIONS');
  const [filter, setFilter] = useState<RowFilter>('OPEN');
  const [sort, setSort] = useState<RowSort>('FEWEST_ITEMS');
  // Reward stats asked for, all of which a collection must give (AND). Empty means no filter.
  const [stats, setStats] = useState<ReadonlySet<string>>(new Set());
  const statOptions = useMemo(() => rewardStats(sheet), [sheet]);
  const onStat = useCallback((stat: string) => {
    setStats((current) => {
      const next = new Set(current);
      if (!next.delete(stat)) next.add(stat);
      return next;
    });
  }, []);
  // The first read starts as soon as there is an avatar (below), so the screen opens already
  // saying it is reading rather than flashing "never checked".
  const [categories, setCategories] = useState<ReadonlySet<ItemCategory>>(new Set());
  const [equipmentTypes, setEquipmentTypes] = useState<ReadonlySet<string>>(new Set());
  const typeOptions = useMemo(() => equipmentTypeOptions(catalog), [catalog]);
  const onCategory = useCallback((category: ItemCategory) => {
    setCategories((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
    // Leaving Equipment forgets its sub types: they would otherwise come back, unseen, with it.
    if (category === 'EQUIPMENT') setEquipmentTypes(new Set());
  }, []);
  const onEquipmentType = useCallback((type: string) => {
    setEquipmentTypes((current) => {
      const next = new Set(current);
      if (!next.delete(type)) next.add(type);
      return next;
    });
  }, []);
  const onResetFilters = useCallback(() => {
    setFilter('OPEN');
    setStats(new Set());
    setCategories(new Set());
    setEquipmentTypes(new Set());
  }, []);
  const [refresh, setRefresh] = useState<RefreshUi>(
    avatar === null ? { kind: 'idle' } : { kind: 'running' },
  );
  // A tick is written straight to SQLite and the live query reports it on a device. This only
  // makes the screen render again in the one place that has no change listener — the Node-side
  // stub (ADR-0012) — and is a spare render everywhere else.
  const [, setRevision] = useState(0);

  // Reading the chain is one function, used by the first read and by the user's retry. What it
  // reports goes through `setRefresh` only once the answer is in, never during an effect.
  const mounted = useRef(true);
  const read = useCallback(
    (subjectAvatar: ViewerAvatar) =>
      collections.refresh(subjectAvatar).then((result) => {
        if (!mounted.current) return;
        if (!result.ok) {
          setRefresh({ kind: 'failed', message: failureMessage(result.error.reason) });
        } else {
          setRefresh(result.value === null ? { kind: 'noState' } : { kind: 'idle' });
        }
      }),
    [collections],
  );

  // Read once when the avatar appears or changes: opening the tab should show today's numbers
  // without a gesture, and a failure leaves the last read on screen (decision 5).
  useEffect(() => {
    mounted.current = true;
    if (avatar !== null) void read(avatar);
    return () => {
      mounted.current = false;
    };
  }, [avatar, read]);

  // What the avatar owns, so a piece already in the bag is not bought again. Read with the chain
  // read, and kept apart from it: a failure here leaves the collections as they were and only
  // takes the "in bag" marks away, which the note above the list says.
  // The answer is stored with the avatar it was read for, so another avatar's bag is never shown
  // for this one and "reading" needs no state of its own: it is any avatar with no answer yet.
  const avatarKey = avatar === null ? null : `${avatar.planet}:${avatar.address}`;
  const [inventoryAnswer, setInventoryAnswer] = useState<{
    readonly key: string;
    readonly read: InventoryRead;
  } | null>(null);
  const inventoryRun = useRef(0);
  const readInventory = useCallback(
    (subjectAvatar: ViewerAvatar) => {
      if (inventorySource === undefined) return;
      const run = ++inventoryRun.current;
      const key = `${subjectAvatar.planet}:${subjectAvatar.address}`;
      void inventorySource.readInventory(subjectAvatar).then((result) => {
        // An older request, or one that outlived the screen, is dropped.
        if (!mounted.current || run !== inventoryRun.current) return;
        // A failed refresh keeps the bag already read: stale marks beat none, and the note says so.
        if (!result.ok) {
          setInventoryAnswer((current) =>
            current?.key === key && current.read.kind === 'ready'
              ? current
              : { key, read: { kind: 'failed', reason: result.error.reason } },
          );
          return;
        }
        setInventoryAnswer({
          key,
          read:
            result.value === null ? { kind: 'none' } : { kind: 'ready', inventory: result.value },
        });
      });
    },
    [inventorySource],
  );
  useEffect(() => {
    if (avatar !== null) readInventory(avatar);
    return () => {
      inventoryRun.current += 1;
    };
  }, [avatar, readInventory]);
  const inventoryRead: InventoryRead =
    inventorySource === undefined || avatarKey === null
      ? { kind: 'idle' }
      : inventoryAnswer?.key === avatarKey
        ? inventoryAnswer.read
        : { kind: 'running' };

  const onRefresh = useCallback(() => {
    if (avatar === null) return;
    setRefresh({ kind: 'running' });
    void read(avatar);
    readInventory(avatar);
  }, [avatar, read, readInventory]);

  // The clock the "updated N ago" label is rendered against: state with a self-rescheduling
  // timer, as the roster's is (`useRoster`), so the label changes when it could and not before.
  const readAt = chainRead?.readAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (readAt === null) return;
    const id = setTimeout(() => setNow(Date.now()), nextChangeIn(readAt, Date.now()));
    return () => clearTimeout(id);
  }, [readAt, now]);

  const onTick = useCallback(
    (collectionId: number, isTicked: boolean) => {
      if (avatar === null) return;
      collections.setTick(avatar, collectionId, isTicked);
      setRevision((n) => n + 1);
    },
    [avatar, collections],
  );

  const reconciliation = reconcile(sheet, chainRead, ticked);
  // The reward filter narrows both views: the items view lists what the collections that
  // remain still need, so asking for ATK and HIT shows the pieces for those collections only.
  // The status filter is the collections view's alone; the items view is always about open ones.
  const rewarded = filterByCategory(
    filterByRewardStats(reconciliation.rows, stats),
    { categories, equipmentTypes },
    catalog,
    others,
  );
  const holdings = inventoryRead.kind === 'ready' ? inventoryRead.inventory : null;
  const rows = sortRows(filterRows(rewarded, filter), sort).map((row) =>
    toRowUi(row, catalog, others, holdings),
  );
  // With a catalog the items view lists equipment by name, level, element and skill; without one
  // (the placeholder sheet) it falls back to bare ids, which is all the sheet itself can say.
  const equipment = catalog.size > 0 ? missingEquipment(rewarded, catalog) : null;

  const itemLines =
    equipment === null
      ? toItemLines(missingItemGroups(rewarded))
      : toEquipmentLines(equipment, holdings);

  return {
    avatar,
    inventoryNote: inventoryNote(inventoryRead, now),
    header: toHeaderUi(reconciliation, chainRead, now),
    rows,
    itemLines,
    unlistedSlots: equipment?.unlistedSlots ?? 0,
    offerIds: openIdList(rewarded),
    holdings,
    view,
    filter,
    sort,
    statOptions,
    stats,
    categories,
    equipmentTypes,
    equipmentTypeOptions: typeOptions,
    filtersChanged:
      filter !== 'OPEN' || stats.size > 0 || categories.size > 0 || equipmentTypes.size > 0,
    refresh,
    onView: setView,
    onFilter: setFilter,
    onStat,
    onCategory,
    onEquipmentType,
    onResetFilters,
    onSort: setSort,
    onTick,
    onRefresh,
  };
};
