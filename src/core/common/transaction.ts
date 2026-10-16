/**
 * The pieces of a Nine Chronicles purchase transaction that need no network (ADR-0044, step C):
 * the `buy_product3` action, the check of what a node assembled from it, the signature, and the id.
 *
 * Everything here is a pure function of its arguments, so each is tested; the calls that move bytes
 * to and from a node are `TransactionSource`'s, and nothing in this file can send anything.
 *
 * **The action.** A node exposes no builder for the market's actions, so the layout is ours to get
 * right. It is lib9c's `BuyProduct`: a dictionary of `type_id` and `values`, the values being the
 * buyer's avatar (`a`), the products (`p`) and a random action id (`id`); and each product a list of
 * eight — the product id, the price as `[currency, raw amount]`, the seller's agent and avatar, the
 * product kind and the legacy flag, the item sub type as a *name*, and the tradable id. Ids that are
 * GUIDs are written the way .NET writes them (`Guid.ToByteArray`): the first three groups
 * little-endian, which is not the order they are printed in. It is the layout NC-Market's
 * `PurchaseAction.cs` builds and checks against lib9c's own `BuyProduct`; this file is checked
 * against that description and against a round trip, not against the chain — a field in the wrong
 * place fails on chain, after a signature and a gas fee.
 *
 * **The check.** The node returns the transaction unsigned and is trusted with nothing else. What
 * comes back is what the key is about to sign, so nothing is signed until the action, the public
 * key, the signer, the nonce, the chain and the gas are exactly what was asked. A missing field is
 * as wrong as a different one.
 *
 * **The signature.** ECDSA over secp256k1 on the SHA-256 of the unsigned bytes, DER-encoded, low-S.
 * It is verified against the public key before anyone is asked to send it. That is the format
 * Libplanet's `PrivateKey.Sign` writes as far as its source and NC-Market's tests say; it was never
 * proven against a real send, which is why step C stops before staging.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

import {
  bytesToHex,
  decodeBencodex,
  dict,
  dictGet,
  encodeBencodex,
  hexToBytes,
  isBencodexDict,
  type BencodexValue,
} from './bencodex';
import { err, ok, type Result } from './result';

export interface TransactionError {
  readonly code: 'BAD_OFFER' | 'BAD_ADDRESS' | 'BAD_CURRENCY' | 'MISMATCH' | 'BAD_SIGNATURE';
  readonly message: string;
}

const fail = (code: TransactionError['code'], message: string): Result<never, TransactionError> =>
  err({ code, message });

/** What a transaction pays for gas: the same 0.00001 Mead with a limit of one that purchases carry. */
export const DEFAULT_GAS = { ticker: 'Mead', decimalPlaces: 18, quantity: '0.00001' } as const;
/** The raw amount of `DEFAULT_GAS`: the most a transaction may ask for. */
const MAX_GAS_RAW = 10n ** 13n;

export const BUY_PRODUCT_TYPE_ID = 'buy_product3';

/** The equipment the market sells, by the names lib9c's `ItemSubType` gives them. */
export const EQUIPMENT_TYPES = ['Weapon', 'Armor', 'Belt', 'Necklace', 'Ring'] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

/** Everything about a listing that the action names. Equipment only: the layout is not verified for the rest. */
export interface PurchaseOffer {
  /** A GUID, as the market service prints it. */
  readonly productId: string;
  readonly sellerAgentAddress: string;
  readonly sellerAvatarAddress: string;
  /** In NCG. Must be an exact multiple of the currency's smallest unit. */
  readonly price: number;
  readonly legacy: boolean;
  readonly equipmentType: EquipmentType;
  readonly tradableId: string;
}

const ADDRESS = /^(?:0x)?([0-9a-fA-F]{40})$/;

export function addressBytes(text: string): Uint8Array | null {
  const match = ADDRESS.exec(text.trim());
  return match === null ? null : hexToBytes(match[1] ?? '');
}

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** `Guid.ToByteArray()`: the first three groups reversed, the last two as printed. */
export function guidBytes(guid: string): Uint8Array | null {
  if (!GUID.test(guid)) return null;
  const bytes = hexToBytes(guid.replace(/-/g, ''));
  const reverse = (from: number, to: number): void => {
    bytes.set(bytes.slice(from, to).reverse(), from);
  };
  reverse(0, 4);
  reverse(4, 6);
  reverse(6, 8);
  return bytes;
}

/**
 * The amount as the integer the chain stores: NCG has two decimals, so 142.5 is 14250. A price with
 * more decimals than the currency has is refused, not rounded — the chain would charge a different
 * amount than the one confirmed.
 */
export function rawAmount(price: number, decimalPlaces: number): bigint | null {
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const scaled = price * 10 ** decimalPlaces;
  const rounded = Math.round(scaled);
  // A few ulps of slack for a decimal that has no exact binary form (0.07 · 100), none for a real fraction.
  if (Math.abs(scaled - rounded) > 1e-6 || !Number.isSafeInteger(rounded)) return null;
  return BigInt(rounded);
}

export interface BuyProductArgs {
  /** The avatar that receives the piece, 20 bytes as hex. */
  readonly buyerAvatar: string;
  readonly offer: PurchaseOffer;
  /** The gold currency exactly as the chain wrote it, read from its state and written back verbatim. */
  readonly currency: BencodexValue;
  readonly decimalPlaces: number;
  /** 16 random bytes: the action's own id. */
  readonly actionId: Uint8Array;
}

