/**
 * Ranking by measured latency (ADR-0045): fastest first, a silent node last but kept.
 */

import { graphqlLatencyProbe, rankByLatency, type LatencyProbe } from './nodeRanking';

const probeOf =
  (latencies: Record<string, number | null | Error>): LatencyProbe =>
  async (url) => {
    const latency = latencies[url];
    if (latency instanceof Error) throw latency;
    return latency ?? null;
  };

describe('rankByLatency', () => {
  it('puts the fastest node first', async () => {
    const ranked = await rankByLatency(['a', 'b', 'c'], probeOf({ a: 300, b: 90, c: 170 }));

    expect(ranked).toEqual(['b', 'c', 'a']);
  });

  it('keeps a node that did not answer, after every node that did, in its given order', async () => {
    const ranked = await rankByLatency(
      ['dead1', 'slow', 'dead2', 'fast'],
      probeOf({ dead1: null, slow: 900, dead2: null, fast: 50 }),
    );

    expect(ranked).toEqual(['fast', 'slow', 'dead1', 'dead2']);
  });

  it('treats a probe that throws as a node that did not answer', async () => {
    const ranked = await rankByLatency(['a', 'b'], probeOf({ a: new Error('boom'), b: 40 }));

    expect(ranked).toEqual(['b', 'a']);
  });

  it('keeps the given order for a tie', async () => {
    expect(await rankByLatency(['a', 'b', 'c'], probeOf({ a: 100, b: 100, c: 100 }))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('probes every node together, not one after the other', async () => {
    let running = 0;
    let peak = 0;
    const probe: LatencyProbe = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return 1;
    };

    await rankByLatency(['a', 'b', 'c'], probe);

    expect(peak).toBe(3);
  });
});

describe('graphqlLatencyProbe', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const answer = (response: Response | Error): jest.Mock => {
    const fetchMock = jest.fn();
    if (response instanceof Error) fetchMock.mockRejectedValue(response);
    else fetchMock.mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  const clock = () => {
    let t = 1_000;
    return () => {
      t += 120;
      return t;
    };
  };

  it('is the time of a { __typename } round trip', async () => {
    const fetchMock = answer(new Response(JSON.stringify({ data: { __typename: 'Query' } })));

    const ms = await graphqlLatencyProbe(clock())('https://node.example/graphql');

    expect(ms).toBe(120);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ query: '{ __typename }' });
  });

  it.each([
    ['a 502', new Response('<html>502</html>', { status: 502 })],
    ['a GraphQL error', new Response(JSON.stringify({ errors: [{ message: 'no' }] }))],
    ['no network', new TypeError('Network request failed')],
  ])('is null for %s', async (_name, response) => {
    answer(response);

    expect(await graphqlLatencyProbe(clock())('https://node.example/graphql')).toBeNull();
  });
});
