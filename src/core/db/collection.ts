/**
 * Reading and writing the collection tracker's two tables (ADR-0044): the ticks the user made by
 * hand, and the last complete read of what the chain says is unlocked.
 *
 * Kept apart from `write.ts` on purpose. That file's invariants are the roster's — contiguous
 * ranks, a `LOCAL` row is the user's — and none of them apply here; a second set of rules in the
 * same file would be a place for the first set to be broken by accident.
 *
 * Every function takes the avatar. A row belongs to the avatar it was made for, so nothing here
 * ever has to be cleared when the viewer changes: the new avatar's queries simply do not match
 * the old avatar's rows.
 */

import { and, eq } from 'drizzle-orm';

import type { ViewerAvatar } from '../model';
import type { ArenaDatabase } from './queries';
import { collectionReads, collectionTicks, type CollectionReadRow } from './schema';

const forAvatar = (avatar: ViewerAvatar) => ({
  ticks: and(
    eq(collectionTicks.planet, avatar.planet),
    eq(collectionTicks.avatarAddress, avatar.address),
  ),
  read: and(
    eq(collectionReads.planet, avatar.planet),
    eq(collectionReads.avatarAddress, avatar.address),
  ),
});

/** The collection ids ticked by hand for this avatar. */
export const collectionTicksQuery = (db: ArenaDatabase, avatar: ViewerAvatar) =>
  db
    .select({ collectionId: collectionTicks.collectionId })
    .from(collectionTicks)
    .where(forAvatar(avatar).ticks);

/** The stored read for this avatar: zero or one row. */
export const collectionReadQuery = (db: ArenaDatabase, avatar: ViewerAvatar) =>
  db.select().from(collectionReads).where(forAvatar(avatar).read);

/** Ticks or un-ticks one collection. Idempotent either way. */
export function setCollectionTick(
  db: ArenaDatabase,
  avatar: ViewerAvatar,
  collectionId: number,
  ticked: boolean,
): void {
  if (ticked) {
    db.insert(collectionTicks)
      .values({ planet: avatar.planet, avatarAddress: avatar.address, collectionId })
      .onConflictDoNothing()
      .run();
    return;
  }
  db.delete(collectionTicks)
    .where(and(forAvatar(avatar).ticks, eq(collectionTicks.collectionId, collectionId)))
    .run();
}

export interface CollectionReadWrite {
  readonly ids: ReadonlySet<number>;
  readonly readAt: number;
  readonly source: string;
  readonly blockIndex: number | null;
}

/** Replaces the avatar's stored read whole. The ids are sorted, so the stored text is stable. */
export function storeCollectionRead(
  db: ArenaDatabase,
  avatar: ViewerAvatar,
  read: CollectionReadWrite,
): void {
  const values = {
    planet: avatar.planet,
    avatarAddress: avatar.address,
    unlockedIds: JSON.stringify([...read.ids].sort((a, b) => a - b)),
    readAt: read.readAt,
    source: read.source,
    blockIndex: read.blockIndex,
  };
  db.insert(collectionReads)
    .values(values)
    .onConflictDoUpdate({
      target: [collectionReads.planet, collectionReads.avatarAddress],
      set: values,
    })
    .run();
}

/**
 * The ids in a stored read, or `null` if the column holds anything but a JSON array of safe
 * integers. A stored read that cannot be trusted is no read at all (ADR-0044, decision 4): the
 * alternative is the ids that happened to parse, which would turn ticks into disputes.
 */
export function parseStoredIds(text: string): ReadonlySet<number> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id))) return null;
    return new Set(value as number[]);
  } catch {
    return null;
  }
}

export type { CollectionReadRow };
