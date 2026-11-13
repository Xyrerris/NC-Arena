/**
 * The dry run (ADR-0044, step C) against a fake node that behaves like the real one — it assembles
 * the unsigned transaction from the action it is given and attaches a signature under `S` — and
 * against nodes that lie, at the point where lying would be signed for. The two things that must
 * hold: a lying node is never signed for, and the run cannot send, whatever the node does.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';

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
import { dryRunPurchase, signedCarries, type DryRunInput } from './purchaseDryRun';
import { err, ok, type Result } from './result';
import {
  addressOfPublicKey,
  transactionId,
  verifySignature,
  type PurchaseOffer,
} from './transaction';
import type {
  GoldCurrency,
  TransactionSource,
  TransactionSourceError,
  UnsignedRequest,
} from './transactionSource';

const PRIVATE_KEY = hexToBytes('7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d');
const PUBLIC_KEY = secp256k1.getPublicKey(PRIVATE_KEY, false);
const AGENT = addressOfPublicKey(PUBLIC_KEY);
const GENESIS = '729fa26958648a35b53e8e3905d11ec53b1b4929bf5f499884aed7df616f5913';

const OFFER: PurchaseOffer = {
  productId: '00112233-4455-6677-8899-aabbccddeeff',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  price: 701,
  legacy: false,
  equipmentType: 'Weapon',
  tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
};

const refuse = (message: string): Result<never, TransactionSourceError> =>
  err({ reason: 'FAILED', message });

const key = (letter: string): Uint8Array => Uint8Array.of(letter.charCodeAt(0));
const isKey = (candidate: Uint8Array | string, letter: string): boolean =>
  candidate instanceof Uint8Array && candidate[0] === letter.charCodeAt(0);

/** The entries of a decoded transaction, without those named by `letters`. */
const without = (value: BencodexValue, ...letters: string[]) =>
  (isBencodexDict(value) ? value.entries : []).filter(
    ([name]) => !letters.some((letter) => isKey(name, letter)),
  );

interface Behaviour {
  currency?: () => Result<GoldCurrency, TransactionSourceError>;
  nonce?: () => Result<bigint, TransactionSourceError>;
  /** Replaces the transaction the node would honestly assemble. */
  unsigned?: (honest: BencodexValue) => Result<Uint8Array, TransactionSourceError> | BencodexValue;
  /** Replaces the signed bytes the node would honestly return. */
  attach?: (
    unsigned: Uint8Array,
    signature: Uint8Array,
    honest: Uint8Array,
  ) => Result<Uint8Array, TransactionSourceError> | Uint8Array;
}

const isResult = <T>(value: unknown): value is Result<T, TransactionSourceError> =>
  typeof value === 'object' && value !== null && 'ok' in value;

/** An in-process node. It has the four questions of the port and, like the port, no way to send. */
class FakeNode implements TransactionSource {
  readonly name = 'fake';
  readonly calls: string[] = [];

  constructor(private readonly behaviour: Behaviour = {}) {}

  genesisHash(): string {
    return GENESIS;
  }

  nextNonce(): Promise<Result<bigint, TransactionSourceError>> {
    this.calls.push('nextNonce');
    return Promise.resolve(this.behaviour.nonce?.() ?? ok(7n));
  }

  goldCurrency(): Promise<Result<GoldCurrency, TransactionSourceError>> {
    this.calls.push('goldCurrency');
    return Promise.resolve(
      this.behaviour.currency?.() ??
        ok({
          currency: dict([
            ['ticker', 'NCG'],
            ['decimalPlaces', Uint8Array.of(2)],
            ['minters', null],
          ]),
          decimalPlaces: 2,
        }),
    );
  }

  unsignedTransaction(
    _planet: string,
    request: UnsignedRequest,
  ): Promise<Result<Uint8Array, TransactionSourceError>> {
    this.calls.push('unsignedTransaction');
    const honest = dict([
      [key('a'), [decodeBencodex(hexToBytes(request.plainValueHex))]],
      [key('p'), hexToBytes(request.publicKeyHex)],
      [key('s'), hexToBytes(addressOfPublicKey(hexToBytes(request.publicKeyHex)))],
      [key('n'), request.nonce],
      [key('g'), hexToBytes(GENESIS)],
      [key('l'), 1n],
      [
        key('m'),
        [
          dict([
            ['ticker', 'Mead'],
            ['decimalPlaces', Uint8Array.of(18)],
          ]),
          10n ** 13n,
        ],
      ],
      [key('t'), '2026-10-16T10:00:00.000000Z'],
      [key('u'), []],
    ]);
    const changed = this.behaviour.unsigned?.(honest);
    if (changed === undefined) return Promise.resolve(ok(encodeBencodex(honest)));
    return Promise.resolve(
      isResult<Uint8Array>(changed) ? changed : ok(encodeBencodex(changed as BencodexValue)),
    );
  }

  attachSignature(
    _planet: string,
    unsigned: Uint8Array,
    signature: Uint8Array,
  ): Promise<Result<Uint8Array, TransactionSourceError>> {
    this.calls.push('attachSignature');
    const body = decodeBencodex(unsigned);
    const honest = encodeBencodex(dict([...without(body), [key('S'), signature]]));
    const changed = this.behaviour.attach?.(unsigned, signature, honest);
    if (changed === undefined) return Promise.resolve(ok(honest));
    return Promise.resolve(changed instanceof Uint8Array ? ok(changed) : changed);
  }
}

const run = (node: FakeNode, over: Partial<DryRunInput> = {}) =>
  dryRunPurchase({
    planet: 'heimdall',
    source: node,
    privateKey: PRIVATE_KEY,
    buyerAvatar: '1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
    offer: OFFER,
    actionId: Uint8Array.from({ length: 16 }, (_, i) => i),
    ...over,
  });

