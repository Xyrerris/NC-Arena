/**
 * A purchase carried out as far as the signature, and **not one step further** (ADR-0044,
 * "Next: buying", step C).
 *
 * It does what a real purchase will do — build the `buy_product3` action, ask a node for the
 * account's nonce and for the unsigned transaction, check that transaction field by field, sign it,
 * check the signature against the key, and have the node attach it — and then it stops, with the
 * signed bytes and the id they would have. It is given a `TransactionSource`, which has no way to
 * send, so stopping is not a promise it keeps but a thing it cannot do otherwise.
 *
 * The key is an argument. It is used and not kept; clearing the bytes is the caller's, who made
 * them. The intended key for a dry run is a throwaway one with nothing on it: a dry run proves the
 * mechanics against the real node, and the node never sees the key either way.
 *
 * Every stage that can fail names itself, so a refusal says what was refused and where.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';

import type { Planet } from '../model';
import {
  bytesToHex,
  decodeBencodex,
  dictGet,
  encodeBencodex,
  isBencodexDict,
  type BencodexValue,
} from './bencodex';
import { err, ok, type Result } from './result';
import {
  addressOfPublicKey,
  buildBuyProduct,
  plainValueHex,
  signMessage,
  transactionId,
  verifySignature,
  verifyUnsigned,
  type PurchaseOffer,
} from './transaction';
import type { TransactionSource } from './transactionSource';

export type DryRunStage =
  'currency' | 'build' | 'nonce' | 'unsigned' | 'verify' | 'sign' | 'attach';

export interface DryRunError {
  readonly stage: DryRunStage;
  readonly message: string;
}

export interface DryRunInput {
  readonly planet: Planet;
  readonly source: TransactionSource;
  /** 32 bytes. Used for the signature and not kept. */
  readonly privateKey: Uint8Array;
  /** The avatar that would receive the piece, as hex. */
  readonly buyerAvatar: string;
  readonly offer: PurchaseOffer;
  /** 16 random bytes for the action's own id. Injected so a test is repeatable. */
  readonly actionId: Uint8Array;
}

export interface DryRun {
  /** The account that would pay, `0x`-prefixed. */
  readonly agentAddress: string;
  readonly nonce: bigint;
  /** The action's Bencodex as hex: what the node was asked to assemble. */
  readonly actionHex: string;
  readonly unsignedHex: string;
  readonly signatureHex: string;
  /** What staging would carry. It is not staged. */
  readonly signedHex: string;
  /** The SHA-256 of the signed bytes: the id this transaction would have. */
  readonly transactionId: string;
}

const stop = (stage: DryRunStage, message: string): Result<never, DryRunError> =>
  err({ stage, message });

export async function dryRunPurchase(input: DryRunInput): Promise<Result<DryRun, DryRunError>> {
  const { planet, source, privateKey } = input;
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  const agent = addressOfPublicKey(publicKey);

  const gold = await source.goldCurrency(planet);
  if (!gold.ok) return stop('currency', gold.error.message);

  const built = buildBuyProduct({
    buyerAvatar: input.buyerAvatar,
    offer: input.offer,
    currency: gold.value.currency,
    decimalPlaces: gold.value.decimalPlaces,
    actionId: input.actionId,
  });
  if (!built.ok) return stop('build', built.error.message);
  const plain = built.value;

  const nonce = await source.nextNonce(planet, `0x${agent}`);
  if (!nonce.ok) return stop('nonce', nonce.error.message);

  const actionHex = plainValueHex(plain);
  const unsigned = await source.unsignedTransaction(planet, {
    publicKeyHex: bytesToHex(publicKey),
    plainValueHex: actionHex,
    nonce: nonce.value,
  });
  if (!unsigned.ok) return stop('unsigned', unsigned.error.message);

  // The one check everything rests on: what is about to be signed is what was asked for, from a
  // node that was only ever asked.
  const mismatch = verifyUnsigned({
    unsigned: unsigned.value,
    plain,
    publicKey,
    nonce: nonce.value,
    genesisHash: source.genesisHash(planet),
  });
  if (mismatch !== null) {
    return stop('verify', `the node returned a different transaction (${mismatch}); not signed.`);
  }

  const signature = signMessage(privateKey, unsigned.value);
  if (!verifySignature(signature, unsigned.value, publicKey)) {
    return stop('sign', 'the signature does not verify against the key.');
  }

  const signed = await source.attachSignature(planet, unsigned.value, signature);
  if (!signed.ok) return stop('attach', signed.error.message);

  const carried = signedCarries(unsigned.value, signed.value, signature);
  if (carried !== null) {
    return stop(
      'attach',
      `the signed transaction is not the unsigned one plus the signature (${carried}).`,
    );
  }

  return ok({
    agentAddress: `0x${agent}`,
    nonce: nonce.value,
    actionHex,
    unsignedHex: bytesToHex(unsigned.value),
    signatureHex: bytesToHex(signature),
    signedHex: bytesToHex(signed.value),
    transactionId: transactionId(signed.value),
  });
}

const sameValue = (a: BencodexValue, b: BencodexValue): boolean =>
  bytesToHex(encodeBencodex(a)) === bytesToHex(encodeBencodex(b));

/**
 * What is wrong with the signed transaction a node returned, or null. It must be the unsigned one
 * with one entry added — the signature, under the key `S` — and nothing changed: a node that
 * altered the body while attaching the signature would hand back something the key never saw.
 */
export function signedCarries(
  unsigned: Uint8Array,
  signed: Uint8Array,
  signature: Uint8Array,
): string | null {
  let before: BencodexValue;
  let after: BencodexValue;
  try {
    before = decodeBencodex(unsigned);
    after = decodeBencodex(signed);
  } catch {
    return 'it is not readable';
  }
  if (!isBencodexDict(before) || !isBencodexDict(after)) return 'it is not a dictionary';

  const attached = dictGet(after, Uint8Array.of('S'.charCodeAt(0)));
  if (!(attached instanceof Uint8Array) || bytesToHex(attached) !== bytesToHex(signature)) {
    return 'the signature is not the one given';
  }
  if (after.entries.length !== before.entries.length + 1) return 'an entry was added or removed';
  for (const [entryKey, value] of before.entries) {
    const same = dictGet(after, entryKey);
    if (same === undefined || !sameValue(same, value)) return 'the body was changed';
  }
  return null;
}
