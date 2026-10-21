/**
 * Several purchases in one go, each of them a purchase exactly as one is made alone (ADR-0044, the
 * cart, step 2b).
 *
 * **A batch is not a bigger purchase.** Each piece is its own transaction, run through the same
 * `runPurchase` and `awaitPurchase` as a single one: the rules, the record written first, the
 * signature, the wait for the chain. What the batch adds is only what a list of them needs, and it
 * only ever *adds refusals*:
 *
 * - **Before anything**, `checkBatch`: a ceiling on the whole batch (**none set means no batch**, as
 *   with the limit per purchase), the account covers the total, nothing is bought twice, and nothing
 *   is in the batch that a purchase cannot do yet.
 * - **One at a time, in order, each settled before the next begins.** The balance handed to each is
 *   what is left after the ones before it, so a batch cannot spend the same money twice.
 * - **It stops at doubt.** A piece that was sold meanwhile, whose price moved, that is already in the
 *   record, that is the buyer's own or over the limit, moves no money and is skipped; the batch goes
 *   on. Anything else — a chain failure, a send with no verdict, a node that said no, a signature
 *   that could not be made, an account or balance problem — ends the batch there, and the pieces
 *   after it are *not attempted*. Carrying on past something that is not understood is how a second
 *   mistake is made.
 *
 * The orchestration is separate from the buying on purpose: `buy` is whatever turns one item into an
 * outcome (the app gives it `runPurchase` and `awaitPurchase`), so the order, the balance and the
 * stopping rule are tested without a node.
 */

import type { MarketListing } from './marketSource';
import { toPurchaseOffer, type Refusal, type RefusalCode } from './purchasePolicy';

export interface BatchItem {
  /** Stable within the batch: the listing's product id. */
  readonly key: string;
  /** The offer as the person saw it, and the price they confirmed with it. */
  readonly shown: MarketListing;
  readonly label: string;
}

export type BatchRefusalCode =
  | 'EMPTY'
  | 'NOT_BUYABLE'
  | 'DUPLICATE'
  | 'NO_BATCH_LIMIT'
  | 'OVER_BATCH_LIMIT'
  | 'NO_BALANCE'
  | 'SHORT';

export interface BatchRefusal {
  readonly code: BatchRefusalCode;
  readonly message: string;
}

const cents = (ncg: number): number => Math.round(ncg * 100);

/** What the pieces cost together, in NCG, summed in whole hundredths. */
export const batchTotal = (items: readonly BatchItem[]): number =>
  items.reduce((sum, item) => sum + cents(item.shown.price), 0) / 100;

export interface BatchCheckInput {
  readonly items: readonly BatchItem[];
  /** The ceiling on the whole batch in NCG, or null when none is set. */
  readonly batchLimitNcg: number | null;
  /** The account's NCG, or null when it could not be read. */
  readonly balanceNcg: number | null;
}

export function checkBatch(input: BatchCheckInput): BatchRefusal | null {
  const { items } = input;
  if (items.length === 0) return { code: 'EMPTY', message: 'There is nothing in the batch.' };

  if (items.some((item) => toPurchaseOffer(item.shown) === null)) {
    return {
      code: 'NOT_BUYABLE',
      message:
        'Only single pieces of equipment can be bought so far; the batch holds something else.',
    };
  }
  if (new Set(items.map((item) => item.shown.productId)).size !== items.length) {
    return { code: 'DUPLICATE', message: 'The same offer is in the batch twice.' };
  }
  if (input.batchLimitNcg === null) {
    return {
      code: 'NO_BATCH_LIMIT',
      message: 'Set a limit for a whole batch first: with none, no batch can be bought.',
    };
  }
  const total = cents(batchTotal(items));
  if (total > cents(input.batchLimitNcg)) {
    return {
      code: 'OVER_BATCH_LIMIT',
      message: `Together these cost more than your batch limit of ${input.batchLimitNcg} NCG.`,
    };
  }
  if (input.balanceNcg === null) {
    return {
      code: 'NO_BALANCE',
      message: 'Your balance could not be read, so it is not known to cover the batch.',
    };
  }
  if (total > cents(input.balanceNcg)) {
    return { code: 'SHORT', message: 'Your balance is below the total of the batch.' };
  }
  return null;
}

