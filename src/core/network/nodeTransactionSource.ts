/**
 * `TransactionSource` over a plain node's GraphQL (ADR-0044, "Next: buying", step C).
 *
 * What was observed on Heimdall 2026-10-16 and follows NC-Market's `HeadlessClient`: the next nonce
 * is `transaction { nextTxNonce(address) }`; the gold currency is the legacy account's state at
 * `0x…0a` (a Bencodex dictionary whose `currency` entry is what a price must carry, verbatim); the
 * unsigned transaction is `transaction { unsignedTransaction(publicKey, plainValue, nonce,
 * maxGasPrice) }`; the signed one is `transaction { signTransaction(unsignedTransaction, signature) }`.
 * Everything crosses as hex.
 *
 * The node is only ever asked. Its answers are not believed: the caller checks the unsigned
 * transaction against what it asked for before it signs, and the signed one against the unsigned.
 * Nothing here can stage a transaction — there is no such call in this class.
 *
 * Values go into the query text, not into GraphQL variables (`postGraphql` takes only a query), so
 * every one of them is checked against a strict pattern first: hex digits, a 40-digit address, an
 * integer. A value that does not match is refused before it is quoted into a query.
 */

import {
  err,
  ok,
  type GoldCurrency,
  type Result,
  type TransactionSource,
  type TransactionSourceError,
  type UnsignedRequest,
} from '../common';
import { bytesToHex, decodeBencodex, dictGet, hexToBytes } from '../common/bencodex';
import { DEFAULT_GAS } from '../common/transaction';
import type { Planet } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import { NODE_ENDPOINTS, type NodeEndpoints } from './nodeCollectionSource';

/** From the planet registry. A signed transaction is only valid on the chain it names. */
export const GENESIS_HASHES: Partial<Record<Planet, string>> = {
  odin: '4582250d0da33b06779a8475d283d5dd210c683b9b999d74d03fac4f58fa6bce',
  heimdall: '729fa26958648a35b53e8e3905d11ec53b1b4929bf5f499884aed7df616f5913',
};

const LEGACY_ACCOUNT = '0x1000000000000000000000000000000000000000';
const GOLD_CURRENCY_ADDRESS = '0x000000000000000000000000000000000000000a';

const HEX = /^(?:[0-9a-fA-F]{2})+$/;
const AGENT = /^(?:0x)?([0-9a-fA-F]{40})$/;

export class NodeTransactionSource implements TransactionSource {
  readonly name = 'node';

  constructor(private readonly endpoints: NodeEndpoints = NODE_ENDPOINTS) {}

  genesisHash(planet: Planet): string | null {
    return GENESIS_HASHES[planet] ?? null;
  }

  async nextNonce(
    planet: Planet,
    agentAddress: string,
  ): Promise<Result<bigint, TransactionSourceError>> {
    const match = AGENT.exec(agentAddress.trim());
    if (match === null) return err(this.failed('the account address is malformed.'));

    const read = await this.query(
      planet,
      `{ transaction { nextTxNonce(address: "0x${match[1]}") } }`,
      ['transaction', 'nextTxNonce'],
    );
    if (!read.ok) return read;
    if (typeof read.value !== 'number' || !Number.isSafeInteger(read.value) || read.value < 0) {
      return err(this.failed('the nonce was not a whole number.'));
    }
    return ok(BigInt(read.value));
  }

  async goldCurrency(planet: Planet): Promise<Result<GoldCurrency, TransactionSourceError>> {
    const read = await this.query(
      planet,
      `{ state(accountAddress: "${LEGACY_ACCOUNT}", address: "${GOLD_CURRENCY_ADDRESS}") }`,
      ['state'],
    );
    if (!read.ok) return read;
    if (typeof read.value !== 'string' || !HEX.test(read.value)) {
      return err(
        this.failed('the node has no gold currency state, so it is not known what to pay in.'),
      );
    }

    try {
      const state = decodeBencodex(hexToBytes(read.value));
      const currency = dictGet(state, 'currency');
      const places = dictGet(currency, 'decimalPlaces');
      if (currency === undefined || !(places instanceof Uint8Array) || places.length !== 1) {
        return err(this.failed('the gold currency state has not the expected shape.'));
      }
      return ok({ currency, decimalPlaces: places[0] ?? 0 });
    } catch {
      return err(this.failed('the gold currency state could not be read.'));
    }
  }

  async unsignedTransaction(
    planet: Planet,
    request: UnsignedRequest,
  ): Promise<Result<Uint8Array, TransactionSourceError>> {
    if (!HEX.test(request.publicKeyHex) || !HEX.test(request.plainValueHex)) {
      return err(this.failed('the public key or the action is not hexadecimal.'));
    }
    if (request.nonce < 0n || request.nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
      return err(this.failed('the nonce is out of range.'));
    }

    const gas =
      `{ quantity: "${DEFAULT_GAS.quantity}", ticker: "${DEFAULT_GAS.ticker}", ` +
      `decimalPlaces: ${DEFAULT_GAS.decimalPlaces} }`;
    const read = await this.query(
      planet,
      `{ transaction { unsignedTransaction(publicKey: "${request.publicKeyHex}", ` +
        `plainValue: "${request.plainValueHex}", nonce: ${request.nonce.toString()}, ` +
        `maxGasPrice: ${gas}) } }`,
      ['transaction', 'unsignedTransaction'],
    );
    return this.bytes(read, 'unsigned transaction');
  }

  async attachSignature(
    planet: Planet,
    unsigned: Uint8Array,
    signature: Uint8Array,
  ): Promise<Result<Uint8Array, TransactionSourceError>> {
    const read = await this.query(
      planet,
      `{ transaction { signTransaction(unsignedTransaction: "${bytesToHex(unsigned)}", ` +
        `signature: "${bytesToHex(signature)}") } }`,
      ['transaction', 'signTransaction'],
    );
    return this.bytes(read, 'signed transaction');
  }

  private bytes(
    read: Result<unknown, TransactionSourceError>,
    what: string,
  ): Result<Uint8Array, TransactionSourceError> {
    if (!read.ok) return read;
    if (typeof read.value !== 'string' || !HEX.test(read.value)) {
      return err(this.failed(`the ${what} did not come back as hex.`));
    }
    return ok(hexToBytes(read.value));
  }

  private async query(
    planet: Planet,
    query: string,
    path: readonly string[],
  ): Promise<Result<unknown, TransactionSourceError>> {
    const endpoint = this.endpoints[planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${planet}.`));

    const response = await postGraphql(endpoint, query);
    if (!response.ok) return err(networkFailure(this.name, response.error));

    // A GraphQL failure is HTTP 200 with an `errors` array and no value at the path.
    let value: unknown = response.value.data;
    for (const step of path) {
      value =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[step]
          : undefined;
    }
    if (value === undefined || value === null) {
      return err(this.failed(response.value.errors[0]?.message ?? 'the node gave no answer.'));
    }
    return ok(value);
  }

  private failed(message: string): TransactionSourceError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
