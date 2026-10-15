/**
 * The collection tracker's half of the data layer (ADR-0044): the ticks the user made by hand,
 * the last complete read of the chain, and the act of refreshing that read.
 *
 * It is a repository of its own rather than more methods on `RosterRepository`. That one's job is
 * a roster that syncs with a backend; this one reads a public chain and nothing about it touches
 * the roster's rules (ranks, `LOCAL` and `REMOTE`, the push-then-pull sync). Sharing a type would
 * mean the next change to either has to be checked against the other.
 *
 * Observers return `{ query, map }` exactly like the roster's (ADR-0012), so a screen reads them
 * through `useLiveData` and a Node test calls `.all()` directly.
 *
 * **What the screen is handed is a rule, not a convenience.** `chainRead` is `null` until a
 * complete read has landed, and `refresh` stores a read only when the source returned one. A
 * failed or partial answer leaves the previous read exactly as it was, so it can never become an
 * empty set that turns every tick into a dispute (decision 4).
 */

import type { CollectionError, CollectionSource, Result } from '../common';
import { err, ok } from '../common';
import {
  collectionReadQuery,
  collectionTicksQuery,
  parseStoredIds,
  setCollectionTick,
  storeCollectionRead,
  type ArenaDatabase,
  type CollectionReadRow,
} from '../db';
import type { ViewerAvatar } from '../model';
import type { LiveQuery } from './rosterRepository';

/**
 * A stored read. Structurally a `ChainRead` plus where it came from — `core/data` does not import
 * `core/collection`, and a type that is assignable to its shape needs no such import.
 */
export interface StoredChainRead {
  readonly unlockedIds: ReadonlySet<number>;
  /** Epoch milliseconds. */
  readonly readAt: number;
  readonly source: string;
  readonly blockIndex: number | null;
}

export interface CollectionRepositoryDeps {
  db: ArenaDatabase;
  source: CollectionSource;
  /** Injected so a test can say when a read was taken. */
  now?: () => number;
}

const toStoredRead = (rows: CollectionReadRow[]): StoredChainRead | null => {
  const row = rows[0];
  if (row === undefined) return null;
  const unlockedIds = parseStoredIds(row.unlockedIds);
  if (unlockedIds === null) return null;
  return { unlockedIds, readAt: row.readAt, source: row.source, blockIndex: row.blockIndex };
};

export function createCollectionRepository({
  db,
  source,
  now = Date.now,
}: CollectionRepositoryDeps) {
  return {
    /** The collection ids ticked by hand for this avatar. */
    tickedIds(
      avatar: ViewerAvatar,
    ): LiveQuery<ReturnType<typeof collectionTicksQuery>, ReadonlySet<number>> {
      return {
        query: collectionTicksQuery(db, avatar),
        map: (rows) => new Set(rows.map((row) => row.collectionId)),
      };
    },

    /** The last complete chain read for this avatar, or `null` if none has landed. */
    chainRead(
      avatar: ViewerAvatar,
    ): LiveQuery<ReturnType<typeof collectionReadQuery>, StoredChainRead | null> {
      return { query: collectionReadQuery(db, avatar), map: toStoredRead };
    },

    /** Ticks or un-ticks a collection. Dropping a tick is how a dispute is resolved by hand. */
    setTick(avatar: ViewerAvatar, collectionId: number, ticked: boolean): void {
      setCollectionTick(db, avatar, collectionId, ticked);
    },

    /**
     * Reads the chain and, if it answered with ids, replaces the stored read.
     *
     * `ok(null)` is "the chain has no collection state for this address" and stores nothing: it
     * is not evidence that nothing is unlocked until the address is known to be an avatar, and a
     * stored empty set would dispute every tick on the strength of it.
     */
    async refresh(avatar: ViewerAvatar): Promise<Result<StoredChainRead | null, CollectionError>> {
      const read = await source.readUnlocked(avatar);
      if (!read.ok) return err(read.error);
      if (read.value === null) return ok(null);

      const stored: StoredChainRead = {
        unlockedIds: read.value.ids,
        readAt: now(),
        source: read.value.source,
        blockIndex: read.value.blockIndex,
      };
      storeCollectionRead(db, avatar, {
        ids: stored.unlockedIds,
        readAt: stored.readAt,
        source: stored.source,
        blockIndex: stored.blockIndex,
      });
      return ok(stored);
    },
  };
}

export type CollectionRepository = ReturnType<typeof createCollectionRepository>;
