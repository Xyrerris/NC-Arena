/**
 * A purchase from "buy" to the signature (ADR-0044, step D). The things that must hold: the record
 * is written before the node is asked for anything, a refusal writes nothing, a live request does
 * nothing at all, and an unreadable log is never written over.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  decodeBencodex,
  dict,
  encodeBencodex,
  hexToBytes,
  isBencodexDict,
  type BencodexValue,
} from './bencodex';
import type { MarketListing } from './marketSource';
import {
  awaitPurchase,
  deriveActionId,
  deriveRecordId,
  describeFailure,
  runPurchase,
  type PurchaseRequest,
} from './purchaseFlow';
import { parsePurchaseLog, purchaseLogOver, type PurchaseRecord } from './purchaseLog';
import { err, ok, type Result } from './result';
import { addressOfPublicKey, transactionId } from './transaction';
import type { TransactionResult, TransactionSender } from './transactionSender';
import type {
  GoldCurrency,
  TransactionSource,
  TransactionSourceError,
  UnsignedRequest,
} from './transactionSource';

const PRIVATE_KEY = hexToBytes('7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d');
const PUBLIC_KEY = secp256k1.getPublicKey(PRIVATE_KEY, false);
const KEY_ADDRESS = addressOfPublicKey(PUBLIC_KEY);
const GENESIS = '729fa26958648a35b53e8e3905d11ec53b1b4929bf5f499884aed7df616f5913';
const key = (letter: string): Uint8Array => Uint8Array.of(letter.charCodeAt(0));

const listing = (overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId: '00112233-4455-6677-8899-aabbccddeeff',
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 701,
  quantity: 1,
  unitPrice: 701,
  hasSkill: true,
  sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
  legacy: false,
  registeredBlockIndex: 1,
  ...overrides,
});

/** Everything that happens, in order: node questions and writes to the record. */
const setup = (options: { stored?: string | null; unsignedFails?: boolean } = {}) => {
  const events: string[] = [];
  let kept: string | null = options.stored ?? null;
  const log = purchaseLogOver({
    get: () => kept,
    set: (json) => {
      const statuses = parsePurchaseLog(json).records.map((r) => r.status);
      events.push(`write:${statuses.join(',')}`);
      kept = json;
    },
  });

  const source: TransactionSource = {
    name: 'fake',
    genesisHash: () => GENESIS,
    nextNonce: () => {
      events.push('nextNonce');
      return Promise.resolve(ok(3n));
    },
    goldCurrency: () => {
      events.push('goldCurrency');
      const gold: GoldCurrency = {
        currency: dict([
          ['ticker', 'NCG'],
          ['decimalPlaces', Uint8Array.of(2)],
        ]),
        decimalPlaces: 2,
      };
      return Promise.resolve(ok(gold));
    },
    unsignedTransaction: (_planet, request: UnsignedRequest) => {
      events.push('unsignedTransaction');
      if (options.unsignedFails) {
        const failure: Result<never, TransactionSourceError> = err({
          reason: 'FAILED',
          message: 'node said no',
        });
        return Promise.resolve(failure);
      }
      return Promise.resolve(
        ok(
          encodeBencodex(
            dict([
              [key('a'), [decodeBencodex(hexToBytes(request.plainValueHex))]],
              [key('p'), hexToBytes(request.publicKeyHex)],
              [key('s'), hexToBytes(KEY_ADDRESS)],
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
            ]),
          ),
        ),
      );
    },
    attachSignature: (_planet, unsigned, signature) => {
      events.push('attachSignature');
      const body = decodeBencodex(unsigned);
      const entries = isBencodexDict(body) ? body.entries : [];
      const signed: (readonly [Uint8Array | string, BencodexValue])[] = [
        ...entries,
        [key('S'), signature],
      ];
      return Promise.resolve(ok(encodeBencodex(dict(signed))));
    },
  };

  const request = (over: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
    planet: 'heimdall',
    mode: 'dry-run',
    source,
    privateKey: PRIVATE_KEY,
    log,
    actionId: Uint8Array.from({ length: 16 }, (_, i) => i),
    now: () => 1_700_000_000_000,
    newId: () => 'record-1',
    shown: listing(),
    fresh: listing(),
    limitNcg: 1000,
    balanceNcg: 5000,
    keyAddress: KEY_ADDRESS,
    avatarAgent: `0x${KEY_ADDRESS}`,
    buyerAvatar: '1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
    ...over,
  });

  return { events, request, records: () => parsePurchaseLog(kept).records, raw: () => kept };
};

