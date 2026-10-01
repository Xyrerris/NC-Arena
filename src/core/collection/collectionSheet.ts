/**
 * Reading lib9c's `CollectionSheet.csv` into plain values.
 *
 * A collection is a set of 1-6 items (equipment or costumes, by id) that grants a permanent
 * stat bonus once the avatar owns all of them. The sheet is the only place that says which
 * items a collection needs; it carries ids and no names (see ADR-0044).
 *
 * The parse is driven by the header row, not by column positions, so a column lib9c adds
 * later does not shift every field. A row this parser cannot make sense of is a thrown
 * error, not a skipped row: a silently shorter list of collections reads as "you are
 * further along than you are".
 */

export type CollectionStat = 'HP' | 'ATK' | 'DEF' | 'SPD' | 'HIT' | 'CDMG' | 'CRI';
export type CollectionOperation = 'Add' | 'Percentage';

export interface CollectionRequirement {
  readonly itemId: number;
  readonly count: number;
  readonly level: number;
}

export interface CollectionBonus {
  readonly stat: string;
  readonly operation: string;
  readonly value: number;
}

export interface Collection {
  readonly id: number;
  readonly requirements: readonly CollectionRequirement[];
  readonly bonuses: readonly CollectionBonus[];
}

const MAX_REQUIREMENTS = 6;
const MAX_BONUSES = 3;

const toInt = (raw: string, what: string, row: number): number => {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isSafeInteger(value)) {
    throw new Error(`CollectionSheet row ${row}: ${what} is not an integer: "${raw}"`);
  }
  return value;
};

export function parseCollectionSheet(csv: string): readonly Collection[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) throw new Error('CollectionSheet is empty');

  const column = new Map<string, number>();
  headerLine.split(',').forEach((name, index) => column.set(name.trim(), index));
  const need = (name: string): number => {
    const index = column.get(name);
    if (index === undefined) throw new Error(`CollectionSheet has no "${name}" column`);
    return index;
  };
  const idColumn = need('id');

  return rows.map((line, rowIndex) => {
    const cells = line.split(',');
    const row = rowIndex + 2;
    const cell = (index: number): string => (cells[index] ?? '').trim();

    const requirements: CollectionRequirement[] = [];
    for (let n = 1; n <= MAX_REQUIREMENTS; n += 1) {
      const raw = cell(need(`item_id${n}`));
      if (raw === '') continue;
      requirements.push({
        itemId: toInt(raw, `item_id${n}`, row),
        count: toInt(cell(need(`count${n}`)), `count${n}`, row),
        level: toInt(cell(need(`level${n}`)), `level${n}`, row),
      });
    }

    const bonuses: CollectionBonus[] = [];
    for (let n = 1; n <= MAX_BONUSES; n += 1) {
      const stat = cell(need(`stat_type${n}`));
      if (stat === '') continue;
      bonuses.push({
        stat,
        operation: cell(need(`modify_type${n}`)),
        value: toInt(cell(need(`modify_value${n}`)), `modify_value${n}`, row),
      });
    }

    if (requirements.length === 0) {
      throw new Error(`CollectionSheet row ${row}: a collection with no required item`);
    }
    return { id: toInt(cell(idColumn), 'id', row), requirements, bonuses };
  });
}
