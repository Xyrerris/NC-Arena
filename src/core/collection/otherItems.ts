/**
 * What a costume, a material or a food id is: the part of a collection that is not equipment.
 *
 * `EquipmentItemSheet` names the equipment; the rest of what a collection asks for lives in
 * `CostumeItemSheet`, `MaterialItemSheet` and `ConsumableItemSheet` (served by Mimir the same way,
 * with an English or Korean `_name` and an `item_sub_type`, and no level or skill). A collection
 * asks for a *count* of a material, and the market sells it in lots, so this is also where the
 * sheet's wording of "what kind of thing is this" is kept (ADR-0044, "Costumes and materials").
 *
 * A name can be Korean, or missing altogether: about 70 of the 424 items are in no sheet at all and
 * stay ids (ADR-0044, "Where item names are").
 */

export type OtherItemKind = 'costume' | 'material' | 'consumable';

export interface OtherItemInfo {
  readonly id: number;
  readonly name: string;
  /** `FullCostume`, `Title`, `EquipmentMaterial`, `Hourglass`, `ApStone`, `Food`... as the sheet spells it. */
  readonly subType: string;
  readonly kind: OtherItemKind;
}

export type OtherItemCatalog = ReadonlyMap<number, OtherItemInfo>;

export interface OtherItemSheets {
  readonly costumeCsv: string;
  readonly materialCsv: string;
  readonly consumableCsv: string;
}

const parseOne = (csv: string, kind: OtherItemKind, sheetName: string): OtherItemInfo[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) throw new Error(`${sheetName} is empty`);

  const column = new Map<string, number>();
  headerLine.split(',').forEach((name, index) => column.set(name.trim(), index));
  const need = (name: string): number => {
    const index = column.get(name);
    if (index === undefined) throw new Error(`${sheetName} has no "${name}" column`);
    return index;
  };
  const idAt = need('id');
  const nameAt = need('_name');
  const subTypeAt = need('item_sub_type');

  const items: OtherItemInfo[] = [];
  for (const line of rows) {
    const cells = line.split(',').map((cell) => cell.trim());
    // The costume sheet carries `_item_sub_type,FullCostume|HairCostume|...` rows that describe
    // the columns for lib9c's own tooling. They have no numeric id, and are not items.
    const id = Number(cells[idAt]);
    if (cells[idAt] === '' || !Number.isSafeInteger(id)) continue;
    items.push({ id, name: cells[nameAt] ?? '', subType: cells[subTypeAt] ?? '', kind });
  }
  return items;
};

/** Header-driven, like `parseEquipmentCatalog`: a column lib9c adds later does not shift anything. */
export function parseOtherItems(sheets: OtherItemSheets): OtherItemCatalog {
  const catalog = new Map<number, OtherItemInfo>();
  const all = [
    ...parseOne(sheets.costumeCsv, 'costume', 'CostumeItemSheet'),
    ...parseOne(sheets.materialCsv, 'material', 'MaterialItemSheet'),
    ...parseOne(sheets.consumableCsv, 'consumable', 'ConsumableItemSheet'),
  ];
  for (const item of all) catalog.set(item.id, item);
  return catalog;
}