/** A sender that records what it is asked, and answers as scripted. It is a fake: nothing leaves the process. */
const fakeSender = (
  events: string[],
  script: {
    stage?: 'accept' | 'refuse' | 'doubt';
    results?: Result<TransactionResult, TransactionSourceError>[];
  } = {},
): TransactionSender & { stagedBytes: Uint8Array[]; looks: () => number } => {
  const stagedBytes: Uint8Array[] = [];
  let looks = 0;
  return {
    name: 'fake',
    stagedBytes,
    looks: () => looks,
    stage: (_planet, signed) => {
      events.push('stage');
      stagedBytes.push(signed);
      if (script.stage === 'refuse') {
        return Promise.resolve(err({ kind: 'REFUSED' as const, message: 'nonce too old' }));
      }
      if (script.stage === 'doubt') {
        return Promise.resolve(err({ kind: 'UNCERTAIN' as const, message: 'timed out' }));
      }
      return Promise.resolve(ok(transactionId(signed)));
    },
    result: () => {
      const results = script.results ?? [];
      const answer = results[Math.min(looks, results.length - 1)];
      looks += 1;
      return Promise.resolve(
        answer ?? ok({ status: 'STAGING' as const, blockIndex: null, exceptions: [] }),
      );
    },
  };
};

const status = (
  value: TransactionResult['status'],
  exceptions: string[] = [],
  blockIndex: number | null = null,
): Result<TransactionResult, TransactionSourceError> =>
  ok({ status: value, blockIndex, exceptions });

describe('runPurchase, live, with a sender', () => {
  it('stages what was signed after the record is written, and records it as sent', async () => {
    const { events, request, records } = setup();
    const sender = fakeSender(events);

    const outcome = await runPurchase(request({ mode: 'live', sender }));

    expect(outcome).toMatchObject({ kind: 'sent', uncertain: false });
    expect(events).toEqual([
      'write:prepared',
      'goldCurrency',
      'nextNonce',
      'unsignedTransaction',
      'attachSignature',
      'stage',
      'write:sent',
    ]);
    expect(records()[0]).toMatchObject({ mode: 'live', status: 'sent', note: 'sent' });
    // What was staged is the signed transaction whose id the record carries.
    expect(transactionId(sender.stagedBytes[0] as Uint8Array)).toBe(records()[0]?.transactionId);
  });

  it('does not buy the same offer twice: a sent one is in the log and blocks the next try', async () => {
    const { events, request } = setup();
    const sender = fakeSender(events);
    await runPurchase(request({ mode: 'live', sender, newId: () => 'first' }));

    const again = await runPurchase(request({ mode: 'live', sender, newId: () => 'second' }));

    expect(again).toMatchObject({ kind: 'refused', refusal: { code: 'ALREADY' } });
    expect(sender.stagedBytes).toHaveLength(1);
  });

  it('records a node that said no as failed, so the offer is free again', async () => {
    const { events, request, records } = setup();
    const sender = fakeSender(events, { stage: 'refuse' });

    const outcome = await runPurchase(request({ mode: 'live', sender }));

    expect(outcome).toMatchObject({ kind: 'not-accepted', message: 'nonce too old' });
    expect(records()[0]).toMatchObject({ status: 'failed', note: 'not accepted: nonce too old' });
    const retry = await runPurchase(
      request({ mode: 'live', sender: fakeSender(events), newId: () => 'b' }),
    );
    expect(retry.kind).toBe('sent');
  });

  it('records a send that got no answer as sent, not failed, and keeps the offer blocked', async () => {
    const { events, request, records } = setup();
    const sender = fakeSender(events, { stage: 'doubt' });

    const outcome = await runPurchase(request({ mode: 'live', sender }));

    expect(outcome).toMatchObject({ kind: 'sent', uncertain: true });
    expect(records()[0]?.status).toBe('sent');
    expect(records()[0]?.note).toContain('no answer to the send');
    const again = await runPurchase(request({ mode: 'live', sender, newId: () => 'b' }));
    expect(again).toMatchObject({ kind: 'refused', refusal: { code: 'ALREADY' } });
  });

  it('never stages a dry run, even when handed a sender', async () => {
    const { events, request } = setup();
    const sender = fakeSender(events);

    const outcome = await runPurchase(request({ mode: 'dry-run', sender }));

    expect(outcome.kind).toBe('dry-run');
    expect(events).not.toContain('stage');
  });

  it('never stages a purchase the rules refused, or one that could not be signed', async () => {
    const { events, request } = setup({ unsignedFails: true });
    const sender = fakeSender(events);

    const refused = await runPurchase(request({ mode: 'live', sender, limitNcg: null }));
    const failed = await runPurchase(request({ mode: 'live', sender }));

    expect(refused).toMatchObject({ kind: 'refused', refusal: { code: 'NO_LIMIT' } });
    expect(failed).toMatchObject({ kind: 'failed', error: { stage: 'unsigned' } });
    expect(events).not.toContain('stage');
  });
});

