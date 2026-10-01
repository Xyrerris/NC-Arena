import {
  collectionProgress,
  collectionsMissingItems,
  collectionStatus,
  missingItems,
  type ChainRead,
} from './collectionProgress';
import type { Collection } from './collectionSheet';

const make = (id: number, ...itemIds: number[]): Collection => ({
  id,
  requirements: itemIds.map((itemId) => ({ itemId, count: 1, level: 0 })),
  bonuses: [],
});
const A = make(1, 100, 200);
const B = make(2, 100);
const C = make(3, 300);
const chain = (...ids: number[]): ChainRead => ({ unlockedIds: new Set(ids), readAt: 1 });

describe('collectionStatus (ADR-0044)', () => {
  it('trusts the chain over a manual tick', () => {
    expect(collectionStatus(A, chain(1), new Set())).toBe('UNLOCKED');
    expect(collectionStatus(A, chain(1), new Set([1]))).toBe('UNLOCKED');
  });

  it('keeps a tick the chain does not confirm, as a dispute, not as a deletion', () => {
    expect(collectionStatus(A, chain(2), new Set([1]))).toBe('DISPUTED');
  });

  it('treats a tick as a plain claim while there has been no chain read', () => {
    expect(collectionStatus(A, null, new Set([1]))).toBe('CLAIMED');
    expect(collectionStatus(A, null, new Set())).toBe('MISSING');
  });

  it('does not let an empty-but-valid chain read hide that nothing is unlocked', () => {
    expect(collectionStatus(A, chain(), new Set())).toBe('MISSING');
  });
});

describe('missingItems', () => {
  it('counts an item once per open collection and puts the most useful first', () => {
    const progress = collectionProgress([A, B, C], chain(3), new Set());
    expect(missingItems(progress)).toEqual([
      { itemId: 100, neededBy: [1, 2] },
      { itemId: 200, neededBy: [1] },
    ]);
  });

  it('still lists a disputed collection as open', () => {
    const progress = collectionProgress([A], chain(), new Set([1]));
    expect(missingItems(progress).map((m) => m.itemId)).toEqual([100, 200]);
  });
});

describe('collectionsMissingItems', () => {
  it('finds the collections that lack exactly n owned items', () => {
    const progress = collectionProgress([A, B, C], chain(), new Set());
    const owned = new Set([100]);
    expect(collectionsMissingItems(progress, owned, 1).map((c) => c.id)).toEqual([1, 3]);
    expect(collectionsMissingItems(progress, owned, 0).map((c) => c.id)).toEqual([2]);
  });
});
