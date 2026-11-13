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

/** How many pieces go into one transaction. A failure of the whole costs at most this many to retry. */
export const BULK_CHUNK_SIZE = 10;

/** What buying a group of pieces in one transaction came to. */
export type ChunkAnswer =
  /** One outcome per piece, in the order given. The group was bought, or refused piece by piece. */
  | { readonly kind: 'done'; readonly outcomes: readonly StepOutcome[] }
  /**
   * The chain refused the whole transaction because a piece in it was already sold or withdrawn:
   * nothing was bought, and the group can be split to find the piece.
   */
  | { readonly kind: 'piece-gone' };

export interface BulkBatchRequest {
  readonly items: readonly BatchItem[];
  /** The account's NCG before the first piece, or null when it is not known. */
  readonly balanceNcg: number | null;
  readonly chunkSize?: number;
  /** Buys a group in one transaction, given what the account has left. Must settle it first. */
  readonly buyChunk: (
    items: readonly BatchItem[],
    balanceNcg: number | null,
  ) => Promise<ChunkAnswer>;
  /** Told when a piece begins (`outcome` null) and when it ends. */
  readonly onStep?: (index: number, item: BatchItem, outcome: StepOutcome | null) => void;
}

const SOLD_MEANWHILE: StepOutcome = {
  kind: 'refused',
  refusal: {
    code: 'GONE',
    message: 'It was sold or withdrawn just as it was being bought. No NCG was spent on it.',
  },
};

/**
 * The batch in groups: each group is one transaction, and the groups go one after another, each
 * settled before the next. The stopping rule is `runBatch`'s, per piece.
 *
 * A transaction is all or nothing, so one piece sold in the meantime fails the whole group. That
 * one failure — and only that one — is answered by **splitting the group in half** and buying each
 * half again (the caller reads the offers again each time), down to a single piece, which is then
 * skipped as sold. A failure for any other reason is not understood and ends the batch.
 */
export async function runBulkBatch(request: BulkBatchRequest): Promise<BatchResult> {
  const size = Math.max(1, request.chunkSize ?? BULK_CHUNK_SIZE);
  const indexOf = new Map(request.items.map((item, index) => [item.key, index] as const));
  const steps: BatchStep[] = [];
  // An object, not a `let`: the closures below change it, and a `let` would be read as still null.
  const state: { stoppedAt: BatchStep | null; balance: number | null; spent: number } = {
    stoppedAt: null,
    balance: request.balanceNcg === null ? null : cents(request.balanceNcg),
    spent: 0,
  };

  const note = (item: BatchItem, outcome: StepOutcome): void => {
    const step: BatchStep = { item, outcome };
    steps.push(step);
    request.onStep?.(indexOf.get(item.key) ?? steps.length - 1, item, outcome);
    if (spends(outcome)) {
      const price = cents(item.shown.price);
      state.spent += price;
      if (state.balance !== null) state.balance -= price;
    }
    if (state.stoppedAt === null && !continuesAfter(outcome)) state.stoppedAt = step;
  };

  const attempt = async (group: readonly BatchItem[]): Promise<void> => {
    for (const item of group) request.onStep?.(indexOf.get(item.key) ?? 0, item, null);

    let answer: ChunkAnswer;
    try {
      answer = await request.buyChunk(group, state.balance === null ? null : state.balance / 100);
    } catch (cause) {
      // Not understood, and the transaction may have been sent: the batch ends.
      const message = cause instanceof Error ? cause.message : 'The purchase stopped unexpectedly.';
      answer = { kind: 'done', outcomes: group.map(() => ({ kind: 'problem', message })) };
    }

    if (answer.kind === 'piece-gone') {
      if (group.length > 1) {
        const middle = Math.ceil(group.length / 2);
        await attempt(group.slice(0, middle));
        if (state.stoppedAt === null) await attempt(group.slice(middle));
        return;
      }
      answer = { kind: 'done', outcomes: [SOLD_MEANWHILE] };
    }

    for (const [position, item] of group.entries()) {
      note(
        item,
        answer.outcomes[position] ?? {
          kind: 'problem',
          message: 'The purchase gave no answer for this piece.',
        },
      );
    }
  };

  for (let start = 0; start < request.items.length && state.stoppedAt === null; start += size) {
    await attempt(request.items.slice(start, start + size));
  }

  return {
    steps,
    stoppedAt: state.stoppedAt,
    notAttempted: request.items.slice(steps.length),
    spentNcg: state.spent / 100,
  };
}
