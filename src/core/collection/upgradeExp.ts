/**
 * The experience a piece of equipment gives when it is used as material for raising another
 * (ADR-0047). Two sheets say it, and both are read from the chain, not from lib9c — lib9c has neither
 * the Ultimate (grade 9) gear nor today's values:
 *
 * - `EquipmentItemSheet.exp`: what an item gives at +0. It is **per item**, not per grade (grade 7
 *   has 120 M and 150 M items), which is why the base is read by id.
 * - `EnhancementCostSheetV3.exp`: what a piece gives at a level, **cumulative from +0** like `cost`
 *   (a grade 8 weapon: +1 1.28 G, +2 2.56 G, +10 38.4 G).
 *
 * lib9c's `Equipment.GetRealExp` takes the stored `Exp` when it is not 0, else the +0 value from the
 * first sheet at level 0, else the level's value from the second. A market listing does not show the
 * stored `Exp`, so what this gives for a piece that was raised is a floor.
 */

/** Cumulative experience per level (the index is the level), by `slot|grade`. */
export type EnhancementExp = ReadonlyMap<string, readonly number[]>;

export interface BaseExp {
  /** `Weapon`, `Armor`, `Belt`, `Necklace`, `Ring`, `Aura`, `Grimoire`... as the sheet spells it. */
  readonly slot: string;
  readonly grade: number;
  /** The experience at +0. */
  readonly exp: number;
}

export type BaseExpByItem = ReadonlyMap<number, BaseExp>;

const expKey = (slot: string, grade: number): string => `${slot}|${grade}`;

function header(csv: string, sheet: string): { rows: string[][]; at: (name: string) => number } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) throw new Error(`${sheet} is empty`);
  const column = new Map<string, number>();
  headerLine.split(',').forEach((name, index) => column.set(name.trim(), index));
  return {
    rows: rows.map((line) => line.split(',').map((cell) => cell.trim())),
    at: (name) => {
      const index = column.get(name);
      if (index === undefined) throw new Error(`${sheet} has no "${name}" column`);
      return index;
    },
  };
}

/** Header-driven, like the other sheet parsers; a row that is not numeric is skipped. */
export function parseEnhancementExp(csv: string): EnhancementExp {
  const { rows, at } = header(csv, 'EnhancementCostSheetV3');
  const slotAt = at('item_sub_type');
  const gradeAt = at('grade');
  const levelAt = at('level');
  const expAt = at('exp');

  const found = new Map<string, number[]>();
  for (const cells of rows) {
    const grade = Number(cells[gradeAt]);
    const level = Number(cells[levelAt]);
    const exp = Number(cells[expAt]);
    if (![grade, level, exp].every(Number.isSafeInteger) || level < 1) continue;
    const key = expKey(cells[slotAt] ?? '', grade);
    const levels = found.get(key) ?? [0];
    levels[level] = exp;
    found.set(key, levels);
  }
  return found;
}

/** Header-driven; an item without a numeric id, grade or exp is skipped. */
export function parseBaseExp(csv: string): BaseExpByItem {
  const { rows, at } = header(csv, 'EquipmentItemSheet');
  const idAt = at('id');
  const slotAt = at('item_sub_type');
  const gradeAt = at('grade');
  const expAt = at('exp');

  const items = new Map<number, BaseExp>();
  for (const cells of rows) {
    const id = Number(cells[idAt]);
    const grade = Number(cells[gradeAt]);
    const exp = Number(cells[expAt]);
    if (![id, grade, exp].every(Number.isSafeInteger)) continue;
    items.set(id, { slot: cells[slotAt] ?? '', grade, exp });
  }
  return items;
}

/**
 * What an item gives as material at `level`, or null when the sheets do not know the item, or the
 * level of its slot and grade. Level 0 is the item's own base.
 */
export const materialExp = (
  base: BaseExpByItem,
  levels: EnhancementExp,
  itemId: number,
  level: number,
): number | null => {
  const item = base.get(itemId);
  if (item === undefined) return null;
  if (level === 0) return item.exp;
  return levels.get(expKey(item.slot, item.grade))?.[level] ?? null;
};
