/**
 * The join the owner asked for (2026-10-14): which equipment is still missing from an avatar's
 * collections, with its name, level, element, skill flag and how many open collections it helps.
 * Item ids and names below are the real ones for the Long Sword family; the rest is invented.
 */

import { parseCollectionSheet, type Collection } from './collectionSheet';
import { missingEquipment, parseEquipmentCatalog } from './equipmentCatalog';
import { reconcile } from './reconciliation';

const EQUIPMENT_CSV = [
  'id,_name,item_sub_type,grade,elemental_type,set_id,stat_type,stat_value,attack_range,spine_resource_path,exp',
  '10110000,Long Sword,Weapon,1,Normal,1,ATK,11,2,10110000,5',
  '10111000,Long Sword,Weapon,1,Fire,2,ATK,14,2,10111000,5',
  '10210000,Plate Armor,Armor,1,Normal,1,DEF,5,0,10210000,5',
  'not-a-number,Broken,Weapon,1,Normal,1,ATK,1,2,x,1',
].join('\r\n');

const piece = (itemId: number, level: number, skillContains = true) => ({
  itemId,
  count: 1,
  level,
  skillContains,
});
const collection = (id: number, ...requirements: ReturnType<typeof piece>[]): Collection => ({
  id,
  requirements,
  bonuses: [],
});

describe('parseEquipmentCatalog', () => {
  it('reads name, kind and element by header, and skips a row with no numeric id', () => {
    const catalog = parseEquipmentCatalog(EQUIPMENT_CSV);

    expect(catalog.size).toBe(3);
    expect(catalog.get(10111000)).toEqual({
      id: 10111000,
      name: 'Long Sword',
      subType: 'Weapon',
      element: 'Fire',
    });
  });

  it('refuses a sheet that lacks a column it needs, rather than guessing positions', () => {
    expect(() => parseEquipmentCatalog('id,_name\r\n1,x')).toThrow('item_sub_type');
    expect(() => parseEquipmentCatalog('')).toThrow('empty');
  });
});

describe('parseCollectionSheet reads the skill flag', () => {
  it('maps skillN to skillContains, TRUE and FALSE', () => {
    const header =
      'id,item_id1,count1,level1,skill1,item_id2,count2,level2,skill2,item_id3,count3,level3,skill3,' +
      'item_id4,count4,level4,skill4,item_id5,count5,level5,skill5,item_id6,count6,level6,skill6,' +
      'stat_type1,modify_type1,modify_value1,stat_type2,modify_type2,modify_value2,' +
      'stat_type3,modify_type3,modify_value3';
    const row = '1,10110000,1,4,TRUE,10210000,1,0,FALSE,,,,,,,,,,,,,,,,,ATK,Add,5,,,,,,';

    const [first] = parseCollectionSheet(`${header}\r\n${row}`);

    expect(first?.requirements.map((r) => [r.level, r.skillContains])).toEqual([
      [4, true],
      [0, false],
    ]);
  });
});

describe('parseCollectionSheet with blank cells, as lib9c has them', () => {
  const header =
    'id,item_id1,count1,level1,skill1,item_id2,count2,level2,skill2,item_id3,count3,level3,skill3,' +
    'item_id4,count4,level4,skill4,item_id5,count5,level5,skill5,item_id6,count6,level6,skill6,' +
    'stat_type1,modify_type1,modify_value1,stat_type2,modify_type2,modify_value2,' +
    'stat_type3,modify_type3,modify_value3';

  it('reads a blank level as 0 and a blank skill as FALSE, like lib9c does', () => {
    // The first real row with a blank level: a material, 5 of item 201000.
    const row = '10001,201000,5,,,,,,,,,,,,,,,,,,,,,,,CDMG,Percentage,1,,,,,,';

    const [first] = parseCollectionSheet(`${header}\r\n${row}`);

    expect(first?.requirements[0]).toEqual({
      itemId: 201000,
      count: 5,
      level: 0,
      skillContains: false,
    });
  });

  it('still refuses a level that is neither blank nor an integer', () => {
    const row = '1,10110000,1,four,TRUE,,,,,,,,,,,,,,,,,,,,,ATK,Add,5,,,,,,';

    expect(() => parseCollectionSheet(`${header}\r\n${row}`)).toThrow('level1');
  });
});

describe('missingEquipment', () => {
  const catalog = parseEquipmentCatalog(EQUIPMENT_CSV);

  it('counts the open collections a piece helps, and keeps level and skill apart', () => {
    const sheet = [
      collection(1, piece(10111000, 0), piece(10210000, 0)),
      collection(2, piece(10111000, 0)),
      collection(3, piece(10111000, 4)),
      collection(4, piece(10111000, 0, false)),
    ];

    const { entries } = missingEquipment(reconcile(sheet, null, new Set()).rows, catalog);

    expect(entries[0]).toMatchObject({
      name: 'Long Sword',
      element: 'Fire',
      subType: 'Weapon',
      level: 0,
      skillContains: true,
      neededBy: [1, 2],
    });
    // +4 and "no skill" are separate pieces to go and get, not folded into the first.
    expect(entries.map((e) => [e.id, e.level, e.skillContains, e.neededBy.length])).toEqual([
      [10111000, 0, true, 2],
      [10111000, 0, false, 1],
      [10111000, 4, true, 1],
      [10210000, 0, true, 1],
    ]);
  });

  it('leaves out what the chain says is unlocked, and keeps a disputed claim open', () => {
    const sheet = [collection(1, piece(10111000, 0)), collection(2, piece(10210000, 0))];
    const chain = { unlockedIds: new Set([1]), readAt: 1 };

    const withTick = missingEquipment(reconcile(sheet, chain, new Set([2])).rows, catalog);

    expect(withTick.entries.map((e) => e.id)).toEqual([10210000]);
  });

  it('counts a collection once for a piece it lists twice', () => {
    const sheet = [collection(1, piece(10111000, 0), piece(10111000, 0))];

    const { entries } = missingEquipment(reconcile(sheet, null, new Set()).rows, catalog);

    expect(entries[0]?.neededBy).toEqual([1]);
  });

  it('counts costume and material slots instead of dropping them', () => {
    const sheet = [collection(1, piece(10111000, 0), piece(40100001, 0), piece(800120, 0))];

    const list = missingEquipment(reconcile(sheet, null, new Set()).rows, catalog);

    expect(list.entries).toHaveLength(1);
    expect(list.unlistedSlots).toBe(2);
  });
});