describe('awaitPurchase', () => {
  const TX = 'f'.repeat(64);
  const sentRecord: PurchaseRecord = {
    id: 'rec',
    productId: '00112233-4455-6677-8899-aabbccddeeff',
    planet: 'heimdall',
    itemId: 10110000,
    price: 701,
    mode: 'live',
    status: 'sent',
    at: 1,
    transactionId: TX,
    note: 'sent',
  };

  const run = async (
    results: Result<TransactionResult, TransactionSourceError>[],
    over: { timeoutMs?: number; invalidGraceMs?: number } = {},
  ) => {
    let kept: string | null = JSON.stringify([sentRecord]);
    const log = purchaseLogOver({
      get: () => kept,
      set: (json) => {
        kept = json;
      },
    });
    const sleeps: number[] = [];
    const looked: string[] = [];
    const sender = fakeSender([], { results });
    const outcome = await awaitPurchase({
      planet: 'heimdall',
      sender,
      log,
      recordId: 'rec',
      transactionId: TX,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      intervalMs: 10,
      timeoutMs: over.timeoutMs ?? 100,
      invalidGraceMs: over.invalidGraceMs ?? 30,
      onLook: (s) => looked.push(s),
    });
    return {
      outcome,
      sleeps,
      looked,
      record: parsePurchaseLog(kept).records[0],
      looks: sender.looks,
    };
  };

  it('confirms a transaction the chain executed, and settles the record', async () => {
    const { outcome, record, sleeps } = await run([status('SUCCESS', [], 55)]);

    expect(outcome).toEqual({ kind: 'confirmed', blockIndex: 55 });
    expect(record).toMatchObject({ status: 'confirmed', note: 'executed on the chain' });
    expect(sleeps).toEqual([]);
  });

  it('waits through staging and inclusion, telling what it sees, until it succeeds', async () => {
    const { outcome, looked, sleeps } = await run([
      status('STAGING'),
      status('INCLUDED'),
      status('SUCCESS'),
    ]);

    expect(outcome.kind).toBe('confirmed');
    expect(looked).toEqual(['STAGING', 'INCLUDED', 'SUCCESS']);
    expect(sleeps).toEqual([10, 10]);
  });

  it('reports a failure the chain gave, with the reason, and frees the offer', async () => {
    const { outcome, record } = await run([
      status('FAILURE', ['Nekoyume.Exceptions.ProductNotFoundException']),
    ]);

    expect(outcome).toEqual({ kind: 'failed', reason: 'the piece was already sold or withdrawn.' });
    expect(record).toMatchObject({ status: 'failed' });
    expect(record?.note).toContain('already sold or withdrawn');
  });

  it('does not read an id the node has never heard of as gone until the grace has passed', async () => {
    const { outcome, looks } = await run([
      status('INVALID'),
      status('INVALID'),
      status('STAGING'),
      status('SUCCESS'),
    ]);

    expect(outcome.kind).toBe('confirmed');
    expect(looks()).toBe(4);
  });

  it('leaves it unknown, and still sent, when the node stops knowing the id after the grace', async () => {
    const { outcome, record } = await run([status('INVALID')]);

    expect(outcome.kind).toBe('unknown');
    // Not failed: whether it went through is not known, so the offer stays blocked.
    expect(record?.status).toBe('sent');
    expect(record?.note).toContain('not known');
  });

  it('leaves it unknown, and still sent, when the chain does not decide in time', async () => {
    const { outcome, record } = await run([status('STAGING')]);

    expect(outcome).toEqual({
      kind: 'unknown',
      message: 'still waiting for the chain; check again later.',
    });
    expect(record?.status).toBe('sent');
  });

  it('does not take a node that could not be reached for a look as an answer', async () => {
    const { outcome, looked } = await run([
      err({ reason: 'OFFLINE', message: 'down' }),
      err({ reason: 'OFFLINE', message: 'down' }),
      status('SUCCESS'),
    ]);

    expect(outcome.kind).toBe('confirmed');
    expect(looked).toEqual(['SUCCESS']);
  });
});

describe('describeFailure', () => {
  it.each([
    [['Nekoyume.Exceptions.ProductNotFoundException'], 'already sold or withdrawn'],
    [['Nekoyume.InsufficientBalanceException'], 'not enough NCG'],
    [['Libplanet.NotEnoughFungibleAssetValueException'], 'not enough NCG'],
    [['Nekoyume.Action.FailedLoadStateException'], 'avatar does not exist'],
    [['Nekoyume.InvalidAddressException'], 'from oneself'],
    [['Some.Other.WeirdException'], 'WeirdException.'],
    [[], 'no reason given'],
  ])('says %j in words', (exceptions, words) => {
    expect(describeFailure(exceptions)).toContain(words);
  });
});

