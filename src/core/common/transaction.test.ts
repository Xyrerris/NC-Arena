/**
 * The purchase transaction's pure parts (ADR-0044, step C): the layout of the `buy_product3` action,
 * how GUIDs and amounts are written, the field-by-field check of what a node assembled, and the
 * signature. The unsigned transactions are built here in the shape the real node returns (binary
 * keys `a p s n g l m`, observed on Heimdall 2026-10-16).
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  bytesToHex,
  dict,
  dictGet,
  encodeBencodex,
  hexToBytes,
  type BencodexValue,
} from './bencodex';
import {
  DEFAULT_GAS,
  addressBytes,
  addressOfPublicKey,
  buildBuyProduct,
  guidBytes,
  plainValueHex,
  rawAmount,
  signMessage,
  transactionId,
  verifySignature,
  verifyUnsigned,
  type PurchaseOffer,
} from './transaction';

const PRIVATE_KEY = hexToBytes('7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d');
const PUBLIC_KEY = secp256k1.getPublicKey(PRIVATE_KEY, false);
const OTHER_PUBLIC_KEY = secp256k1.getPublicKey(Uint8Array.of(...new Array(31).fill(0), 7), false);
const AGENT = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';
const GENESIS = '729fa26958648a35b53e8e3905d11ec53b1b4929bf5f499884aed7df616f5913';

const NCG = dict([
  ['ticker', 'NCG'],
  ['decimalPlaces', Uint8Array.of(2)],
  ['minters', null],
]);

const OFFER: PurchaseOffer = {
  productId: '00112233-4455-6677-8899-aabbccddeeff',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  sellerAvatarAddress: '0xC6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  price: 142.5,
  legacy: false,
  equipmentType: 'Weapon',
  tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
};

const ACTION_ID = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const BUYER = '1023d8f22c6f5a8701e56a95e18fb2dbe436b41f';

const plain = (): BencodexValue => {
  const built = buildBuyProduct({
    buyerAvatar: BUYER,
    offer: OFFER,
    currency: NCG,
    decimalPlaces: 2,
    actionId: ACTION_ID,
  });
  if (!built.ok) throw new Error(`fixture: ${built.error.message}`);
  return built.value;
};

const k = (letter: string): Uint8Array => Uint8Array.of(letter.charCodeAt(0));

/** An unsigned transaction as the node returns it, with any field replaced or left out. */
const unsignedTx = (overrides: Record<string, BencodexValue | undefined> = {}): Uint8Array => {
  const fields: Record<string, BencodexValue | undefined> = {
    a: [plain()],
    p: PUBLIC_KEY,
    s: hexToBytes(AGENT),
    n: 4n,
    g: hexToBytes(GENESIS),
    l: 1n,
    m: [
      dict([
        ['ticker', 'Mead'],
        ['decimalPlaces', Uint8Array.of(18)],
      ]),
      10n ** 13n,
    ],
    t: '2026-10-16T10:00:00.000000Z',
    u: [],
    ...overrides,
  };
  return encodeBencodex(
    dict(
      Object.entries(fields)
        .filter((entry): entry is [string, BencodexValue] => entry[1] !== undefined)
        .map(([name, value]) => [k(name), value] as const),
    ),
  );
};

const check = (unsigned: Uint8Array, over: { genesisHash?: string | null } = {}) =>
  verifyUnsigned({
    unsigned,
    plain: plain(),
    publicKey: PUBLIC_KEY,
    nonce: 4n,
    genesisHash: GENESIS,
    ...over,
  });

describe('guidBytes', () => {
  it('writes the first three groups the way .NET does, and the last two as printed', () => {
    expect(bytesToHex(guidBytes('00112233-4455-6677-8899-aabbccddeeff') ?? new Uint8Array())).toBe(
      '33221100554477668899aabbccddeeff',
    );
  });

  it('refuses what is not a GUID', () => {
    expect(guidBytes('not-a-guid')).toBeNull();
    expect(guidBytes('00112233445566778899aabbccddeeff')).toBeNull();
  });
});

describe('addressBytes', () => {
  it('reads forty hex digits with or without 0x, and nothing else', () => {
    expect(addressBytes(`0x${AGENT}`)).toEqual(hexToBytes(AGENT));
    expect(addressBytes(` ${AGENT.toUpperCase()} `)).toEqual(hexToBytes(AGENT));
    expect(addressBytes('0x1234')).toBeNull();
  });
});

describe('rawAmount', () => {
  it('writes NCG in hundredths, exactly', () => {
    expect(rawAmount(142.5, 2)).toBe(14250n);
    expect(rawAmount(701, 2)).toBe(70100n);
    expect(rawAmount(0.07, 2)).toBe(7n);
    expect(rawAmount(1234.56, 2)).toBe(123456n);
  });

  it('refuses an amount with more decimals than the currency, instead of rounding it', () => {
    expect(rawAmount(142.505, 2)).toBeNull();
    expect(rawAmount(0, 2)).toBeNull();
    expect(rawAmount(-1, 2)).toBeNull();
    expect(rawAmount(Number.NaN, 2)).toBeNull();
    expect(rawAmount(Number.POSITIVE_INFINITY, 2)).toBeNull();
  });
});

