/**
 * Which kind of thing a collection asks for, so the screen can filter by it (ADR-0044).
 *
 * The collection sheet names an item by id only; what the id *is* comes from the item sheets
 * (`EquipmentItemSheet`, and `otherItems` for the rest). A category is a player's word, not a
 * sheet's: Grimoire is a kind of equipment to the game and its own shelf to the person hunting
 * one, and a material, an hourglass or an id no sheet names are all just "other".
 *
 * A collection belongs to a category when it asks for **at least one** piece of it. Several
 * categories selected mean "any of them" (a collection of a costume and a title shows under
 * either), the opposite of the reward stats, which are all-of: those are what a collection *gives*
 * and must all be there; these are what it *needs*, and a mixed collection is rare enough that
 * "show me the costume ones" is the question.
 */

import type { EquipmentCatalog } from './equipmentCatalog';
import type { OtherItemCatalog } from './otherItems';
import type { CollectionRow } from './reconciliation';

export type ItemCategory = 'EQUIPMENT' | 'FOOD' | 'GRIMOIRE' | 'COSTUME' | 'TITLE' | 'OTHER';

/** The order the filter lists them in. */
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'EQUIPMENT',
  'GRIMOIRE',
  'COSTUME',
  'TITLE',
  'FOOD',
  'OTHER',
];

export interface ItemClass {
  readonly category: ItemCategory;
  /** The equipment sheet's sub type (`Weapon`, `Ring`...), for equipment only. */
  readonly equipmentType: string | null;
}

export const classifyItem = (
  itemId: number,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog,
): ItemClass => {
  const equipment = catalog.get(itemId);
  if (equipment !== undefined) {
    return equipment.subType === 'Grimoire'
      ? { category: 'GRIMOIRE', equipmentType: null }
      : { category: 'EQUIPMENT', equipmentType: equipment.subType };
  }
  const other = others.get(itemId);
  if (other?.kind === 'costume') {
    return { category: other.subType === 'Title' ? 'TITLE' : 'COSTUME', equipmentType: null };
  }
  if (other?.kind === 'consumable') return { category: 'FOOD', equipmentType: null };
  return { category: 'OTHER', equipmentType: null };
};

const EQUIPMENT_ORDER: readonly string[] = ['Weapon', 'Armor', 'Belt', 'Necklace', 'Ring', 'Aura'];

/** The equipment sub types in the catalog (Grimoire is its own category), in the game's order. */
export function equipmentTypeOptions(catalog: EquipmentCatalog): readonly string[] {
  const found = new Set<string>();
  for (const { subType } of catalog.values()) {
    if (subType !== '' && subType !== 'Grimoire') found.add(subType);
  }
  const rank = (type: string): number => {
    const index = EQUIPMENT_ORDER.indexOf(type);
    return index === -1 ? EQUIPMENT_ORDER.length : index;
  };
  return [...found].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface CategorySelection {
  readonly categories: ReadonlySet<ItemCategory>;
  /** Narrows `EQUIPMENT` only; empty means any equipment. Ignored while `EQUIPMENT` is not selected. */
  readonly equipmentTypes: ReadonlySet<string>;
}

/** Keeps the collections that ask for a piece of any selected category. None selected keeps all. */
export function filterByCategory(
  rows: readonly CollectionRow[],
  selection: CategorySelection,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog,
): CollectionRow[] {
  const { categories, equipmentTypes } = selection;
  if (categories.size === 0) return [...rows];
  return rows.filter((row) =>
    row.collection.requirements.some(({ itemId }) => {
      const { category, equipmentType } = classifyItem(itemId, catalog, others);
      if (!categories.has(category)) return false;
      return (
        category !== 'EQUIPMENT' ||
        equipmentTypes.size === 0 ||
        (equipmentType !== null && equipmentTypes.has(equipmentType))
      );
    }),
  );
}
