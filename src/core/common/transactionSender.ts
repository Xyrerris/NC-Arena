/**
 * The port behind "put a signed transaction on the chain and see what became of it" (ADR-0044,
 * "Next: buying", step D). **This is the one place in the app that can spend.**
 *
 * It is a port of its own, apart from `TransactionSource`, on purpose. Everything up to the signature
 * is a question put to a node and moves nothing; staging is the act. Keeping them apart means the code
 * that only prepares (the dry run, the card's checks) is handed a thing that has no way to send, and
 * the code that sends has to be handed this one by name.
 *
 * **Two ways a stage can go wrong, and they are not the same.** `REFUSED`: a node answered and said no
 * — the transaction was not accepted, so nothing happened and the offer is free again. `UNCERTAIN`:
 * the request was sent and no answer came back (a timeout, a dropped connection, a node that failed
 * mid-reply), so the transaction **may well be on its way**. A caller that treats the second like the
 * first can buy the same piece twice; one that treats the first like the second can never buy it.
 * Signed bytes have one identity (their SHA-256), so staging them again is the same transaction and
 * not a second one — which is what makes waiting on the id the right answer to doubt.
 */

import type { Planet } from '../model';
import type { Result } from './result';
import type { TransactionSourceError } from './transactionSource';

export type TransactionStatus = 'INVALID' | 'STAGING' | 'INCLUDED' | 'SUCCESS' | 'FAILURE';

export interface TransactionResult {
  readonly status: TransactionStatus;
  readonly blockIndex: number | null;
  /** The names of what the actions threw, when it failed. */
  readonly exceptions: readonly string[];
}

export interface StageError {
  readonly kind: 'REFUSED' | 'UNCERTAIN';
  readonly message: string;
}

export interface TransactionSender {
  readonly name: string;
  /** Sends the signed bytes. Success is the transaction's id, as the node reports it. */
  stage(planet: Planet, signed: Uint8Array): Promise<Result<string, StageError>>;
  /** Where a transaction stands. `INVALID` is "the node does not know it" — early on, only "not yet". */
  result(
    planet: Planet,
    transactionId: string,
  ): Promise<Result<TransactionResult, TransactionSourceError>>;
}
