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

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  filterRows,
  missingItemGroups,
  reconcile,
  sortRows,
  type Collection,
  type RowFilter,
  type RowSort,
} from '@/core/collection';
import { nextChangeIn } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { ViewerAvatar } from '@/core/model';

import {
  failureMessage,
  toHeaderUi,
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
  header: CollectionHeaderUi;
  rows: readonly CollectionRowUi[];
  itemLines: readonly ItemLineUi[];
  view: CollectionView;
  filter: RowFilter;
  sort: RowSort;
  refresh: RefreshUi;
  onView: (view: CollectionView) => void;
  onFilter: (filter: RowFilter) => void;
  onSort: (sort: RowSort) => void;
  onTick: (collectionId: number, ticked: boolean) => void;
  onRefresh: () => void;
}

export const useCollection = (sheet: readonly Collection[]): CollectionController => {
  const { collections, useLiveData } = useArenaData();
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
  // The first read starts as soon as there is an avatar (below), so the screen opens already
  // saying it is reading rather than flashing "never checked".
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

  const onRefresh = useCallback(() => {
    if (avatar === null) return;
    setRefresh({ kind: 'running' });
    void read(avatar);
  }, [avatar, read]);

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
  const rows = sortRows(filterRows(reconciliation.rows, filter), sort).map(toRowUi);

  return {
    avatar,
    header: toHeaderUi(reconciliation, chainRead, now),
    rows,
    itemLines: toItemLines(missingItemGroups(reconciliation.rows)),
    view,
    filter,
    sort,
    refresh,
    onView: setView,
    onFilter: setFilter,
    onSort: setSort,
    onTick,
    onRefresh,
  };
};
