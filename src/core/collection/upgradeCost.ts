/**
 * What it costs to raise a piece of equipment, and whether a listing is cheap against that
 * (ADR-0046).
 *
 * lib9c's `EnhancementCostSheetV3` gives, per slot, grade and level, a `cost` in NCG that is
 * **cumulative from +0**: the step from +A to +B costs `cost[B] - cost[A]` (`ItemEnhancement` pays
 * exactly that difference). The same figure is the *standard price* of a piece at that level, which
 * is what a listing is judged against: a Legend +9 is worth 640 NCG of upgrade, so one asked at 600
 * is good and one at 900 is not.
 *
 * The NCG is only part of an upgrade — it also takes materials, whose experience is the sheet's
 * `exp` column — and nothing here prices those. The reference is a ceiling for the pieces' NCG, not
 * a quote.
 */

/** Cumulative NCG per level (the index is the level), by `slot|grade`. */
export type EnhancementCosts = ReadonlyMap<string, readonly number[]>;

/** The market's `ItemSubType` numbers (`marketMatch`'s routes) to the sheet's slot names. */
const SLOT_BY_SUB_TYPE: Readonly<Record<number, string>> = {
  6: 'Weapon',
  7: 'Armor',
  8: 'Belt',
  9: 'Necklace',
  10: 'Ring',
};

const costKey = (slot: string, grade: number): string => `${slot}|${grade}`;

/** Header-driven, like the other sheet parsers; a row that is not numeric is skipped. */
export function parseEnhancementCosts(csv: string): EnhancementCosts {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) throw new Error('EnhancementCostSheetV3 is empty');

  const column = new Map<string, number>();
  headerLine.split(',').forEach((name, index) => column.set(name.trim(), index));
  const need = (name: string): number => {
    const index = column.get(name);
    if (index === undefined) throw new Error(`EnhancementCostSheetV3 has no "${name}" column`);
    return index;
  };
  const slotAt = need('item_sub_type');
  const gradeAt = need('grade');
  const levelAt = need('level');
  const costAt = need('cost');

  const costs = new Map<string, number[]>();
  for (const line of rows) {
    const cells = line.split(',').map((cell) => cell.trim());
    const grade = Number(cells[gradeAt]);
    const level = Number(cells[levelAt]);
    const cost = Number(cells[costAt]);
    const slot = cells[slotAt] ?? '';
    if (![grade, level, cost].every(Number.isSafeInteger) || level < 1) continue;
    const key = costKey(slot, grade);
    const levels = costs.get(key) ?? [0];
    levels[level] = cost;
    costs.set(key, levels);
  }
  return costs;
}

/** The standard price of a piece at `level`, or null when the sheet has no such slot, grade or level. */
export const standardPrice = (
  costs: EnhancementCosts,
  itemSubType: number,
  grade: number,
  level: number,
): number | null => {
  const slot = SLOT_BY_SUB_TYPE[itemSubType];
  if (slot === undefined) return null;
  const levels = costs.get(costKey(slot, grade));
  if (levels === undefined) return null;
  if (level === 0) return 0;
  return levels[level] ?? null;
};

/** The NCG to raise a piece from `from` to `to`, or null when either level is not in the sheet. */
export const upgradeNcg = (
  costs: EnhancementCosts,
  itemSubType: number,
  grade: number,
  from: number,
  to: number,
): number | null => {
  if (to < from) return null;
  const start = standardPrice(costs, itemSubType, grade, from);
  const target = standardPrice(costs, itemSubType, grade, to);
  return start === null || target === null ? null : target - start;
};

/** How far below the target a listing may be and still count as an offer. */
export const MAX_UPGRADE_GAP = 3;

/**
 * Against the standard price: `good` at or under it, `fair` up to 30% over, `dear` beyond. Where
 * the standard price is 0 (+1 to +3 cost nothing to raise) there is nothing to compare, and no
 * verdict.
 */
export type Verdict = 'good' | 'fair' | 'dear';

export const FAIR_RATIO = 1.3;

export const verdictFor = (asked: number, standard: number): Verdict | null => {
  if (standard <= 0) return null;
  // Whole hundredths, so 130.00 against 100 is not pushed over by a float.
  const ratio = Math.round(asked * 100) / Math.round(standard * 100);
  if (ratio <= 1) return 'good';
  return ratio <= FAIR_RATIO ? 'fair' : 'dear';
};
