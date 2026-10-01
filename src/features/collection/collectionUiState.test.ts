/**
 * The collection screen's wording and flags, without rendering anything: what each state is
 * called, what the one button does, and what the header owns up to.
 */

import {
  SAMPLE_SHEET_CSV,
  missingItemGroups,
  parseCollectionSheet,
  reconcile,
} from '@/core/collection';

import { bonusLabel, toHeaderUi, toItemLines, toRowUi } from './collectionUiState';

const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);
const NOW = 1_790_000_600_000;

const chain = (ids: number[], readAt = 1_790_000_000_000) => ({
  unlockedIds: new Set(ids),
  readAt,
});

describe('bonusLabel', () => {
  it('lists each bonus, saying "percentage" in words rather than guessing a unit', () => {
    const [big, , , grimoire] = SHEET;

    expect(bonusLabel(big?.bonuses ?? [])).toBe('HP +1000 · ATK +400 · DEF +80');
    expect(bonusLabel(grimoire?.bonuses ?? [])).toBe('HP +2 (percentage)');
  });
});

describe('toRowUi', () => {
  const rows = (ticked: number[]) =>
    reconcile(SHEET, chain([1]), new Set(ticked)).rows.map(toRowUi);

  it('names the collection and sizes its hunt', () => {
    expect(rows([])[2]).toMatchObject({
      key: 'collection-3',
      title: 'Collection 3',
      itemCountLabel: '2 items',
      itemsText: '10110000 · 10310000',
    });
    expect(rows([])[1]?.itemCountLabel).toBe('1 item');
  });

  it('offers to tick what is missing, to drop what was ticked, and nothing for the unlocked', () => {
    const all = rows([2]);

    expect(all[0]?.action).toBeNull(); // 1: unlocked on the chain
    expect(all[1]?.action).toMatchObject({ tick: false, label: 'DROP MY MARK' }); // 2: disputed
    expect(all[2]?.action).toMatchObject({ tick: true, label: 'I HAVE THIS' }); // 3: missing
  });

  it('words the states and tones a dispute as a problem', () => {
    const all = rows([2]);

    expect(all[0]).toMatchObject({ statusLabel: 'Unlocked', statusTone: 'accent' });
    expect(all[1]).toMatchObject({
      statusLabel: 'Marked by you, but the chain does not list it',
      statusTone: 'negative',
    });
    expect(all[2]).toMatchObject({ statusLabel: 'Missing', statusTone: 'subtle' });
  });

  it('calls the same mark a claim, not a dispute, while no chain read exists', () => {
    const claimed = reconcile(SHEET, null, new Set([2])).rows.map(toRowUi);

    expect(claimed[1]?.statusLabel).toBe('Marked by you, not checked yet');
  });

  it('gives the buttons a name that says which collection', () => {
    expect(rows([2])[1]?.action?.a11y).toBe('Remove your mark from collection 2');
    expect(rows([])[2]?.action?.a11y).toBe('Mark collection 3 as unlocked');
  });
});

describe('toHeaderUi', () => {
  it('counts what is unlocked and says it has never been checked when no read exists', () => {
    const header = toHeaderUi(reconcile(SHEET, null, new Set()), null, NOW);

    expect(header).toMatchObject({
      unlocked: 0,
      open: 6,
      progressLabel: '0 of 6 unlocked',
      readLabel: 'Not checked against the chain yet',
      unknownNote: null,
    });
  });

  it('says how old the read is and where it came from', () => {
    const read = { ...chain([1, 2]), source: 'mimir', blockIndex: 100 };

    const header = toHeaderUi(reconcile(SHEET, read, new Set()), read, NOW);

    expect(header.progressLabel).toBe('2 of 6 unlocked');
    expect(header.progressA11y).toBe('2 of 6 collections unlocked');
    expect(header.readLabel).toBe('Updated 10m ago · mimir');
  });

  it('owns up to what the list does not know', () => {
    const one = reconcile(SHEET, chain([1, 999]), new Set());
    const two = reconcile(SHEET, chain([1, 999, 998]), new Set());

    expect(toHeaderUi(one, null, NOW).unknownNote).toContain('1 unlocked collection that');
    expect(toHeaderUi(two, null, NOW).unknownNote).toContain('2 unlocked collections that');
  });
});

describe('toItemLines', () => {
  it('interleaves a heading per kind with its items, and says how many collections each helps', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const lines = toItemLines(missingItemGroups(rows));

    expect(lines.slice(0, 4)).toEqual([
      { kind: 'heading', key: 'family-101', text: 'Items 101…' },
      {
        kind: 'item',
        key: 'item-10110000',
        itemId: 10110000,
        text: '10110000 · helps 3 collections',
      },
      { kind: 'heading', key: 'family-401', text: 'Items 401…' },
      {
        kind: 'item',
        key: 'item-40100001',
        itemId: 40100001,
        text: '40100001 · helps 2 collections',
      },
    ]);
  });

  it('is empty when nothing is left to find', () => {
    const { rows } = reconcile(SHEET, chain([1, 2, 3, 4, 5, 6]), new Set());

    expect(toItemLines(missingItemGroups(rows))).toEqual([]);
  });
});
