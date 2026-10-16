/**
 * `NodeTransactionSender` (ADR-0044, step D): the one class that can stage. Every test here runs
 * against a replaced `fetch`; nothing reaches a node. What matters: a node that says no is told apart
 * from a node that did not answer, because the first means nothing happened and the second means it
 * may have.
 */

import { NodeTransactionSender } from './nodeTransactionSender';

const NODE = 'https://heimdall-rpc-1.nine-chronicles.com/graphql';
const TX = 'f53f73a9aca28e9695c92efef7a88455667b9b9918074971abfe71289871b8d4';

describe('NodeTransactionSender', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const answer = (body: unknown, status = 200): jest.Mock => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const queryOf = (fetchMock: jest.Mock): string => {
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(String(call[1].body)).query as string;
  };
  const sender = () => new NodeTransactionSender({ heimdall: NODE });

  describe('stage', () => {
    it('sends the signed bytes as hex in a stageTransaction mutation and returns the id', async () => {
      const fetchMock = answer({ data: { stageTransaction: TX.toUpperCase() } });

      const result = await sender().stage('heimdall', Uint8Array.of(0xde, 0xad, 0xbe, 0xef));

      expect(result).toEqual({ ok: true, value: TX });
      expect(queryOf(fetchMock)).toBe('mutation { stageTransaction(payload: "deadbeef") }');
    });

    it('calls a node that answered with an error a refusal: nothing was staged', async () => {
      answer({ data: null, errors: [{ message: 'Nonce is too old' }] });

      const result = await sender().stage('heimdall', Uint8Array.of(1));

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'REFUSED', message: expect.stringContaining('Nonce is too old') },
      });
    });

    it('calls an unreachable node uncertain, not refused: the request may have been heard', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new TypeError('Network request failed')),
      ) as unknown as typeof fetch;

      const result = await sender().stage('heimdall', Uint8Array.of(1));

      expect(result).toMatchObject({ ok: false, error: { kind: 'UNCERTAIN' } });
    });

    it('calls a node failure after the request uncertain too', async () => {
      answer({ error: 'bad gateway' }, 502);

      expect(await sender().stage('heimdall', Uint8Array.of(1))).toMatchObject({
        ok: false,
        error: { kind: 'UNCERTAIN' },
      });
    });

    it('calls an answer that is neither an error nor an id uncertain', async () => {
      answer({ data: { stageTransaction: 'not an id' } });
      const odd = await sender().stage('heimdall', Uint8Array.of(1));

      answer({ data: null });
      const empty = await sender().stage('heimdall', Uint8Array.of(1));

      expect(odd).toMatchObject({ ok: false, error: { kind: 'UNCERTAIN' } });
      expect(empty).toMatchObject({ ok: false, error: { kind: 'UNCERTAIN' } });
    });

    it('refuses, without asking, an empty payload or a planet with no node', async () => {
      const fetchMock = answer({});

      const empty = await sender().stage('heimdall', new Uint8Array());
      const thor = await sender().stage('thor', Uint8Array.of(1));

      expect(empty).toMatchObject({ ok: false, error: { kind: 'REFUSED' } });
      expect(thor).toMatchObject({ ok: false, error: { kind: 'REFUSED' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('result', () => {
    it('asks for the status, block and exceptions of a transaction id', async () => {
      const fetchMock = answer({
        data: {
          transaction: {
            transactionResult: {
              txStatus: 'FAILURE',
              blockIndex: 123,
              exceptionNames: ['Nekoyume.Exceptions.ProductNotFoundException', null],
            },
          },
        },
      });

      const result = await sender().result('heimdall', TX.toUpperCase());

      expect(result).toEqual({
        ok: true,
        value: {
          status: 'FAILURE',
          blockIndex: 123,
          exceptions: ['Nekoyume.Exceptions.ProductNotFoundException'],
        },
      });
      expect(queryOf(fetchMock)).toContain(`txId: "${TX}"`);
      expect(queryOf(fetchMock)).not.toContain('stage');
    });

    it('reads what the node says of an id it does not know: INVALID, with nothing else', async () => {
      answer({
        data: {
          transaction: {
            transactionResult: { txStatus: 'INVALID', blockIndex: null, exceptionNames: null },
          },
        },
      });

      expect(await sender().result('heimdall', TX)).toEqual({
        ok: true,
        value: { status: 'INVALID', blockIndex: null, exceptions: [] },
      });
    });

    it('fails on a malformed id without asking, on an unknown status, and on an unreachable node', async () => {
      const fetchMock = answer({});
      expect(await sender().result('heimdall', 'abc')).toMatchObject({ ok: false });
      expect(fetchMock).not.toHaveBeenCalled();

      answer({ data: { transaction: { transactionResult: { txStatus: 'MYSTERY' } } } });
      expect(await sender().result('heimdall', TX)).toMatchObject({ ok: false });

      global.fetch = jest.fn(() =>
        Promise.reject(new TypeError('Network request failed')),
      ) as unknown as typeof fetch;
      expect(await sender().result('heimdall', TX)).toMatchObject({
        ok: false,
        error: { reason: 'OFFLINE' },
      });

      expect(await sender().result('thor', TX)).toMatchObject({ ok: false });
    });
  });
});
