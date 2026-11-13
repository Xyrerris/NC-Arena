/**
 * The port behind "ask a node about a transaction" (ADR-0044, "Next: buying", step C).
 *
 * Four questions, and only four: what is the account's next nonce, what is the gold currency, how
 * does a node assemble this action into an unsigned transaction, and what does the transaction look
 * like with this signature attached. None of them moves anything: the node is never handed a key,
 * and none of them puts a transaction on the chain.
 *
 * **There is no method here that sends.** Staging a transaction is what spends, and it is a
 * separate step (D) with its own port; leaving it out of this one means a dry run cannot send by
 * mistake, because the thing it is given has no way to. Same placement as `MarketSource`:
 * `core/network` implements it and the code that uses it sits above.
 */

import type { Planet } from '../model';
import type { BencodexValue } from './bencodex';
import type { CollectionFailure } from './collectionSource';
import type { Result } from './result';

export interface TransactionSourceError {
  readonly reason: CollectionFailure;
  readonly message: string;
}

/** The gold currency exactly as the chain wrote it, and its decimals. */
export interface GoldCurrency {
  readonly currency: BencodexValue;
  readonly decimalPlaces: number;
}

export interface UnsignedRequest {
  /** 65 bytes uncompressed, as hex. */
  readonly publicKeyHex: string;
  /** The action's Bencodex, as hex. */
  readonly plainValueHex: string;
  readonly nonce: bigint;
}

export interface TransactionSource {
  readonly name: string;
  /** The planet's genesis block hash (lower-case hex) from the registry, or null where it is not known. */
  genesisHash(planet: Planet): string | null;
  nextNonce(planet: Planet, agentAddress: string): Promise<Result<bigint, TransactionSourceError>>;
  goldCurrency(planet: Planet): Promise<Result<GoldCurrency, TransactionSourceError>>;
  unsignedTransaction(
    planet: Planet,
    request: UnsignedRequest,
  ): Promise<Result<Uint8Array, TransactionSourceError>>;
  /** The unsigned bytes with `signature` attached; the bytes a send would carry. */
  attachSignature(
    planet: Planet,
    unsigned: Uint8Array,
    signature: Uint8Array,
  ): Promise<Result<Uint8Array, TransactionSourceError>>;
}
