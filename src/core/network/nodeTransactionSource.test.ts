/**
 * `NodeTransactionSource` (ADR-0044, step C): the four questions it asks a node, how it words them,
 * and what it refuses to put in a query. Fixtures follow what Heimdall answered on 2026-10-16.
 */

import { bytesToHex, dict, encodeBencodex, type BencodexValue } from '../common/bencodex';
import { GENESIS_HASHES, NodeTransactionSource } from './nodeTransactionSource';

const NODE = 'https://heimdall-rpc-1.nine-chronicles.com/graphql';
const AGENT = '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB';

describe('NodeTransactionSource', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const answer = (body: unknown): jest.Mock => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const queryOf = (fetchMock: jest.Mock): string => {
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(String(call[1].body)).query as string;
  };
  const source = () => new NodeTransactionSource({ heimdall: NODE });

  it('knows the genesis hash of each planet it serves', () => {
    expect(source().genesisHash('heimdall')).toBe(GENESIS_HASHES.heimdall);
    expect(source().genesisHash('odin')).toBe(GENESIS_HASHES.odin);
    expect(source().genesisHash('thor')).toBeNull();
  });

  describe('nextNonce', () => {
    it('asks for the nonce of the account with its 0x address', async () => {
      const fetchMock = answer({ data: { transaction: { nextTxNonce: 12 } } });

      const result = await source().nextNonce('heimdall', AGENT);

      expect(result).toEqual({ ok: true, value: 12n });
      expect(queryOf(fetchMock)).toBe(`{ transaction { nextTxNonce(address: "0x${AGENT}") } }`);
    });

    it('refuses an address that is not 40 hex digits before it is quoted into a query', async () => {
      const fetchMock = answer({});

      const result = await source().nextNonce('heimdall', '0x1" ) { x');

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails on an answer that is not a whole number or on a node error', async () => {
      answer({ data: { transaction: { nextTxNonce: 'seven' } } });
      const odd = await source().nextNonce('heimdall', AGENT);

      answer({ data: null, errors: [{ message: 'boom' }] });
      const errored = await source().nextNonce('heimdall', AGENT);

      expect(odd).toMatchObject({ ok: false });
      expect(errored).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('boom') },
      });
    });
  });

  describe('goldCurrency', () => {
    const state = (value: BencodexValue) => ({
      data: { state: bytesToHex(encodeBencodex(value)) },
    });
    const NCG = dict([
      ['ticker', 'NCG'],
      ['decimalPlaces', Uint8Array.of(2)],
      ['minters', null],
    ]);

    it('reads the currency from the legacy account state, verbatim, with its decimals', async () => {
      const fetchMock = answer(state(dict([['currency', NCG]])));

      const result = await source().goldCurrency('heimdall');

      expect(result.ok && bytesToHex(encodeBencodex(result.value.currency))).toBe(
        bytesToHex(encodeBencodex(NCG)),
      );
      expect(result.ok && result.value.decimalPlaces).toBe(2);
      expect(queryOf(fetchMock)).toContain('0x1000000000000000000000000000000000000000');
      expect(queryOf(fetchMock)).toContain('0x000000000000000000000000000000000000000a');
    });

    it.each([
      ['no state', { data: { state: null } }],
      ['a state that is not hex', { data: { state: 'zz' } }],
      ['a state without a currency', state(dict([['other', 1n]]))],
      [
        'decimals that are not one byte',
        state(dict([['currency', dict([['decimalPlaces', Uint8Array.of(1, 2)]])]])),
      ],
      ['hex that is not Bencodex', { data: { state: 'ff' } }],
    ])('fails on %s, rather than guess what to pay in', async (_what, body) => {
      answer(body);

      expect(await source().goldCurrency('heimdall')).toMatchObject({ ok: false });
    });
  });

  describe('unsignedTransaction', () => {
    const request = { publicKeyHex: '04ab', plainValueHex: 'cd', nonce: 3n };

    it('asks for the transaction with the public key, the action, the nonce and the gas', async () => {
      const fetchMock = answer({ data: { transaction: { unsignedTransaction: 'dd' } } });

      const result = await source().unsignedTransaction('heimdall', request);

      expect(result).toEqual({ ok: true, value: Uint8Array.of(0xdd) });
      const query = queryOf(fetchMock);
      expect(query).toContain('publicKey: "04ab"');
      expect(query).toContain('plainValue: "cd"');
      expect(query).toContain('nonce: 3');
      expect(query).toContain(
        'maxGasPrice: { quantity: "0.00001", ticker: "Mead", decimalPlaces: 18 }',
      );
    });

    it('refuses what is not hex or a nonce out of range, without asking', async () => {
      const fetchMock = answer({});

      const notHex = await source().unsignedTransaction('heimdall', {
        ...request,
        plainValueHex: 'x"',
      });
      const negative = await source().unsignedTransaction('heimdall', { ...request, nonce: -1n });

      expect(notHex).toMatchObject({ ok: false });
      expect(negative).toMatchObject({ ok: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails when what comes back is not hex', async () => {
      answer({ data: { transaction: { unsignedTransaction: 'not hex' } } });

      expect(await source().unsignedTransaction('heimdall', request)).toMatchObject({ ok: false });
    });
  });

  describe('attachSignature', () => {
    it('hands the node the unsigned bytes and the signature, and takes the signed bytes back', async () => {
      const fetchMock = answer({ data: { transaction: { signTransaction: 'beef' } } });

      const result = await source().attachSignature(
        'heimdall',
        Uint8Array.of(1, 2),
        Uint8Array.of(3),
      );

      expect(result).toEqual({ ok: true, value: Uint8Array.of(0xbe, 0xef) });
      const query = queryOf(fetchMock);
      expect(query).toContain('unsignedTransaction: "0102"');
      expect(query).toContain('signature: "03"');
      // Nothing in this class sends: the word is not in any query it can make.
      expect(query).not.toContain('stage');
    });
  });

  it('has nothing to ask on a planet with no node, and calls an unreachable one OFFLINE', async () => {
    expect(await source().nextNonce('thor', AGENT)).toMatchObject({
      ok: false,
      error: { reason: 'FAILED' },
    });

    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    ) as unknown as typeof fetch;
    expect(await source().nextNonce('heimdall', AGENT)).toMatchObject({
      ok: false,
      error: { reason: 'OFFLINE' },
    });
  });

  it('does not have a method that sends', () => {
    expect('stageTransaction' in source()).toBe(false);
  });
});
