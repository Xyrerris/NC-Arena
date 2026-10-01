/**
 * ADR-0044's reconciliation, read off an invented sheet (`reconciliation.fixture.ts`): what the
 * screen would be told when the chain, the ticks and the bundle agree — and, more to the point,
 * when they do not.
 */

import type { ChainRead } from './collectionProgress';
import { parseCollectionSheet } from './collectionSheet';
import {
  filterRows,
  itemFamily,
  missingItemGroups,
  reconcile,
  sortRows,
  type CollectionRow,
} from './reconciliation';
import { SAMPLE_SHEET_CSV } from './sampleSheet';

const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);

const chain = (ids: number[], readAt = 1_790_000_000_000): ChainRead => ({
  unlockedIds: new Set(ids),
  readAt,
});
const ids = (rows: readonly CollectionRow[]): number[] => rows.map((r) => r.collection.id);

describe('the invented sheet', () => {
  it('parses the way the real one does, empty slots included', () => {
    expect(SHEET.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SHEET.map((c) => c.requirements.length)).toEqual([3, 1, 2, 1, 1, 1]);
    expect(SHEET[0]?.bonuses).toHaveLength(3);
    expect(SHEET[1]?.bonuses).toHaveLength(1);
  });
});

describe('reconcile', () => {
  it('has nothing unlocked and nothing claimed before any read or tick', () => {
    const result = reconcile(SHEET, null, new Set());

    expect(result.counts).toEqual({ UNLOCKED: 0, CLAIMED: 0, DISPUTED: 0, MISSING: 6 });
    expect(result.total).toBe(6);
    expect(result.chainReadAt).toBeNull();
  });

  it('counts each state, with the chain winning over a tick', () => {
    // 1 unlocked (and also ticked — the chain wins), 2 ticked and contradicted, the rest plain.
    const result = reconcile(SHEET, chain([1]), new Set([1, 2]));

    expect(result.rows.map((r) => r.status)).toEqual([
      'UNLOCKED',
      'DISPUTED',
      'MISSING',
      'MISSING',
      'MISSING',
      'MISSING',
    ]);
    expect(result.counts).toEqual({ UNLOCKED: 1, CLAIMED: 0, DISPUTED: 1, MISSING: 4 });
    expect(result.chainReadAt).toBe(1_790_000_000_000);
  });

  it('calls a tick a claim, not a dispute, while no read has landed', () => {
    const result = reconcile(SHEET, null, new Set([2]));

    expect(result.rows[1]?.status).toBe('CLAIMED');
    expect(result.counts.DISPUTED).toBe(0);
  });

  it('disputes ticks against a complete read that unlocks nothing', () => {
    // An empty but *complete* read is a real answer. The guard against a failed read becoming
    // "empty" lives where reads are stored (`collectionRepository`), not here.
    const result = reconcile(SHEET, chain([]), new Set([2, 3]));

    expect(result.counts.DISPUTED).toBe(2);
  });

  it('says which rows can be ticked and which ticks can be dropped', () => {
    const { rows } = reconcile(SHEET, chain([1]), new Set([2]));
    const flags = rows.map((r) => [r.collection.id, r.canTick, r.canDropTick]);

    expect(flags).toEqual([
      [1, false, false], // unlocked: nothing to do, the chain settled it
      [2, false, true], // disputed: the tick can be dropped
      [3, true, false],
      [4, true, false],
      [5, true, false],
      [6, true, false],
    ]);
  });

  it('reports what the bundle does not know instead of dropping it', () => {
    // 999 and 500 are unlocked on the chain and not in the sheet: the bundle is behind.
    const result = reconcile(SHEET, chain([1, 999, 500]), new Set([2, 888]));

    expect(result.unknownUnlockedIds).toEqual([500, 999]);
    expect(result.unknownTickedIds).toEqual([888]);
    // And they do not count towards the sheet's own total.
    expect(result.total).toBe(6);
    expect(result.counts.UNLOCKED).toBe(1);
  });

  it('reports nothing unknown when there is no read', () => {
    expect(reconcile(SHEET, null, new Set()).unknownUnlockedIds).toEqual([]);
  });

  it('gives each row the size of its hunt', () => {
    expect(reconcile(SHEET, null, new Set()).rows.map((r) => r.itemsNeeded)).toEqual([
      3, 1, 2, 1, 1, 1,
    ]);
  });
});

describe('filterRows', () => {
  const { rows } = reconcile(SHEET, chain([1, 4]), new Set([2, 5]));
  // 1 UNLOCKED, 2 DISPUTED, 3 MISSING, 4 UNLOCKED, 5 DISPUTED, 6 MISSING

  it('keeps everything for ALL, as a copy', () => {
    const all = filterRows(rows, 'ALL');

    expect(ids(all)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all).not.toBe(rows);
  });

  it('treats a disputed claim as open', () => {
    expect(ids(filterRows(rows, 'OPEN'))).toEqual([2, 3, 5, 6]);
  });

  it('filters to one state', () => {
    expect(ids(filterRows(rows, 'DISPUTED'))).toEqual([2, 5]);
    expect(ids(filterRows(rows, 'UNLOCKED'))).toEqual([1, 4]);
    expect(ids(filterRows(rows, 'CLAIMED'))).toEqual([]);
  });
});

describe('sortRows', () => {
  const { rows } = reconcile(SHEET, null, new Set());

  it('puts the collections that need the fewest items first, keeping sheet order among ties', () => {
    expect(ids(sortRows(rows, 'FEWEST_ITEMS'))).toEqual([2, 4, 5, 6, 3, 1]);
  });

  it('can leave the sheet order alone, without touching the input', () => {
    const before = ids(rows);

    expect(ids(sortRows(rows, 'SHEET'))).toEqual(before);
    sortRows(rows, 'FEWEST_ITEMS');
    expect(ids(rows)).toEqual(before);
  });
});

describe('missingItemGroups', () => {
  it('groups the hunt by kind and leads with what unlocks the most', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const groups = missingItemGroups(rows);

    // 10110000 serves collections 1, 2 and 3; 40100001 serves 5 and 6.
    expect(groups.map((g) => g.family)).toEqual(['101', '401', '102', '103', '106', '107']);
    expect(groups[0]?.items[0]).toEqual({ itemId: 10110000, neededBy: [1, 2, 3] });
    expect(groups[1]?.items[0]).toEqual({ itemId: 40100001, neededBy: [5, 6] });
  });

  it('stops asking for an item once every collection that needs it is unlocked', () => {
    const { rows } = reconcile(SHEET, chain([5, 6]), new Set());

    const families = missingItemGroups(rows).map((g) => g.family);

    expect(families).not.toContain('401');
  });

  it('still asks for the items of a disputed collection', () => {
    // 5 is ticked but the chain, which has read, does not list it: it is still to be found.
    const { rows } = reconcile(SHEET, chain([]), new Set([5]));

    expect(missingItemGroups(rows).map((g) => g.family)).toContain('401');
  });
});

describe('itemFamily', () => {
  it('is the first three digits, for 8-digit and 6-digit ids alike', () => {
    expect(itemFamily(10110000)).toBe('101');
    expect(itemFamily(40100001)).toBe('401');
    expect(itemFamily(800120)).toBe('800');
  });
});
