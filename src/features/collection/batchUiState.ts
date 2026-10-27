/**
 * What the batch sheet says, as plain values (ADR-0044, the cart, step 2b): which of the selected
 * offers can be bought from here, and every sentence for a step or for the end of the batch.
 *
 * The rules of a batch — the ceiling, the money, the order, where it stops — are
 * `core/common/purchaseBatch`'s. This file only decides what is in it and how it is worded, and
 * keeps one promise in the wording: a piece whose fate is not known is never described as failed, so
 * the person does not buy it a second time.
 */

import type { Offer } from '@/core/collection';
import {
  batchTotal,
  type BatchItem,
  type BatchResult,
  type StepOutcome,
} from '@/core/common/purchaseBatch';
import { toPurchaseOffer } from '@/core/common/purchasePolicy';

import { formatNcg, pieceAsListed, type MarketPiece } from './marketUiState';
import { shortTransactionId } from './purchaseAttemptState';
import { collectionStrings as words } from './strings';

export interface BatchPlan {
  /** Every listing to buy, in the order of the offers and of the lots within each. */
  readonly items: readonly BatchItem[];
  /** Selected offers left out because a purchase cannot do them yet (not single equipment). */
  readonly excluded: number;
  /** What the items cost together, in NCG. */
  readonly total: number;
}

/**
 * The batch a selection makes. An offer is bought whole or not at all: if any of its lots is not a
 * single piece of equipment the offer is left out, since buying part of a count would leave the
 * collection no nearer.
 */
export const batchPlan = (
  chosen: readonly { readonly offer: Offer; readonly piece: MarketPiece }[],
): BatchPlan => {
  const items: BatchItem[] = [];
  let excluded = 0;
  for (const { offer, piece } of chosen) {
    if (offer.picks.some((listing) => toPurchaseOffer(listing) === null)) {
      excluded += 1;
      continue;
    }
    for (const listing of offer.picks) {
      items.push({
        key: listing.productId,
        shown: listing,
        label: pieceAsListed(piece, listing).label,
      });
    }
  }
  return { items, excluded, total: batchTotal(items) };
};

export const batchLines = (plan: BatchPlan): { readonly key: string; readonly text: string }[] =>
  plan.items.map((item) => ({
    key: item.key,
    text: `${item.label} · ${formatNcg(item.shown.price)} NCG`,
  }));

export const totalLine = (plan: BatchPlan): string =>
  words.batchTotalLine(plan.items.length, formatNcg(plan.total));

export const limitLine = (limit: number | null): string =>
  words.batchLimitLine(limit === null ? null : formatNcg(limit));

export interface StepUi {
  readonly tone: 'subtle' | 'accent' | 'negative';
  readonly text: string;
}

export const describeStep = (outcome: StepOutcome): StepUi => {
  switch (outcome.kind) {
    case 'refused':
      return { tone: 'subtle', text: words.batchSkipped(outcome.refusal.message) };
    case 'signed':
      return { tone: 'accent', text: words.batchSigned(shortTransactionId(outcome.transactionId)) };
    case 'confirmed':
      return { tone: 'accent', text: words.batchBought(shortTransactionId(outcome.transactionId)) };
    case 'chain-failed':
      return { tone: 'negative', text: words.batchChainFailed(outcome.reason) };
    case 'unknown':
      return {
        tone: 'negative',
        text: words.batchUnknown(outcome.message, shortTransactionId(outcome.transactionId)),
      };
    case 'not-accepted':
      return { tone: 'negative', text: words.batchNotAccepted(outcome.message) };
    case 'problem':
      return { tone: 'negative', text: outcome.message };
  }
};

/** The line that closes the batch: all of it, or where it stopped and what was left alone. */
export const describeResult = (result: BatchResult, dryRun: boolean): StepUi => {
  const done = result.steps.filter(
    (step) => step.outcome.kind === 'signed' || step.outcome.kind === 'confirmed',
  ).length;
  if (result.stoppedAt === null) {
    return dryRun
      ? { tone: 'accent', text: words.batchAllDry(done) }
      : { tone: 'accent', text: words.batchAllBought(done, formatNcg(result.spentNcg)) };
  }
  const spent =
    !dryRun && result.spentNcg > 0 ? ` ${words.batchSpent(formatNcg(result.spentNcg))}` : '';
  return {
    tone: 'negative',
    text: words.batchStopped(result.stoppedAt.item.label, result.notAttempted.length) + spent,
  };
};
