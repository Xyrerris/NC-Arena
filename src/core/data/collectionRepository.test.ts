/**
 * ADR-0044, decisions 4 and 5, against a real SQLite database with the committed migrations: a
 * read is stored whole or not at all, a failed one leaves the last good one alone, and a tick
 * belongs to the avatar it was made for.
 */

import { err, ok, type CollectionSource, type UnlockedCollections } from '../common';
import { collectionReads } from '../db';
import type { ViewerAvatar } from '../model';
import { createTestDatabase, type TestDatabase } from '../testing';
import { createCollectionRepository } from './collectionRepository';

const AVATAR: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
};
const OTHER: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x2000000000000000000000000000000000000000',
};

const read = (
  ids: number[],
  source = 'mimir',
  blockIndex: number | null = 100,
): UnlockedCollections => ({ ids: new Set(ids), source, blockIndex });

describe('collection repository', () => {
  let handle: TestDatabase;
  let answer: Awaited<ReturnType<CollectionSource['readUnlocked']>>;
  let clock: number;

  const source: CollectionSource = {
    name: 'test',
    readUnlocked: () => Promise.resolve(answer),
  };
  const repo = () => createCollectionRepository({ db: handle.db, source, now: () => clock });
  const chainRead = (avatar: ViewerAvatar) => {
    const live = repo().chainRead(avatar);
    return live.map(live.query.all());
  };
  const ticked = (avatar: ViewerAvatar) => {
    const live = repo().tickedIds(avatar);
    return live.map(live.query.all());
  };

  beforeEach(() => {
    handle = createTestDatabase();
    clock = 1_790_000_000_000;
    answer = ok(read([1, 2, 3]));
  });
  afterEach(() => handle.close());

  describe('ticks', () => {
    it('starts with none, and ticking twice is one tick', () => {
      expect(ticked(AVATAR).size).toBe(0);

      repo().setTick(AVATAR, 5, true);
      repo().setTick(AVATAR, 5, true);

      expect([...ticked(AVATAR)]).toEqual([5]);
    });

    it('drops a tick, and dropping one that is not there is not an error', () => {
      repo().setTick(AVATAR, 5, true);
      repo().setTick(AVATAR, 6, true);

      repo().setTick(AVATAR, 5, false);
      repo().setTick(AVATAR, 99, false);

      expect([...ticked(AVATAR)]).toEqual([6]);
    });

    it('keeps them per avatar: another avatar neither sees nor loses them', () => {
      repo().setTick(AVATAR, 5, true);
      repo().setTick(OTHER, 7, true);
      repo().setTick({ ...AVATAR, planet: 'odin' }, 9, true);

      expect([...ticked(AVATAR)]).toEqual([5]);
      expect([...ticked(OTHER)]).toEqual([7]);

      repo().setTick(OTHER, 5, false);
      expect([...ticked(AVATAR)]).toEqual([5]);
    });
  });

  describe('refresh', () => {
    it('stores a complete read with when and from where', async () => {
      expect(chainRead(AVATAR)).toBeNull();

      const result = await repo().refresh(AVATAR);

      const expected = {
        unlockedIds: new Set([1, 2, 3]),
        readAt: 1_790_000_000_000,
        source: 'mimir',
        blockIndex: 100,
      };
      expect(result).toEqual({ ok: true, value: expected });
      expect(chainRead(AVATAR)).toEqual(expected);
    });

    it('replaces the stored read whole, rather than adding to it', async () => {
      await repo().refresh(AVATAR);
      clock += 60_000;
      answer = ok(read([3, 4], 'node', null));

      await repo().refresh(AVATAR);

      expect(chainRead(AVATAR)).toEqual({
        unlockedIds: new Set([3, 4]),
        readAt: 1_790_000_060_000,
        source: 'node',
        blockIndex: null,
      });
    });

    it('leaves the last good read alone when the source fails', async () => {
      await repo().refresh(AVATAR);
      const before = chainRead(AVATAR);
      answer = err({ reason: 'OFFLINE', message: 'down' });

      const result = await repo().refresh(AVATAR);

      expect(result).toEqual({ ok: false, error: { reason: 'OFFLINE', message: 'down' } });
      expect(chainRead(AVATAR)).toEqual(before);
    });

    it('stores nothing for "no collection state", and keeps what was there', async () => {
      await repo().refresh(AVATAR);
      const before = chainRead(AVATAR);
      answer = ok(null);

      const result = await repo().refresh(AVATAR);

      expect(result).toEqual({ ok: true, value: null });
      expect(chainRead(AVATAR)).toEqual(before);
    });

    it('does not store a read for an avatar nobody refreshed', async () => {
      await repo().refresh(AVATAR);

      expect(chainRead(OTHER)).toBeNull();
    });
  });

  it('treats a stored read it cannot trust as no read at all', async () => {
    await repo().refresh(AVATAR);
    handle.db.update(collectionReads).set({ unlockedIds: '[1,"two"]' }).run();

    expect(chainRead(AVATAR)).toBeNull();

    handle.db.update(collectionReads).set({ unlockedIds: 'not json' }).run();

    expect(chainRead(AVATAR)).toBeNull();
  });
});
