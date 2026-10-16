/**
 * `TransactionSender` over a plain node's GraphQL (ADR-0044, "Next: buying", step D).
 *
 * Observed on Heimdall 2026-10-16 (by schema introspection and a read of an unknown id; the stage
 * mutation has not been called by this code): `mutation { stageTransaction(payload) }` takes the
 * signed transaction as hex; `transaction { transactionResult(txId) { txStatus blockIndex
 * exceptionNames } }` answers `INVALID`, with null block and exceptions, for an id the node does
 * not know.
 *
 * **Stage is classified, not just failed.** A GraphQL error in an answer is the node saying no
 * (`REFUSED`: nothing was staged). Anything where the request may have been heard but no clear
 * answer came back — a timeout, a dropped connection, an answer that is neither an error nor an id —
 * is `UNCERTAIN`, and the caller waits on the transaction's id instead of assuming.
 *
 * Only this class can stage. The values in the query are checked against strict patterns first.
 */

import { z } from 'zod';

import {
  err,
  ok,
  type Result,
  type StageError,
  type TransactionResult,
  type TransactionSender,
  type TransactionSourceError,
} from '../common';
import { bytesToHex } from '../common/bencodex';
import type { Planet } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import { NODE_ENDPOINTS } from './nodeCollectionSource';

const TX_ID = /^[0-9a-fA-F]{64}$/;

const resultSchema = z.object({
  txStatus: z.enum(['INVALID', 'STAGING', 'INCLUDED', 'SUCCESS', 'FAILURE']),
  blockIndex: z.number().int().safe().nullish(),
  exceptionNames: z.array(z.string().nullable()).nullish(),
});

export class NodeTransactionSender implements TransactionSender {
  readonly name = 'node';

  constructor(private readonly endpoints: Partial<Record<Planet, string>> = NODE_ENDPOINTS) {}

  async stage(planet: Planet, signed: Uint8Array): Promise<Result<string, StageError>> {
    const endpoint = this.endpoints[planet];
    if (endpoint === undefined) {
      return err({ kind: 'REFUSED', message: `${this.name}: it does not serve ${planet}.` });
    }
    if (signed.length === 0) {
      return err({ kind: 'REFUSED', message: `${this.name}: there is nothing to send.` });
    }

    const response = await postGraphql(
      endpoint,
      `mutation { stageTransaction(payload: "${bytesToHex(signed)}") }`,
    );
    if (!response.ok) {
      // No clear answer: it may have been heard.
      return err({
        kind: 'UNCERTAIN',
        message: networkFailure(this.name, response.error).message,
      });
    }

    const { data, errors } = response.value;
    const first = errors[0];
    if (first !== undefined) {
      return err({ kind: 'REFUSED', message: `${this.name}: ${first.message}` });
    }
    const id =
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>).stageTransaction
        : undefined;
    if (typeof id !== 'string' || !TX_ID.test(id)) {
      return err({
        kind: 'UNCERTAIN',
        message: `${this.name}: the answer to the send was not a transaction id.`,
      });
    }
    return ok(id.toLowerCase());
  }

  async result(
    planet: Planet,
    transactionId: string,
  ): Promise<Result<TransactionResult, TransactionSourceError>> {
    const endpoint = this.endpoints[planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${planet}.`));
    if (!TX_ID.test(transactionId)) return err(this.failed('the transaction id is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ transaction { transactionResult(txId: "${transactionId.toLowerCase()}") ` +
        '{ txStatus blockIndex exceptionNames } } }',
    );
    if (!response.ok) return err(networkFailure(this.name, response.error));

    const raw =
      typeof response.value.data === 'object' && response.value.data !== null
        ? (response.value.data as { transaction?: { transactionResult?: unknown } }).transaction
            ?.transactionResult
        : undefined;
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) {
      return err(this.failed(response.value.errors[0]?.message ?? 'the result did not parse.'));
    }
    return ok({
      status: parsed.data.txStatus,
      blockIndex: parsed.data.blockIndex ?? null,
      exceptions: (parsed.data.exceptionNames ?? []).filter(
        (name): name is string => name !== null,
      ),
    });
  }

  private failed(message: string): TransactionSourceError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
