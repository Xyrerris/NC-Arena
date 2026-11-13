/**
 * `NodeBalanceSource` (ADR-0044, step A): NCG held by an account, from `goldBalance(address)` at the
 * top of the node's query. Fixtures follow what Heimdall answered on 2026-10-15.
 */

import { NodeBalanceSource } from './nodeBalanceSource';

const NODE = 'https://heimdall-rpc-1.nine-chronicles.com/graphql';
const AGENT = '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB';

describe('NodeBalanceSource', () => {
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
  const source = () => new NodeBalanceSource({ heimdall: NODE });

  it('asks the top-level goldBalance with the 0x address and reads the decimal string', async () => {
    const fetchMock = answer({ data: { goldBalance: '5.52' } });

    const result = await source().readNcg('heimdall', AGENT);

    expect(result).toEqual({ ok: true, value: 5.52 });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(NODE);
    expect(JSON.parse(String(call[1].body)).query).toBe(`{ goldBalance(address: "0x${AGENT}") }`);
  });

  it('accepts the address with its 0x prefix and a whole-number balance', async () => {
    answer({ data: { goldBalance: '1200' } });

    expect(await source().readNcg('heimdall', `0x${AGENT}`)).toEqual({ ok: true, value: 1200 });
  });

  it('refuses a malformed address without asking the node', async () => {
    const fetchMock = answer({ data: { goldBalance: '1' } });

    const result = await source().readNcg('heimdall', '0x1234');

    expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails, rather than reporting zero, on an error or an answer that is not a balance', async () => {
    answer({ data: null, errors: [{ message: 'boom' }] });
    const errored = await source().readNcg('heimdall', AGENT);

    answer({ data: { goldBalance: 'NaN' } });
    const odd = await source().readNcg('heimdall', AGENT);

    expect(errored).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(odd).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
  });

  it('has no balance to read on a planet without a node, and calls an unreachable one OFFLINE', async () => {
    expect(await source().readNcg('thor', AGENT)).toMatchObject({
      ok: false,
      error: { reason: 'FAILED' },
    });

    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    ) as unknown as typeof fetch;
    expect(await source().readNcg('heimdall', AGENT)).toMatchObject({
      ok: false,
      error: { reason: 'OFFLINE' },
    });
  });
});