export function buildBuyProduct(args: BuyProductArgs): Result<BencodexValue, TransactionError> {
  const { offer } = args;
  const buyer = addressBytes(args.buyerAvatar);
  const sellerAgent = addressBytes(offer.sellerAgentAddress);
  const sellerAvatar = addressBytes(offer.sellerAvatarAddress);
  if (buyer === null || sellerAgent === null || sellerAvatar === null) {
    return fail('BAD_ADDRESS', 'An address in the purchase is not 40 hexadecimal digits.');
  }
  const productId = guidBytes(offer.productId);
  const tradableId = guidBytes(offer.tradableId);
  if (productId === null || tradableId === null) {
    return fail('BAD_OFFER', 'A product or tradable id is not a GUID.');
  }
  if (!EQUIPMENT_TYPES.includes(offer.equipmentType)) {
    return fail(
      'BAD_OFFER',
      `"${String(offer.equipmentType)}" is not equipment: only equipment is covered.`,
    );
  }
  if (args.actionId.length !== 16) return fail('BAD_OFFER', 'An action id is 16 bytes.');
  const amount = rawAmount(offer.price, args.decimalPlaces);
  if (amount === null) {
    return fail(
      'BAD_OFFER',
      `${offer.price} is not an amount with ${args.decimalPlaces} decimals.`,
    );
  }

  const product: BencodexValue = [
    productId,
    [args.currency, amount],
    sellerAgent,
    sellerAvatar,
    'NonFungible',
    offer.legacy,
    offer.equipmentType,
    tradableId,
  ];
  return ok(
    dict([
      ['type_id', BUY_PRODUCT_TYPE_ID],
      [
        'values',
        dict([
          ['a', buyer],
          ['id', args.actionId],
          ['p', [product]],
        ]),
      ],
    ]),
  );
}

export const plainValueHex = (plain: BencodexValue): string => bytesToHex(encodeBencodex(plain));

/** Lower-case address of an uncompressed public key: the last 20 bytes of Keccak-256 over its 64 bytes. */
export const addressOfPublicKey = (publicKey: Uint8Array): string =>
  bytesToHex(keccak_256(publicKey.slice(1)).slice(12));

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

const key = (letter: string): Uint8Array => Uint8Array.of(letter.charCodeAt(0));

export interface UnsignedExpectation {
  readonly unsigned: Uint8Array;
  /** The action as built here, which must be the transaction's only action, byte for byte. */
  readonly plain: BencodexValue;
  /** 65 bytes, uncompressed. */
  readonly publicKey: Uint8Array;
  readonly nonce: bigint;
  /** Lower-case hex, or null where the chain is not known and so cannot be checked. */
  readonly genesisHash: string | null;
}

/** What is wrong with an unsigned transaction a node assembled, or null when it is exactly what was asked. */
export function verifyUnsigned(expected: UnsignedExpectation): string | null {
  let tx: BencodexValue;
  try {
    tx = decodeBencodex(expected.unsigned);
  } catch {
    return 'it is not readable';
  }
  if (!isBencodexDict(tx)) return 'it is not a dictionary';

  const actions = dictGet(tx, key('a'));
  if (
    !Array.isArray(actions) ||
    actions.length !== 1 ||
    !sameBytes(encodeBencodex(actions[0] as BencodexValue), encodeBencodex(expected.plain))
  ) {
    return 'the action differs';
  }

  const publicKey = dictGet(tx, key('p'));
  if (!(publicKey instanceof Uint8Array) || !sameBytes(publicKey, expected.publicKey)) {
    return 'the public key differs';
  }

  const signer = dictGet(tx, key('s'));
  if (
    !(signer instanceof Uint8Array) ||
    bytesToHex(signer) !== addressOfPublicKey(expected.publicKey)
  ) {
    return 'the signer differs';
  }

  if (dictGet(tx, key('n')) !== expected.nonce) return 'the nonce differs';

  if (expected.genesisHash !== null) {
    const genesis = dictGet(tx, key('g'));
    if (
      !(genesis instanceof Uint8Array) ||
      bytesToHex(genesis) !== expected.genesisHash.toLowerCase()
    ) {
      return 'the chain differs';
    }
  }

  if (dictGet(tx, key('l')) !== 1n) return 'the gas limit differs';

  const gas = dictGet(tx, key('m'));
  const currency = Array.isArray(gas) ? (gas[0] as BencodexValue) : undefined;
  const price = Array.isArray(gas) ? (gas[1] as BencodexValue) : undefined;
  if (
    !Array.isArray(gas) ||
    gas.length !== 2 ||
    dictGet(currency, 'ticker') !== DEFAULT_GAS.ticker ||
    typeof price !== 'bigint' ||
    price < 0n ||
    price > MAX_GAS_RAW
  ) {
    return 'the gas price differs';
  }
  return null;
}

/** ECDSA over the SHA-256 of `message`, DER, low-S. */
export function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return secp256k1.sign(message, privateKey, { format: 'der', lowS: true });
}

export function verifySignature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return secp256k1.verify(signature, message, publicKey, { format: 'der', lowS: true });
  } catch {
    return false;
  }
}

/** The id a transaction has once signed: the SHA-256 of its signed bytes. Known before it is sent. */
export const transactionId = (signed: Uint8Array): string => bytesToHex(sha256(signed));