describe('deriveActionId and deriveRecordId', () => {
  it('make 16 bytes that depend on the offer, the moment and the number drawn', () => {
    const base = deriveActionId('p1', 1_700_000_000_000, 0.5);

    expect(base).toHaveLength(16);
    expect(Array.from(deriveActionId('p1', 1_700_000_000_000, 0.5))).toEqual(Array.from(base));
    expect(Array.from(deriveActionId('p2', 1_700_000_000_000, 0.5))).not.toEqual(Array.from(base));
    expect(Array.from(deriveActionId('p1', 1_700_000_000_001, 0.5))).not.toEqual(Array.from(base));
    expect(Array.from(deriveActionId('p1', 1_700_000_000_000, 0.6))).not.toEqual(Array.from(base));
  });

  it('write a record id that differs between two attempts in the same millisecond', () => {
    expect(deriveRecordId(1_700_000_000_000, 0.25)).not.toBe(
      deriveRecordId(1_700_000_000_000, 0.75),
    );
    expect(deriveRecordId(1_700_000_000_000, 0.25)).toBe(deriveRecordId(1_700_000_000_000, 0.25));
  });
});

describe('runPurchase', () => {
  it('writes the record first, then asks the node, then marks it as signed and not sent', async () => {
    const { events, request, records } = setup();

    const outcome = await runPurchase(request());

    expect(outcome.kind).toBe('dry-run');
    expect(events).toEqual([
      'write:prepared',
      'goldCurrency',
      'nextNonce',
      'unsignedTransaction',
      'attachSignature',
      'write:dry-run',
    ]);
    const [record] = records();
    expect(record).toMatchObject({
      id: 'record-1',
      productId: '00112233-4455-6677-8899-aabbccddeeff',
      planet: 'heimdall',
      itemId: 10110000,
      price: 701,
      mode: 'dry-run',
      status: 'dry-run',
      at: 1_700_000_000_000,
      note: 'signed, not sent',
    });
    expect(outcome.kind === 'dry-run' && record?.transactionId).toBe(
      outcome.kind === 'dry-run' ? outcome.run.transactionId : null,
    );
  });

  it('is a dry run unless told otherwise, and a second dry run of the same offer is allowed', async () => {
    const { request, records } = setup();

    const first = await runPurchase(request({ newId: () => 'a' }));
    const second = await runPurchase(request({ newId: () => 'b' }));

    expect([first.kind, second.kind]).toEqual(['dry-run', 'dry-run']);
    expect(records().map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('refuses before writing or asking anything, and says why', async () => {
    const { events, request, raw } = setup();

    const outcome = await runPurchase(request({ limitNcg: null }));

    expect(outcome).toMatchObject({ kind: 'refused', refusal: { code: 'NO_LIMIT' } });
    expect(events).toEqual([]);
    expect(raw()).toBeNull();
  });

  it('refuses an offer that is already in the log as a live purchase', async () => {
    const live: PurchaseRecord = {
      id: 'old',
      productId: '00112233-4455-6677-8899-aabbccddeeff',
      planet: 'heimdall',
      itemId: 10110000,
      price: 701,
      mode: 'live',
      status: 'prepared',
      at: 1,
      transactionId: null,
      note: null,
    };
    const { events, request } = setup({ stored: JSON.stringify([live]) });

    const outcome = await runPurchase(request());

    expect(outcome).toMatchObject({ kind: 'refused', refusal: { code: 'ALREADY' } });
    expect(events).toEqual([]);
  });

  it('does not write over a log it cannot read', async () => {
    const { events, request, raw } = setup({ stored: 'garbage' });

    const outcome = await runPurchase(request());

    expect(outcome).toMatchObject({ kind: 'refused', refusal: { code: 'LOG_UNREADABLE' } });
    expect(events).toEqual([]);
    expect(raw()).toBe('garbage');
  });

  it('does nothing at all for a live request that has no sender to send with', async () => {
    const { events, request, raw } = setup();

    const outcome = await runPurchase(request({ mode: 'live' }));

    expect(outcome).toEqual({ kind: 'live-unavailable' });
    expect(events).toEqual([]);
    expect(raw()).toBeNull();
  });

  it('marks the record failed, with where it stopped, when the node cannot assemble the transaction', async () => {
    const { events, request, records } = setup({ unsignedFails: true });

    const outcome = await runPurchase(request());

    expect(outcome).toMatchObject({ kind: 'failed', error: { stage: 'unsigned' } });
    expect(events).toEqual([
      'write:prepared',
      'goldCurrency',
      'nextNonce',
      'unsignedTransaction',
      'write:failed',
    ]);
    expect(records()[0]).toMatchObject({ status: 'failed', note: 'unsigned: node said no' });
  });
});
