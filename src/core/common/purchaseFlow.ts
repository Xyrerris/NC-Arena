/**
 * A purchase, from the person's "buy" to the signature, in the order that keeps them safe
 * (ADR-0044, "Next: buying", step D). **Nothing here sends.**
 *
 * 1. **The rules** (`checkPurchase`) run on the offer as the market has it now. A refusal ends it,
 *    with nothing written: a purchase that never began leaves no record.
 * 2. **The record** is written — `prepared` — *before* the key is touched, so whatever happens next
 *    leaves a trace.
 * 3. **The dry run** carries it to the signature and stops, and the record moves to `dry-run` with
 *    the id the transaction would have; or to `failed`, with where it stopped.
 *
 * The mode is the caller's, already resolved (`resolveMode`): `dry-run` is the default and, until the
 * send is built, the only one that resolves. A `live` request that reaches this function anyway is
 * answered `live-unavailable` **before anything is written or signed** — there is no code path here
 * from a live request to a signature, let alone a send.
 *
 * A log that cannot be read is refused, not replaced: writing a fresh one over it would erase the
 * very records that say what was bought.
 *
 * Storing the key is not this file's: it is handed `privateKey` and uses it for the one signature.
 */

import type { Planet } from '../model';
import type { MarketListing } from './marketSource';
import { dryRunPurchase, type DryRun, type DryRunError } from './purchaseDryRun';
import {
  appendRecord,
  updateRecord,
  type PurchaseLogStore,
  type PurchaseRecord,
} from './purchaseLog';
import {
  checkPurchase,
  toPurchaseOffer,
  type PolicyInput,
  type PurchaseMode,
  type Refusal,
} from './purchasePolicy';
import type { PurchaseOffer } from './transaction';
import type { TransactionSource } from './transactionSource';

export interface PurchaseRequest extends Omit<PolicyInput, 'log' | 'planet'> {
  readonly planet: Planet;
  readonly mode: PurchaseMode;
  readonly source: TransactionSource;
  /** 32 bytes. Used for the one signature and not kept. */
  readonly privateKey: Uint8Array;
  readonly log: PurchaseLogStore;
  /** 16 random bytes for the action's own id. */
  readonly actionId: Uint8Array;
  readonly now: () => number;
  readonly newId: () => string;
}

export type PurchaseOutcome =
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'dry-run'; readonly run: DryRun; readonly recordId: string }
  | { readonly kind: 'live-unavailable' }
  | { readonly kind: 'failed'; readonly error: DryRunError; readonly recordId: string };

export async function runPurchase(request: PurchaseRequest): Promise<PurchaseOutcome> {
  if (request.mode === 'live') return { kind: 'live-unavailable' };

  const stored = request.log.read();
  if (stored.unreadable) {
    return {
      kind: 'refused',
      refusal: {
        code: 'LOG_UNREADABLE',
        message: 'The record of purchases could not be read, so nothing is bought over it.',
      },
    };
  }
  const refusal = checkPurchase({ ...request, log: stored.records });
  if (refusal !== null) return { kind: 'refused', refusal };

  // `checkPurchase` has refused a missing offer and anything that is not single equipment.
  const fresh = request.fresh as MarketListing;
  const offer = toPurchaseOffer(fresh) as PurchaseOffer;

  const record: PurchaseRecord = {
    id: request.newId(),
    productId: fresh.productId,
    planet: request.planet,
    itemId: fresh.itemId,
    price: fresh.price,
    mode: request.mode,
    status: 'prepared',
    at: request.now(),
    transactionId: null,
    note: null,
  };
  // Written first, and read back from the store each time it changes: the log is the truth, and
  // this function's copy of it is not.
  request.log.write(appendRecord(stored.records, record));

  const result = await dryRunPurchase({
    planet: request.planet,
    source: request.source,
    privateKey: request.privateKey,
    buyerAvatar: request.buyerAvatar,
    offer,
    actionId: request.actionId,
  });

  const current = request.log.read().records;
  if (!result.ok) {
    request.log.write(
      updateRecord(current, record.id, {
        status: 'failed',
        note: `${result.error.stage}: ${result.error.message}`,
      }),
    );
    return { kind: 'failed', error: result.error, recordId: record.id };
  }

  request.log.write(
    updateRecord(current, record.id, {
      status: 'dry-run',
      transactionId: result.value.transactionId,
      note: 'signed, not sent',
    }),
  );
  return { kind: 'dry-run', run: result.value, recordId: record.id };
}
