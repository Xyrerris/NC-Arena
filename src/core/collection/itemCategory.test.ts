/**
 * Which category an item falls under, and which collections a category selection keeps.
 */

import type { Collection } from './collectionSheet';
import { parseEquipmentCatalog } from './equipmentCatalog';
import {
  classifyItem,
  equipmentTypeOptions,
  filterByCategory,
  type ItemCategory,
} from './itemCategory';
import { parseOtherItems } from './otherItems';
import type { CollectionRow } from './reconciliation';

const HEADER = 'id,_name,item_sub_type,grade,elemental_type';

const catalog = parseEquipmentCatalog(
  [
    HEADER,
    '10110000,Long Sword,Weapon,1,Normal',
    '10210000,Plate Armor,Armor,1,Normal',
    '10510000,Ring,Ring,1,Normal',
    '10610000,Aura,Aura,1,Normal',
    '10750000,Old Grimoire,Grimoire,1,Normal',
    '10810000,Shield,Shield,1,Normal',
  ].join('\r\n'),
);

const others = parseOtherItems({
  costumeCsv: [
    HEADER,
    '40100001,Dress,FullCostume,1,Normal',
    '49900011,Champion,Title,1,Normal',
  ].join('\r\n'),
  materialCsv: [HEADER, '600201,Mithril Dust,EquipmentMaterial,0,Normal'].join('\r\n'),
  consumableCsv: [HEADER, '201000,Tea,Food,1,Normal'].join('\r\n'),
});

const row = (id: number, itemIds: number[]): CollectionRow => {
  const collection: Collection = {
    id,
    bonuses: [],
    requirements: itemIds.map((itemId) => ({ itemId, count: 1, level: 0, skillContains: false })),
  };
  return {
    collection,
    status: 'MISSING',
    itemsNeeded: itemIds.length,
    canTick: true,
    canDropTick: false,
  } as unknown as CollectionRow;
};

const pick = (
  rows: readonly CollectionRow[],
  categories: ItemCategory[],
  equipmentTypes: string[] = [],
): number[] =>
  filterByCategory(
    rows,
    { categories: new Set(categories), equipmentTypes: new Set(equipmentTypes) },
    catalog,
    others,
  ).map((r) => r.collection.id);

describe('classifyItem', () => {
  it('puts equipment under its sub type, and Grimoire on its own shelf', () => {
    expect(classifyItem(10110000, catalog, others)).toEqual({
      category: 'EQUIPMENT',
      equipmentType: 'Weapon',
    });
    expect(classifyItem(10750000, catalog, others)).toEqual({
      category: 'GRIMOIRE',
      equipmentType: null,
    });
  });

  it('tells a costume from a title, and food from the rest', () => {
    expect(classifyItem(40100001, catalog, others).category).toBe('COSTUME');
    expect(classifyItem(49900011, catalog, others).category).toBe('TITLE');
    expect(classifyItem(201000, catalog, others).category).toBe('FOOD');
  });

  it('calls a material and an id no sheet names "other"', () => {
    expect(classifyItem(600201, catalog, others).category).toBe('OTHER');
    expect(classifyItem(999, catalog, others).category).toBe('OTHER');
  });
});

describe('equipmentTypeOptions', () => {
  it("lists the catalog's types in the game's order, leaves Grimoire out and keeps a new one last", () => {
    expect(equipmentTypeOptions(catalog)).toEqual(['Weapon', 'Armor', 'Ring', 'Aura', 'Shield']);
    expect(equipmentTypeOptions(new Map())).toEqual([]);
  });
});

describe('filterByCategory', () => {
  const rows = [
    row(1, [10110000]),
    row(2, [10210000, 40100001]),
    row(3, [10750000]),
    row(4, [600201]),
    row(5, [49900011]),
    row(6, [201000, 10510000]),
  ];

  it('keeps everything when nothing is selected', () => {
    expect(pick(rows, [])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps a collection that asks for any piece of a selected category', () => {
    expect(pick(rows, ['COSTUME'])).toEqual([2]);
    expect(pick(rows, ['COSTUME', 'GRIMOIRE'])).toEqual([2, 3]);
    expect(pick(rows, ['OTHER', 'TITLE', 'FOOD'])).toEqual([4, 5, 6]);
  });

  it('narrows Equipment by type, and only when Equipment is selected', () => {
    expect(pick(rows, ['EQUIPMENT'])).toEqual([1, 2, 6]);
    expect(pick(rows, ['EQUIPMENT'], ['Armor', 'Ring'])).toEqual([2, 6]);
    expect(pick(rows, ['EQUIPMENT'], ['Belt'])).toEqual([]);
    // Types without Equipment are ignored: the category is what selects.
    expect(pick(rows, ['GRIMOIRE'], ['Armor'])).toEqual([3]);
  });
});
