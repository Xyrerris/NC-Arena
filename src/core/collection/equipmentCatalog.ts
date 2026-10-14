/**
 * What an equipment id is, and which pieces an avatar still needs to complete its collections.
 *
 * `CollectionSheet` names an item by id, level and a "must have a skill" flag, and nothing else:
 * no name and no element. Both live in the game's `EquipmentItemSheet` (`_name`, `elemental_type`,
 * `item_sub_type`), so this file reads that sheet and joins the two. The element is a property of
 * the id — `10111000` is the Fire Long Sword, `10112000` the Water one — which is why a collection
 * that wants "a Fire Long Sword +4" is an id plus a level and needs no element column of its own.
 *
 * Costumes and materials are in other sheets and are not read here (ADR-0044, "Next step"): a slot
 * whose item is not in the catalog is counted as `unlistedSlots`, not dropped, so the screen can
 * say how much of the hunt the list does not cover.
 */

import type { CollectionRow } from './reconciliation';

export interface EquipmentInfo {
  readonly id: number;
  readonly name: string;
  /** `Weapon`, `Armor`, `Belt`, `Necklace`, `Ring`, `Aura`, `Grimoire`... as the sheet spells it. */
  readonly subType: string;
  /** `Normal`, `Fire`, `Water`, `Land`, `Wind`. */
  readonly element: string;
}

export type EquipmentCatalog = ReadonlyMap<number, EquipmentInfo>;

/**
 * Header-driven, like `parseCollectionSheet`. A row without a numeric id is skipped rather than
 * fatal: the cost of a bad row here is a missing name, which the screen already has a fallback
 * for, whereas the collection sheet's rows are the progress itself.
 */
export function parseEquipmentCatalog(csv: string): EquipmentCatalog {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) throw new Error('EquipmentItemSheet is empty');

  const column = new Map<string, number>();
  headerLine.split(',').forEach((name, index) => column.set(name.trim(), index));
  const need = (name: string): number => {
    const index = column.get(name);
    if (index === undefined) throw new Error(`EquipmentItemSheet has no "${name}" column`);
    return index;
  };
  const idAt = need('id');
  const nameAt = need('_name');
  const subTypeAt = need('item_sub_type');
  const elementAt = need('elemental_type');

  const catalog = new Map<number, EquipmentInfo>();
  for (const line of rows) {
    const cells = line.split(',').map((cell) => cell.trim());
    const id = Number(cells[idAt]);
    if (!Number.isSafeInteger(id)) continue;
    catalog.set(id, {
      id,
      name: cells[nameAt] ?? '',
      subType: cells[subTypeAt] ?? '',
      element: cells[elementAt] ?? '',
    });
  }
  return catalog;
}

/** One piece to find: an item at a level, with or without a skill, and what it would finish. */
export interface MissingEquipment extends EquipmentInfo {
  readonly level: number;
  /** `SkillContains`: true means the piece must have at least one skill, false that it must have none. */
  readonly skillContains: boolean;
  /** Open collections that ask for exactly this piece. The number a player hunts by. */
  readonly neededBy: readonly number[];
}

export interface MissingEquipmentList {
  readonly entries: readonly MissingEquipment[];
  /** Requirement slots of open collections that are not equipment (costumes, materials). */
  readonly unlistedSlots: number;
}

interface Piece {
  info: EquipmentInfo;
  level: number;
  skillContains: boolean;
  neededBy: number[];
}

/**
 * The equipment still to find: every requirement of every collection that is not `UNLOCKED`
 * (a disputed one counts as open, as in `missingItems`), grouped by id, level and skill flag.
 * A collection that asks for the same piece twice is counted once for it.
 *
 * Most collections need the item at `+0` with a skill, but the level is part of the identity: a
 * `Long Sword +0` and a `Long Sword +4` are different things to go and get.
 */
export function missingEquipment(
  rows: readonly CollectionRow[],
  catalog: EquipmentCatalog,
): MissingEquipmentList {
  const byPiece = new Map<string, Piece>();
  let unlistedSlots = 0;

  for (const { collection, status } of rows) {
    if (status === 'UNLOCKED') continue;
    for (const { itemId, level, skillContains } of collection.requirements) {
      const info = catalog.get(itemId);
      if (info === undefined) {
        unlistedSlots += 1;
        continue;
      }
      const key = `${itemId}|${level}|${skillContains}`;
      const piece = byPiece.get(key) ?? { info, level, skillContains, neededBy: [] };
      if (!piece.neededBy.includes(collection.id)) piece.neededBy.push(collection.id);
      byPiece.set(key, piece);
    }
  }

  const entries = [...byPiece.values()]
    .map(({ info, ...rest }) => ({ ...info, ...rest }))
    .sort(
      (a, b) =>
        b.neededBy.length - a.neededBy.length ||
        a.name.localeCompare(b.name) ||
        a.level - b.level ||
        a.id - b.id,
    );
  return { entries, unlistedSlots };
}