/** What buying one piece came to. `signed` is a dry run's end; `confirmed` a real one's. */
export type StepOutcome =
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'signed'; readonly transactionId: string }
  | { readonly kind: 'confirmed'; readonly transactionId: string }
  | { readonly kind: 'chain-failed'; readonly transactionId: string; readonly reason: string }
  | { readonly kind: 'unknown'; readonly transactionId: string; readonly message: string }
  | { readonly kind: 'not-accepted'; readonly message: string }
  | { readonly kind: 'problem'; readonly message: string };

/** Refusals that are about this piece alone: no money moved, and the next piece is unaffected. */
const SKIPPABLE: ReadonlySet<RefusalCode> = new Set([
  'GONE',
  'PRICE_MOVED',
  'ALREADY',
  'SELF',
  'OVER_LIMIT',
  'NOT_EQUIPMENT',
]);

/** Whether the batch goes on after this outcome. Everything not named here ends it. */
export const continuesAfter = (outcome: StepOutcome): boolean => {
  switch (outcome.kind) {
    case 'signed':
    case 'confirmed':
      return true;
    case 'refused':
      return SKIPPABLE.has(outcome.refusal.code);
    default:
      return false;
  }
};

/** Whether the price of the piece is gone from the balance for the pieces that follow. */
const spends = (outcome: StepOutcome): boolean =>
  outcome.kind === 'signed' || outcome.kind === 'confirmed';

export interface BatchStep {
  readonly item: BatchItem;
  readonly outcome: StepOutcome;
}

export interface BatchResult {
  readonly steps: readonly BatchStep[];
  /** The step that ended the batch, or null when every piece was attempted. */
  readonly stoppedAt: BatchStep | null;
  /** Pieces after the one that ended it: nothing was done for them. */
  readonly notAttempted: readonly BatchItem[];
  /** What the pieces that were bought (or, in a dry run, signed) cost in all, in NCG. */
  readonly spentNcg: number;
}

export interface BatchRequest {
  readonly items: readonly BatchItem[];
  /** The account's NCG before the first piece, or null when it is not known. */
  readonly balanceNcg: number | null;
  /** Buys one piece, given what the account has left. Must settle it before it answers. */
  readonly buy: (item: BatchItem, balanceNcg: number | null) => Promise<StepOutcome>;
  /** Told when a piece begins (`outcome` null) and when it ends. */
  readonly onStep?: (index: number, item: BatchItem, outcome: StepOutcome | null) => void;
}

export async function runBatch(request: BatchRequest): Promise<BatchResult> {
  const steps: BatchStep[] = [];
  let balance = request.balanceNcg === null ? null : cents(request.balanceNcg);
  let spent = 0;

  for (const [index, item] of request.items.entries()) {
    request.onStep?.(index, item, null);

    let outcome: StepOutcome;
    try {
      outcome = await request.buy(item, balance === null ? null : balance / 100);
    } catch (cause) {
      // Whatever it was, it is not understood, and the piece may have been sent: the batch ends.
      outcome = {
        kind: 'problem',
        message: cause instanceof Error ? cause.message : 'The purchase stopped unexpectedly.',
      };
    }
    const step: BatchStep = { item, outcome };
    steps.push(step);
    request.onStep?.(index, item, outcome);

    if (spends(outcome)) {
      const price = cents(item.shown.price);
      spent += price;
      if (balance !== null) balance -= price;
    }
    if (!continuesAfter(outcome)) {
      return {
        steps,
        stoppedAt: step,
        notAttempted: request.items.slice(index + 1),
        spentNcg: spent / 100,
      };
    }
  }
  return { steps, stoppedAt: null, notAttempted: [], spentNcg: spent / 100 };
}
