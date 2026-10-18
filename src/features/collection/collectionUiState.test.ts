/**
 * The collection screen's wording and flags, without rendering anything: what each state is
 * called, what the one button does, and what the header owns up to.
 */

import {
  type Collection,
  SAMPLE_SHEET_CSV,
  missingEquipment,
  missingItemGroups,
  parseCollectionSheet,
  parseEquipmentCatalog,
  reconcile,
} from '@/core/collection';

import {
  bonusLabel,
  toEquipmentLines,
  toHeaderUi,
  toItemLines,
  toRowUi,
} from './collectionUiState';

const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);
const NOW = 1_790_000_600_000;

const chain = (ids: number[], readAt = 1_790_000_000_000) => ({
  unlockedIds: new Set(ids),
  readAt,
});

describe('bonusLabel', () => {
  it('lists each bonus, with a % for a percentage one as the game writes it', () => {
    const [big, , , grimoire] = SHEET;

    expect(bonusLabel(big?.bonuses ?? [])).toBe('HP +1000 · ATK +400 · DEF +80');
    expect(bonusLabel(grimoire?.bonuses ?? [])).toBe('HP +2%');
  });
});

describe('toRowUi', () => {
  const rows = (ticked: number[]) =>
    reconcile(SHEET, chain([1]), new Set(ticked)).rows.map((row) => toRowUi(row));

  it('names the collection and sizes its hunt', () => {
    expect(rows([])[2]).toMatchObject({
      key: 'collection-3',
      title: 'Collection 3',
      itemCountLabel: '2 items',
      // No catalog: nothing says these are equipment, so no mark is claimed.
      items: [
        {
          key: '10110000-0',
          label: '10110000',
          needsSkill: false,
          a11y: '10110000',
          owned: false,
          ownedText: null,
        },
        {
          key: '10310000-1',
          label: '10310000',
          needsSkill: false,
          a11y: '10310000',
          owned: false,
          ownedText: null,
        },
      ],
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
    const claimed = reconcile(SHEET, null, new Set([2])).rows.map((row) => toRowUi(row));

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
    expect(header.readLabel).toBe('Updated 10 min ago · mimir');
  });

  it('owns up to what the list does not know', () => {
    const one = reconcile(SHEET, chain([1, 999]), new Set());
    const two = reconcile(SHEET, chain([1, 999, 998]), new Set());

    expect(toHeaderUi(one, null, NOW).unknownNote).toContain('1 unlocked collection that');
    expect(toHeaderUi(two, null, NOW).unknownNote).toContain('2 unlocked collections that');
  });
});

describe('toEquipmentLines', () => {
  const catalog = parseEquipmentCatalog(
    [
      'id,_name,item_sub_type,grade,elemental_type',
      '10110000,Long Sword,Weapon,1,Normal',
      '10310000,Plate Armor,Armor,1,Fire',
    ].join('\r\n'),
  );

  it('names each piece with level, element and skill, under a heading per kind', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const lines = toEquipmentLines(missingEquipment(rows, catalog));

    expect(lines[0]).toEqual({ kind: 'heading', key: 'kind-Weapon', text: 'Weapon' });
    expect(lines[1]).toEqual({
      kind: 'item',
      key: 'piece-10110000-0-true',
      itemId: 10110000,
      text: 'Long Sword +0 · Normal · with skill',
      detail: 'helps 3 collections',
    });
  });

  it('words the row of a collection with the names the catalog has, and ids for the rest', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    expect(toRowUi(rows[0]!, catalog).items.map((item) => item.label)).toEqual([
      'Long Sword +0 · Normal',
      '10210000',
      '10660000',
    ]);
  });

  it('marks a piece that needs a skill, and only when the catalog says it is equipment', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const items = toRowUi(rows[0]!, catalog).items;

    // Long Sword is equipment and the sheet says SkillContains; the other two are not in the
    // catalog, so their flag is not read as a requirement.
    expect(items.map((item) => item.needsSkill)).toEqual([true, false, false]);
    expect(items[0]?.a11y).toBe('Long Sword +0 · Normal, needs a skill');
    expect(items[1]?.a11y).toBe('10210000');
  });

  it('leaves a piece that must have no skill unmarked', () => {
    const noSkill: Collection = {
      id: 9,
      requirements: [{ itemId: 10110000, count: 1, level: 4, skillContains: false }],
      bonuses: [],
    };
    const { rows } = reconcile([noSkill], null, new Set());

    expect(toRowUi(rows[0]!, catalog).items).toEqual([
      {
        key: '10110000-0',
        label: 'Long Sword +4 · Normal',
        needsSkill: false,
        a11y: 'Long Sword +4 · Normal',
        owned: false,
        ownedText: null,
      },
    ]);
  });
});

describe('ownership marks', () => {
  const catalog = parseEquipmentCatalog(
    ['id,_name,item_sub_type,grade,elemental_type', '10110000,Long Sword,Weapon,1,Normal'].join(
      '\n',
    ),
  );
  const bag = {
    equipment: [{ itemId: 10110000, level: 0, hasSkill: true }],
    stackable: new Map<number, number>([[10210000, 3]]),
  };

  it('says nothing about ownership until an inventory has been read', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const ui = toRowUi(rows[0]!, catalog);

    expect(ui.ownedSummary).toBeNull();
    expect(ui.items.every((item) => item.ownedText === null)).toBe(true);
  });

  it('tags each line as in the bag or still to find, and counts what is already held', () => {
    const { rows } = reconcile(SHEET, null, new Set());

    const ui = toRowUi(rows[0]!, catalog, new Map(), bag);

    expect(ui.items.map((item) => item.ownedText)).toEqual(['IN BAG', 'IN BAG ×3', 'TO FIND']);
    expect(ui.items.map((item) => item.owned)).toEqual([true, true, false]);
    expect(ui.items[0]?.a11y).toBe('Long Sword +0 · Normal, needs a skill, in bag');
    expect(ui.ownedSummary).toBe('2 of 3 already in your bag');
  });

  it('does not summarise a collection that is already unlocked', () => {
    const { rows } = reconcile(SHEET, chain([1]), new Set());

    expect(toRowUi(rows[0]!, catalog, new Map(), bag).ownedSummary).toBeNull();
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
