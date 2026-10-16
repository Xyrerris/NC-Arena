/**
 * A purchase, from the person's "buy" to its end, in the order that keeps them safe (ADR-0044,
 * "Next: buying", step D).
 *
 * 1. **The rules** (`checkPurchase`) run on the offer as the market has it now. A refusal ends it,
 *    with nothing written: a purchase that never began leaves no record.
 * 2. **The record** is written — `prepared` — *before* the key is touched, so whatever happens next
 *    leaves a trace.
 * 3. **The signature**: the offer is built into a transaction, a node assembles it, it is checked
 *    field by field, and signed (`dryRunPurchase`).
 * 4. **A dry run stops there**: the record moves to `dry-run` with the id the transaction would have.
 *    **A live purchase goes on** and stages it, through a `TransactionSender` it must be handed —
 *    without one, a live request is answered `live-unavailable` before anything is written.
 *
 * What staging can answer, and what the record says for each:
 *
 * - **The node accepts**: `sent`, with the transaction's id (known before sending: the SHA-256 of
 *   the signed bytes). `awaitPurchase` then watches the id until the chain decides.
 * - **The node says no**: `failed`. Nothing was accepted, so the offer is free again.
 * - **No clear answer** (a timeout, a dropped connection): `sent`, *not* `failed` — it may be on its
 *   way, and a record that said otherwise would let the same piece be bought twice. The wait on the
 *   id settles it.
 *
 * And what waiting can end in. `SUCCESS` → `confirmed`. `FAILURE` → `failed`, with the chain's
 * reason. A node that stops knowing the id, or no answer in time, is **unknown** and stays `sent`:
 * the offer stays blocked until a person has looked, because freeing it on a guess is how one buys
 * a piece twice.
 *
 * A log that cannot be read is refused, not replaced: writing a fresh one over it would erase the
 * very records that say what was bought. Storing the key is not this file's: it is handed
 * `privateKey` and uses it for the one signature.
 */

import { sha256 } from '@noble/hashes/sha2.js';

import type { Planet } from '../model';
import { hexToBytes } from './bencodex';
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
import type { TransactionSender } from './transactionSender';
import type { TransactionSource } from './transactionSource';

