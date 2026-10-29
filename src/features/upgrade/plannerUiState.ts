/**
 * What the upgrade planner shows, as plain values (the upgrade plan, phase 5): which owned pieces can
 * be raised, and the sentences of a plan. The plan itself is `core/collection`'s `planUpgrade`.
 */

import {
  maxLevelOf,
  MIN_MATERIAL_GRADE,
  type BaseExpByItem,
  type EnhancementExp,
  type EquipmentCatalog,
  type UpgradePlan,
} from '@/core/collection';
import type { HeldEquipment } from '@/core/common';
import { formatNcg } from '@/core/purchase';

import { upgradeStrings as words } from './strings';
import { SLOTS } from './upgradeUiState';

export interface PlannablePiece {
  readonly piece: HeldEquipment;
  readonly label: string;
  readonly grade: number;
  /** The highest level the sheet knows for it. */
  readonly max: number;
}

/**
 * The pieces in the bag that are worth planning for: grade 7 or more, in a slot the market sells,
 * and below the last level the sheet has. Highest grade first, then the most raised.
 */
export const plannablePieces = (
  equipment: readonly HeldEquipment[],
  base: BaseExpByItem,
  levels: EnhancementExp,
  catalog: EquipmentCatalog,
): readonly PlannablePiece[] =>
  equipment
    .flatMap((piece) => {
      const item = base.get(piece.itemId);
      const max = maxLevelOf(base, levels, piece.itemId);
      if (
        item === undefined ||
        max === null ||
        item.grade < MIN_MATERIAL_GRADE ||
        !(SLOTS as readonly string[]).includes(item.slot) ||
        piece.level >= max
      ) {
        return [];
      }
      const info = catalog.get(piece.itemId);
      const label = words.piece(
        info?.name ?? String(piece.itemId),
        piece.level,
        info?.element ?? '',
      );
      return [{ piece, label, grade: item.grade, max }];
    })
    .sort(
      (a, b) =>
        b.grade - a.grade ||
        b.piece.level - a.piece.level ||
        b.piece.exp - a.piece.exp ||
        a.piece.tradableId.localeCompare(b.piece.tradableId),
    );

export const pieceLine = (candidate: PlannablePiece): string =>
  words.plannerPiece(
    candidate.label,
    formatNcg(candidate.piece.exp / 1e9),
    candidate.piece.equipped,
  );

/** A target level kept inside what the piece can reach: above its level, at most the sheet's last. */
export const clampTarget = (level: number, from: number, max: number): number =>
  Math.min(max, Math.max(from + 1, level));

/** The sentences of a plan, in the order they are read. */
export const planLines = (plan: UpgradePlan): readonly string[] => {
  const lines: string[] = [];
  lines.push(
    plan.neededExp === 0
      ? words.planNothingToBuy
      : words.planNeed(formatNcg(plan.neededExp / 1e9), plan.from, plan.to),
  );
  if (plan.picks.length > 0) {
    lines.push(words.planBuy(plan.picks.length, formatNcg(plan.materialNcg)));
  }
  lines.push(
    plan.upgradeNcg === null
      ? words.planUpgradeUnknown
      : words.planUpgradeCost(formatNcg(plan.upgradeNcg)),
  );
  if (plan.total !== null) lines.push(words.planTotal(formatNcg(plan.total)));
  if (plan.picks.length > 0) lines.push(words.planActions(plan.actions));
  if (plan.shortfall > 0) lines.push(words.planShortfall(formatNcg(plan.shortfall / 1e9)));
  else if (plan.surplus > 0) lines.push(words.planSurplus(formatNcg(plan.surplus / 1e9)));
  return lines;
};