describe('dryRunPurchase', () => {
  it('goes as far as the signature and reports what a send would carry', async () => {
    const node = new FakeNode();

    const result = await run(node);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.agentAddress).toBe(`0x${AGENT}`);
    expect(result.value.nonce).toBe(7n);

    const unsigned = hexToBytes(result.value.unsignedHex);
    const signed = hexToBytes(result.value.signedHex);
    const signature = hexToBytes(result.value.signatureHex);
    expect(verifySignature(signature, unsigned, PUBLIC_KEY)).toBe(true);
    expect(signedCarries(unsigned, signed, signature)).toBeNull();
    expect(result.value.transactionId).toBe(transactionId(signed));
    const action = dictGet(decodeBencodex(unsigned), key('a')) as BencodexValue[];
    expect(bytesToHex(encodeBencodex(action[0] as BencodexValue))).toBe(result.value.actionHex);
  });

  it('asks the four questions in order and cannot ask a fifth: there is nothing here that sends', async () => {
    const node = new FakeNode();

    await run(node);

    expect(node.calls).toEqual([
      'goldCurrency',
      'nextNonce',
      'unsignedTransaction',
      'attachSignature',
    ]);
    expect('stageTransaction' in node).toBe(false);
  });

  it('gives the same transaction id for the same inputs, since the signature is deterministic', async () => {
    const first = await run(new FakeNode());
    const second = await run(new FakeNode());

    expect(first.ok && second.ok && first.value.transactionId === second.value.transactionId).toBe(
      true,
    );
  });

  it.each([
    ['the gold currency', { currency: () => refuse('no currency') }, 'currency', ['goldCurrency']],
    ['the nonce', { nonce: () => refuse('no nonce') }, 'nonce', ['goldCurrency', 'nextNonce']],
    [
      'the unsigned transaction',
      { unsigned: () => refuse('no unsigned') },
      'unsigned',
      ['goldCurrency', 'nextNonce', 'unsignedTransaction'],
    ],
  ])(
    'stops, and says where, when the node cannot give %s',
    async (_what, behaviour, stage, calls) => {
      const node = new FakeNode(behaviour as Behaviour);

      const result = await run(node);

      expect(result).toMatchObject({ ok: false, error: { stage } });
      expect(node.calls).toEqual(calls);
    },
  );

  it('refuses to build an action it cannot write, without asking the node for anything more', async () => {
    const node = new FakeNode();

    const result = await run(node, { offer: { ...OFFER, price: 1.234 } });

    expect(result).toMatchObject({ ok: false, error: { stage: 'build' } });
    expect(node.calls).toEqual(['goldCurrency']);
  });

  it.each([
    [
      'another action',
      (honest: BencodexValue) =>
        dict([...without(honest, 'a'), [key('a'), [dict([['type_id', 'transfer_asset']])]]]),
      'action',
    ],
    [
      'another nonce',
      (honest: BencodexValue) => dict([...without(honest, 'n'), [key('n'), 99n]]),
      'nonce',
    ],
    [
      'another chain',
      (honest: BencodexValue) => dict([...without(honest, 'g'), [key('g'), new Uint8Array(32)]]),
      'chain',
    ],
  ])(
    'does not sign for a node that returns %s, and never asks it to attach a signature',
    async (_what, tamper, why) => {
      const node = new FakeNode({ unsigned: tamper });

      const result = await run(node);

      expect(result).toMatchObject({ ok: false, error: { stage: 'verify' } });
      expect(result.ok === false && result.error.message).toContain(why);
      expect(node.calls).not.toContain('attachSignature');
    },
  );

  it('refuses a signed transaction whose body is not the one that was signed', async () => {
    const node = new FakeNode({
      attach: (unsigned, signature) =>
        encodeBencodex(
          dict([...without(decodeBencodex(unsigned), 'n'), [key('n'), 8n], [key('S'), signature]]),
        ),
    });

    const result = await run(node);

    expect(result).toMatchObject({ ok: false, error: { stage: 'attach' } });
    expect(result.ok === false && result.error.message).toContain('body was changed');
  });

  it('reports a node that fails while attaching the signature', async () => {
    const result = await run(new FakeNode({ attach: () => refuse('could not sign') }));

    expect(result).toMatchObject({
      ok: false,
      error: { stage: 'attach', message: 'could not sign' },
    });
  });
});

describe('signedCarries', () => {
  const unsigned = encodeBencodex(
    dict([
      [key('n'), 1n],
      [key('l'), 1n],
    ]),
  );
  const signature = Uint8Array.of(1, 2, 3);
  const withEntries = (extra: readonly (readonly [Uint8Array, BencodexValue])[]) =>
    encodeBencodex(dict([[key('n'), 1n], [key('l'), 1n], ...extra]));

  it('accepts the unsigned body plus the signature under S, and nothing else', () => {
    expect(signedCarries(unsigned, withEntries([[key('S'), signature]]), signature)).toBeNull();
  });

  it.each([
    ['another signature', withEntries([[key('S'), Uint8Array.of(9)]]), 'signature'],
    ['no signature', withEntries([]), 'signature'],
    [
      'an extra entry',
      withEntries([
        [key('S'), signature],
        [key('x'), 1n],
      ]),
      'added or removed',
    ],
    ['bytes that are not Bencodex', Uint8Array.of(0xff), 'not readable'],
    ['something that is not a dictionary', encodeBencodex([1n]), 'not a dictionary'],
  ])('refuses %s', (_what, signed, why) => {
    expect(signedCarries(unsigned, signed, signature)).toContain(why);
  });
});
