import type { AvatarInventory } from '../common';
import type { Collection } from './collectionSheet';
import { ownedCount, ownedPieces } from './ownership';

const inventory = (
  equipment: AvatarInventory['equipment'],
  stackable: [number, number][] = [],
): AvatarInventory => ({
  equipment,
  stackable: new Map(stackable),
  source: 'node',
  readAt: 0,
});

const piece = (itemId: number, level: number, skillContains: boolean, count = 1) => ({
  itemId,
  level,
  skillContains,
  count,
});

describe('ownedCount', () => {
  const bag = inventory([
    { itemId: 10690003, level: 6, hasSkill: true },
    { itemId: 10690003, level: 6, hasSkill: true },
    { itemId: 10690003, level: 6, hasSkill: false },
    { itemId: 10690003, level: 5, hasSkill: true },
  ]);

  it('counts equipment of the same id, level and skill state', () => {
    expect(ownedCount(piece(10690003, 6, true), bag)).toBe(2);
    expect(ownedCount(piece(10690003, 6, false), bag)).toBe(1);
  });

  it('does not count another level or another id', () => {
    expect(ownedCount(piece(10690003, 7, true), bag)).toBe(0);
    expect(ownedCount(piece(10790007, 6, true), bag)).toBe(0);
  });

  it('reads a stack by id alone, whatever level or skill flag the sheet carries', () => {
    const stacks = inventory([], [[383002, 4460]]);
    expect(ownedCount(piece(383002, 0, false), stacks)).toBe(4460);
    expect(ownedCount(piece(383002, 3, true), stacks)).toBe(4460);
  });
});

describe('ownedPieces', () => {
  const collection: Collection = {
    id: 7,
    bonuses: [],
    requirements: [
      piece(10690003, 6, true),
      piece(40100069, 0, false),
      piece(383002, 0, false, 5000),
    ],
  };

  it('lists the count per requirement in sheet order and how many are already met', () => {
    const result = ownedPieces(
      collection,
      inventory(
        [{ itemId: 10690003, level: 6, hasSkill: true }],
        [
          [40100069, 1],
          [383002, 4460],
        ],
      ),
    );

    expect(result.counts).toEqual([1, 1, 4460]);
    // The material is held, but not the 5000 the collection asks for.
    expect(result.have).toBe(2);
    expect(result.total).toBe(3);
  });

  it('meets nothing from an empty bag', () => {
    expect(ownedPieces(collection, inventory([])).have).toBe(0);
  });
});
