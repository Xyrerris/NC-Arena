/**
 * Reading the market for enhancement material (the upgrade plan, phase 2): which items to ask
 * about, and the queue that asks. No React and no `core/data`: the caller hands in the scan, so the
 * same queue serves the screen and a test.
 *
 * - **Candidates come from the sheet**, not from a list kept here: every equipment item of grade 7 or
 *   more in a slot the market sells (Aura and Grimoire have no listings). That is 75 ids today, and a
 *   new grade adds its five slots by itself when the node's sheet has it.
 * - **Highest grade first, grade 7 last.** Grade 7 is the biggest read (the commonest item has 4,646
 *   listings, five pages) and the one with the least to gain, so a stopped read has the grades that
 *   matter already.
 * - **Three at a time**, as the offers view reads (measured on 2026-10-20: four to five times faster
 *   than one after another, none failed).
 */

import type { MarketError, MarketListing, Result } from '../common';
import { equipmentRoute } from './marketMatch';
import type { BaseExpByItem } from './upgradeExp';

export interface MaterialCandidate {
  readonly itemId: number;
  /** lib9c's `ItemSubType`, which is also the market route. */
  readonly itemSubType: number;
  readonly slot: string;
  readonly grade: number;
}

/** Grade 7 is Valkyrie, the lowest the plan buys. */
export const MIN_MATERIAL_GRADE = 7;
/** Scans in flight together. */
export const MATERIAL_SCAN_CONCURRENCY = 3;

/** The items worth asking the market about, highest grade first. */
export function materialCandidates(
  base: BaseExpByItem,
  options: { readonly minGrade?: number } = {},
): readonly MaterialCandidate[] {
  const minGrade = options.minGrade ?? MIN_MATERIAL_GRADE;
  const found: MaterialCandidate[] = [];
  for (const [itemId, item] of base) {
    const itemSubType = equipmentRoute(item.slot);
    if (itemSubType === undefined || item.grade < minGrade || item.exp <= 0) continue;
    found.push({ itemId, itemSubType, slot: item.slot, grade: item.grade });
  }
  return found.sort((a, b) => b.grade - a.grade || a.itemId - b.itemId);
}

export type MaterialOutcome =
  | { readonly kind: 'ready'; readonly listings: readonly MarketListing[] }
  | { readonly kind: 'failed' };

export type ScanMaterial = (
  candidate: MaterialCandidate,
  signal: AbortSignal,
) => Promise<Result<readonly MarketListing[], MarketError>>;

export interface ReadMaterialOptions {
  readonly signal: AbortSignal;
  /** Called once per candidate as soon as it is answered, in whatever order the scans finish. */
  readonly onSettled: (candidate: MaterialCandidate, outcome: MaterialOutcome) => void;
  readonly concurrency?: number;
}

/**
 * Asks about every candidate, `concurrency` at a time, and reports each answer as it comes. A
 * failed scan is reported and the read goes on; a stopped one (the signal, or the scan saying
 * CANCELLED) ends the read quietly, with nothing more to report.
 */
export async function readMaterialMarket(
  candidates: readonly MaterialCandidate[],
  scan: ScanMaterial,
  { signal, onSettled, concurrency = MATERIAL_SCAN_CONCURRENCY }: ReadMaterialOptions,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const candidate = candidates[next++];
      if (candidate === undefined) return;
      const result = await scan(candidate, signal);
      if (signal.aborted) return;
      if (result.ok) {
        onSettled(candidate, { kind: 'ready', listings: result.value });
      } else if (result.error.reason === 'CANCELLED') {
        return;
      } else {
        onSettled(candidate, { kind: 'failed' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
}