export interface PurchaseRequest extends Omit<PolicyInput, 'log' | 'planet'> {
  readonly planet: Planet;
  readonly mode: PurchaseMode;
  readonly source: TransactionSource;
  /**
   * The only thing that can send. Needed for `live`; a dry run is not given one and cannot send.
   */
  readonly sender?: TransactionSender;
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
  | { readonly kind: 'failed'; readonly error: DryRunError; readonly recordId: string }
  /** The node accepted it, or did not answer: either way it may be on its way. Wait on the id. */
  | {
      readonly kind: 'sent';
      readonly recordId: string;
      readonly transactionId: string;
      /** True when the node gave no clear answer to the send. */
      readonly uncertain: boolean;
    }
  /** The node answered no: nothing was staged. */
  | { readonly kind: 'not-accepted'; readonly message: string; readonly recordId: string };

const encoder = new TextEncoder();

/**
 * 16 bytes for the action's own id. The id only has to be unique to the attempt (the nonce, not
 * this, is what stops a replay), and a phone's JS engine may have no secure random source to ask, so
 * it is derived: a hash of the offer, the moment and a number the caller draws. Not a secret.
 */
export const deriveActionId = (productId: string, at: number, entropy: number): Uint8Array =>
  sha256(encoder.encode(`action|${productId}|${at}|${entropy}`)).slice(0, 16);

/** An id for a record, unique enough to tell one attempt from another in a log of a few hundred. */
export const deriveRecordId = (at: number, entropy: number): string =>
  `${at.toString(36)}-${Math.floor(entropy * 36 ** 6).toString(36)}`;

export async function runPurchase(request: PurchaseRequest): Promise<PurchaseOutcome> {
  if (request.mode === 'live' && request.sender === undefined) return { kind: 'live-unavailable' };

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

  const change = (patch: Parameters<typeof updateRecord>[2]): void => {
    request.log.write(updateRecord(request.log.read().records, record.id, patch));
  };

  if (!result.ok) {
    change({ status: 'failed', note: `${result.error.stage}: ${result.error.message}` });
    return { kind: 'failed', error: result.error, recordId: record.id };
  }

  if (request.mode === 'dry-run' || request.sender === undefined) {
    change({
      status: 'dry-run',
      transactionId: result.value.transactionId,
      note: 'signed, not sent',
    });
    return { kind: 'dry-run', run: result.value, recordId: record.id };
  }

  // From here the transaction may exist on the chain whatever happens, and its id is already known.
  const transactionId = result.value.transactionId;
  const staged = await request.sender.stage(request.planet, hexToBytes(result.value.signedHex));

  if (!staged.ok) {
    if (staged.error.kind === 'REFUSED') {
      change({ status: 'failed', transactionId, note: `not accepted: ${staged.error.message}` });
      return { kind: 'not-accepted', message: staged.error.message, recordId: record.id };
    }
    // No clear answer: it may have been heard, so it is recorded as sent.
    change({
      status: 'sent',
      transactionId,
      note: `no answer to the send (${staged.error.message}): waiting for the result`,
    });
    return { kind: 'sent', recordId: record.id, transactionId, uncertain: true };
  }

  change({
    status: 'sent',
    transactionId,
    note: staged.value === transactionId ? 'sent' : `sent; the node named it ${staged.value}`,
  });
  return { kind: 'sent', recordId: record.id, transactionId, uncertain: false };
}

export type AwaitOutcome =
  | { readonly kind: 'confirmed'; readonly blockIndex: number | null }
  | { readonly kind: 'failed'; readonly reason: string }
  /** Neither a success nor a failure the chain reported: the offer stays blocked until someone looks. */
  | { readonly kind: 'unknown'; readonly message: string };

export interface AwaitRequest {
  readonly planet: Planet;
  readonly sender: TransactionSender;
  readonly log: PurchaseLogStore;
  readonly recordId: string;
  readonly transactionId: string;
  /** Waits between two looks. Injected so a test does not wait. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  /** How long an unknown id is read as "not heard of it yet" before it is read as "gone". */
  readonly invalidGraceMs?: number;
  /** Told after each look, so a screen can show that it is still waiting. */
  readonly onLook?: (status: string) => void;
}

/** Why a transaction the chain refused was refused, in words a buyer follows. */
export function describeFailure(exceptions: readonly string[]): string {
  const names = exceptions.map((name) => name.split('.').pop() ?? name).join(', ');
  if (names.includes('ProductNotFound')) return 'the piece was already sold or withdrawn.';
  if (names.includes('InsufficientBalance') || names.includes('NotEnoughFungibleAssetValue')) {
    return 'not enough NCG, or not enough Mead for the fee.';
  }
  if (names.includes('FailedLoadState')) {
    return 'the avatar does not exist or is not this account’s.';
  }
  if (names.includes('InvalidAddress')) return 'a purchase cannot be made from oneself.';
  return names === '' ? 'no reason given.' : `${names}.`;
}

/**
 * Watches a sent transaction until the chain decides, and settles the record. Never frees an offer
 * on a guess: only a failure the chain itself reports does.
 */
export async function awaitPurchase(request: AwaitRequest): Promise<AwaitOutcome> {
  const interval = request.intervalMs ?? 5_000;
  const timeout = request.timeoutMs ?? 180_000;
  const grace = request.invalidGraceMs ?? 60_000;

  const settle = (patch: Parameters<typeof updateRecord>[2]): void => {
    request.log.write(updateRecord(request.log.read().records, request.recordId, patch));
  };

  for (let elapsed = 0; elapsed <= timeout; elapsed += interval) {
    if (elapsed > 0) await request.sleep(interval);

    const look = await request.sender.result(request.planet, request.transactionId);
    // A node that cannot be reached for one look is not a verdict.
    if (!look.ok) continue;
    request.onLook?.(look.value.status);

    switch (look.value.status) {
      case 'SUCCESS':
        settle({ status: 'confirmed', note: 'executed on the chain' });
        return { kind: 'confirmed', blockIndex: look.value.blockIndex };
      case 'FAILURE': {
        const reason = describeFailure(look.value.exceptions);
        settle({ status: 'failed', note: `the chain refused it: ${reason}` });
        return { kind: 'failed', reason };
      }
      case 'INVALID':
        if (elapsed >= grace) {
          const message =
            'the node no longer knows this transaction; whether it went through is not known.';
          settle({ note: message });
          return { kind: 'unknown', message };
        }
        break;
      default:
        break;
    }
  }

  const message = 'still waiting for the chain; check again later.';
  settle({ note: message });
  return { kind: 'unknown', message };
}
