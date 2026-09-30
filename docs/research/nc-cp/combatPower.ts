/**
 * Nine Chronicles combat power (CP), recomputed off-chain.
 *
 * Port of `Nekoyume.Battle.CPHelper.TotalCP` and the parts of `CharacterStats` it leans on
 * (planetarium/lib9c, `Lib9c/Battle/CPHelper.cs`, `Lib9c/Model/Stat/CharacterStats.cs`).
 *
 * Pure and dependency-free: every game table arrives as plain data, so this file does no I/O and
 * imports nothing from the app. It is kept aside on purpose — see README.md.
 *
 *   CP = level stats + equipment + costumes + runes + rune level bonus + collections
 */

export type StatType = 'HP' | 'ATK' | 'DEF' | 'CRI' | 'HIT' | 'SPD' | 'CDMG';
export type StatMap = Partial<Record<StatType, number>>;
type BaseStat = 'HP' | 'ATK' | 'DEF' | 'CRI' | 'HIT' | 'SPD';

/** `CharacterSheet.csv` row: base value and per-level increase for the six base stats. */
export interface CharacterRow {
  base: Record<BaseStat, number>;
  perLevel: Record<BaseStat, number>;
}

export interface EquipmentInput {
  /** The item's total `statsMap` as GraphQL returns it (base plus upgrades). */
  stats: StatMap;
  /** `skills.length + buffSkills.length`. */
  skillCount: number;
}

export interface RuneOptionInput {
  /** `total_cp` of the `RuneOptionSheet` row for this rune at its current level. */
  totalCp: number;
  /** The row's stat columns; only `Add` operations exist in the current sheet. */
  stats: readonly { stat: StatType; value: number }[];
}

export interface CollectionModifier {
  stat: StatType;
  operation: 'Add' | 'Percentage';
  value: number;
}

export interface CombatPowerInput {
  level: number;
  character: CharacterRow;
  /** Equipped items for the battle type being scored. */
  equipment: readonly EquipmentInput[];
  /** Stats of every equipped costume, already looked up in `CostumeStatSheet`. */
  costumeStats: readonly { stat: StatType; value: number }[];
  /** Runes in the slots of the battle type being scored. */
  runes: readonly RuneOptionInput[];
  /** From {@link runeLevelBonus}; 100 000 means +100 %. */
  runeLevelBonus: number;
  /** Modifiers of every unlocked collection. */
  collections: readonly CollectionModifier[];
}

export interface CombatPowerBreakdown {
  level: number;
  equipment: number;
  costumes: number;
  runes: number;
  runeLevelBonus: number;
  collections: number;
  total: number;
}

const STAT_TYPES: readonly StatType[] = ['HP', 'ATK', 'DEF', 'CRI', 'HIT', 'SPD', 'CDMG'];

/** CPHelper.GetStatCP. CRI and CDMG scale with the character's level. */
export function statCp(stat: StatType, value: number, level: number): number {
  switch (stat) {
    case 'HP':
      return value * 0.7;
    case 'ATK':
    case 'DEF':
      return value * 10.5;
    case 'SPD':
      return value * 3;
    case 'HIT':
      return value * 2.3;
    case 'CRI':
      return value * level * 20;
    case 'CDMG':
      return value * level * 3;
  }
}

/** CPHelper.GetSkillsMultiplier. */
export function skillsMultiplier(skillCount: number): number {
  if (skillCount <= 0) return 1;
  return skillCount === 1 ? 1.15 : 1.35;
}

function sumCp(stats: StatMap, level: number): number {
  return STAT_TYPES.reduce((sum, stat) => sum + statCp(stat, stats[stat] ?? 0, level), 0);
}

/** CharacterSheet.Row.ToStats: base + perLevel × (level − 1). */
export function levelStats(row: CharacterRow, level: number): Record<BaseStat, number> {
  const m = Math.max(level - 1, 0);
  const out = { ...row.base };
  for (const key of Object.keys(out) as BaseStat[]) {
    out[key] = row.base[key] + row.perLevel[key] * m;
  }
  return out;
}

export interface RuneLevelBonusRow {
  runeLevel: number;
  bonus: number;
}

/**
 * RuneHelper.CalculateRuneLevelBonus. `runes` is every rune the avatar owns (not only the equipped
 * ones); `bonusCoef` comes from `RuneListSheet.bonus_coef`.
 */
export function runeLevelBonus(
  runes: readonly { runeId: number; level: number }[],
  bonusCoef: ReadonlyMap<number, number>,
  sheet: readonly RuneLevelBonusRow[],
): number {
  const bonusLevel = runes.reduce(
    (sum, rune) => sum + (bonusCoef.get(rune.runeId) ?? 0) * rune.level,
    0,
  );
  let bonus = 0;
  let prev = 0;
  for (const row of [...sheet].sort((a, b) => a.runeLevel - b.runeLevel)) {
    bonus += (Math.min(row.runeLevel, bonusLevel) - prev) * row.bonus;
    prev = row.runeLevel;
    if (row.runeLevel >= bonusLevel) break;
  }
  return bonus;
}

export function combatPower(input: CombatPowerInput): CombatPowerBreakdown {
  const { level } = input;

  // Level stats. The CP uses the raw decimals; the totals below, which feed the percentage
  // modifiers, are whole numbers, as lib9c stores them (`GetStatAsLong`).
  const raw = levelStats(input.character, level);
  const levelCp = sumCp(raw, level);

  const totals: Record<StatType, number> = {
    HP: Math.trunc(raw.HP),
    ATK: Math.trunc(raw.ATK),
    DEF: Math.trunc(raw.DEF),
    CRI: Math.trunc(raw.CRI),
    HIT: Math.trunc(raw.HIT),
    SPD: Math.trunc(raw.SPD),
    CDMG: 0,
  };

  let equipmentCp = 0;
  for (const item of input.equipment) {
    equipmentCp += Math.trunc(sumCp(item.stats, level) * skillsMultiplier(item.skillCount));
    for (const stat of STAT_TYPES) totals[stat] += item.stats[stat] ?? 0;
  }

  let costumeCp = 0;
  for (const { stat, value } of input.costumeStats) {
    costumeCp += statCp(stat, value, level);
    totals[stat] += value;
  }

  let runeCp = 0;
  let runeBonusCp = 0;
  for (const rune of input.runes) {
    runeCp += rune.totalCp;
    for (const { stat, value } of rune.stats) {
      runeBonusCp += statCp(stat, (value * input.runeLevelBonus) / 100_000, level);
      // CharacterStats.AddRuneStat: the level bonus scales the stat, truncated to a whole number.
      totals[stat] += Math.trunc((value * (100_000 + input.runeLevelBonus)) / 100_000);
    }
  }

  // CharacterStats.SetCollections: percentages of the same stat are summed first, then applied to
  // base + equipment + runes + costumes (not to each other, and not to the additive collection
  // bonuses).
  const percentages = new Map<StatType, number>();
  let collectionCp = 0;
  for (const { stat, operation, value } of input.collections) {
    if (operation === 'Add') collectionCp += statCp(stat, value, level);
    else percentages.set(stat, (percentages.get(stat) ?? 0) + value);
  }
  for (const [stat, percent] of percentages) {
    collectionCp += statCp(stat, Math.trunc((totals[stat] * percent) / 100), level);
  }

  const total = Math.trunc(levelCp + equipmentCp + costumeCp + runeCp + runeBonusCp + collectionCp);
  return {
    level: levelCp,
    equipment: equipmentCp,
    costumes: costumeCp,
    runes: runeCp,
    runeLevelBonus: runeBonusCp,
    collections: collectionCp,
    total,
  };
}