describe('buildBuyProduct', () => {
  it('writes the action lib9c reads: type_id, and the buyer, the products and an id under values', () => {
    const action = plain();

    expect(dictGet(action, 'type_id')).toBe('buy_product3');
    const values = dictGet(action, 'values');
    expect(bytesToHex(dictGet(values, 'a') as Uint8Array)).toBe(BUYER);
    expect(bytesToHex(dictGet(values, 'id') as Uint8Array)).toBe(bytesToHex(ACTION_ID));
    expect(dictGet(values, 'p') as BencodexValue[]).toHaveLength(1);
  });

  it('writes a product as eight things in order, the price as [currency, raw amount]', () => {
    const [product] = dictGet(dictGet(plain(), 'values'), 'p') as BencodexValue[][];

    expect(product).toHaveLength(8);
    expect(bytesToHex(product?.[0] as Uint8Array)).toBe('33221100554477668899aabbccddeeff');
    const price = product?.[1] as BencodexValue[];
    expect(bytesToHex(encodeBencodex(price[0] as BencodexValue))).toBe(
      bytesToHex(encodeBencodex(NCG)),
    );
    expect(price[1]).toBe(14250n);
    expect(bytesToHex(product?.[2] as Uint8Array)).toBe('0aa07abeb5791302c14f9b1f633af96a4c05c7cb');
    expect(bytesToHex(product?.[3] as Uint8Array)).toBe('c6e87ae0fcb89d16c339149da0044812f6eb0a79');
    expect(product?.[4]).toBe('NonFungible');
    expect(product?.[5]).toBe(false);
    expect(product?.[6]).toBe('Weapon');
    expect(bytesToHex(product?.[7] as Uint8Array)).toBe('ccddeeffaabb88997766554433221100');
  });

  it('is the same bytes every time for the same purchase', () => {
    expect(plainValueHex(plain())).toBe(plainValueHex(plain()));
  });

  it.each([
    ['a bad buyer address', { buyerAvatar: '1234' }, 'address'],
    ['a bad product id', { offer: { ...OFFER, productId: 'x' } }, 'GUID'],
    ['a price with too many decimals', { offer: { ...OFFER, price: 1.234 } }, 'decimals'],
    ['an action id that is not 16 bytes', { actionId: new Uint8Array(3) }, '16 bytes'],
    [
      'something that is not equipment',
      { offer: { ...OFFER, equipmentType: 'Hourglass' as never } },
      'not equipment',
    ],
  ])('refuses %s', (_name, change, why) => {
    const result = buildBuyProduct({
      buyerAvatar: BUYER,
      offer: OFFER,
      currency: NCG,
      decimalPlaces: 2,
      actionId: ACTION_ID,
      ...change,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain(why);
  });
});

describe('addressOfPublicKey', () => {
  it('is the account of the key', () => {
    expect(addressOfPublicKey(PUBLIC_KEY)).toBe(AGENT);
  });
});

describe('verifyUnsigned', () => {
  it('accepts the transaction that was asked for', () => {
    expect(check(unsignedTx())).toBeNull();
  });

  it('does not look at the chain when it is not known', () => {
    expect(check(unsignedTx({ g: new Uint8Array(32) }), { genesisHash: null })).toBeNull();
  });

  it.each([
    ['a different action', { a: [dict([['type_id', 'transfer_asset']])] }, 'action'],
    ['two actions', { a: [plain(), plain()] }, 'action'],
    ['another public key', { p: OTHER_PUBLIC_KEY }, 'public key'],
    ['another signer', { s: new Uint8Array(20) }, 'signer'],
    ['another nonce', { n: 5n }, 'nonce'],
    ['a nonce of the wrong kind', { n: 'four' }, 'nonce'],
    ['another chain', { g: new Uint8Array(32) }, 'chain'],
    ['a bigger gas limit', { l: 4_000_000n }, 'gas limit'],
    ['a dearer gas price', { m: [dict([['ticker', 'Mead']]), 10n ** 13n + 1n] }, 'gas price'],
    ['gas paid in another currency', { m: [dict([['ticker', 'NCG']]), 1n] }, 'gas price'],
    ['no gas price at all', { m: undefined }, 'gas price'],
    ['no signer', { s: undefined }, 'signer'],
    ['no chain', { g: undefined }, 'chain'],
  ])('refuses %s', (_name, over, why) => {
    const result = check(unsignedTx(over as Record<string, BencodexValue | undefined>));

    expect(result).not.toBeNull();
    expect(result).toContain(why);
  });

  it('refuses bytes that are not a transaction', () => {
    expect(check(Uint8Array.of(0xff))).toContain('not readable');
    expect(check(encodeBencodex([1n]))).toContain('not a dictionary');
  });
});

describe('the signature', () => {
  const message = unsignedTx();

  it('verifies against the key it was made with, and only that one, and only that message', () => {
    const signature = signMessage(PRIVATE_KEY, message);

    expect(verifySignature(signature, message, PUBLIC_KEY)).toBe(true);
    expect(verifySignature(signature, unsignedTx({ n: 5n }), PUBLIC_KEY)).toBe(false);
    expect(verifySignature(signature, message, OTHER_PUBLIC_KEY)).toBe(false);
    expect(verifySignature(Uint8Array.of(1, 2, 3), message, PUBLIC_KEY)).toBe(false);
  });

  it('is DER, and the same every time for the same message', () => {
    const signature = signMessage(PRIVATE_KEY, message);

    expect(signature[0]).toBe(0x30);
    expect(bytesToHex(signMessage(PRIVATE_KEY, message))).toBe(bytesToHex(signature));
  });
});

describe('transactionId', () => {
  it('is the SHA-256 of the signed bytes', () => {
    // SHA-256 of the three bytes "abc".
    expect(transactionId(Uint8Array.of(0x61, 0x62, 0x63))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('the gas', () => {
  it('is the 0.00001 Mead the purchases on the chain carry', () => {
    expect(DEFAULT_GAS).toEqual({ ticker: 'Mead', decimalPlaces: 18, quantity: '0.00001' });
  });
});
