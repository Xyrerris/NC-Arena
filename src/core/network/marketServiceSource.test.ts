/**
 * `MarketServiceSource` (ADR-0044): one item's listings, read completely or not at all. The
 * service is replaced by a `fetch` the test controls; every case here is a way the real one has
 * been seen to behave, most of them traps that look like an answer (NC-Market's measurements).
 */

import { MarketServiceSource, PAGE_SIZE, marketItemsUrl } from './marketServiceSource';

const BASE = 'https://b.9capi.com/marketProviderHeimdall';
const ITEM = 10110000;
const SUB_TYPE = 6;

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  productId: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  itemId: ITEM,
  itemSubType: SUB_TYPE,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000 - n,
  price: 1 + n,
  sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  registeredBlockIndex: 1778208,
  skillModels: [],
  // Fields the screen does not read are present on the real answer and must be ignored.
  exist: true,
  legacy: false,
  statModels: [{ value: 4, type: 2, additional: true }],
  ...overrides,
});
const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => row(from + i));

const json = (itemProducts: unknown[]) =>
  new Response(JSON.stringify({ totalCount: 0, limit: 0, offset: 0, itemProducts }), {
    status: 200,
  });

describe('marketItemsUrl', () => {
  it('puts the sub type in the path and the item id in a filter, in the order the service reads', () => {
    expect(marketItemsUrl(`${BASE}/`, SUB_TYPE, ITEM, 2000)).toBe(
      `${BASE}/Market/products/items/6?limit=1000&offset=2000&order=cp_desc&itemIds=10110000`,
    );
  });

  it('refuses what would turn into the whole sub type, or into nonsense', () => {
    expect(() => marketItemsUrl(BASE, SUB_TYPE, 0, 0)).toThrow('item id');
    expect(() => marketItemsUrl(BASE, SUB_TYPE, 1.5, 0)).toThrow('item id');
    expect(() => marketItemsUrl(BASE, 0, ITEM, 0)).toThrow('sub type');
    expect(() => marketItemsUrl(BASE, SUB_TYPE, ITEM, -1)).toThrow('offset');
  });
});

describe('MarketServiceSource', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const noWait = { sleep: () => Promise.resolve(), pageDelayMs: 0 };
  const source = (extra = {}) => new MarketServiceSource(undefined, { ...noWait, ...extra });

  /** Answers the n-th request with the n-th response; a response is built per call (a body reads once). */
  const answers = (...responses: (() => Response | Error)[]): jest.Mock => {
    const fetchMock = jest.fn();
    for (const make of responses) {
      fetchMock.mockImplementationOnce(() => {
        const made = make();
        return made instanceof Error ? Promise.reject(made) : Promise.resolve(made);
      });
    }
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const urls = (fetchMock: jest.Mock): string[] =>
    fetchMock.mock.calls.map((call) => call[0] as string);

  it('reads one short page as the complete answer, with what a list of offers needs', async () => {
    const fetchMock = answers(() =>
      json([row(1, { level: 4, skillModels: [{ skillId: 1 }], price: 142.5 })]),
    );

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toEqual({
      ok: true,
      value: [
        {
          productId: '00000000-0000-0000-0000-000000000001',
          itemId: ITEM,
          itemSubType: SUB_TYPE,
          level: 4,
          grade: 1,
          elementalType: 0,
          combatPoint: 999,
          price: 142.5,
          hasSkill: true,
          sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
          registeredBlockIndex: 1778208,
        },
      ],
    });
    expect(urls(fetchMock)).toEqual([
      `${BASE}/Market/products/items/6?limit=1000&offset=0&order=cp_desc&itemIds=10110000`,
    ]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('NC-Arena');
  });

  it('says "nothing on sale" as an empty list, not as a failure', async () => {
    answers(() => json([]));

    expect(await source().scanItem('heimdall', SUB_TYPE, ITEM)).toEqual({ ok: true, value: [] });
  });

  it('reads every page, de-duplicates across them, and reports a running count', async () => {
    // Page 2 repeats 10 listings of page 1 — the service does that — and ends the scan, short.
    const fetchMock = answers(
      () => json(rows(0, PAGE_SIZE)),
      () => json([...rows(PAGE_SIZE - 10, 10), ...rows(PAGE_SIZE, 40)]),
    );
    const progress: number[] = [];

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM, {
      onProgress: (scanned) => progress.push(scanned),
    });

    expect(result.ok && result.value.length).toBe(PAGE_SIZE + 40);
    expect(progress).toEqual([PAGE_SIZE, PAGE_SIZE + 40]);
    // The next page starts after what was *received*, repeats included, as the service counts.
    expect(urls(fetchMock)[1]).toContain('offset=1000');
  });

  it('stops when pages stop bringing anything new, rather than looping on repeats', async () => {
    const page = rows(0, PAGE_SIZE);
    const fetchMock = answers(
      () => json(page),
      () => json(page),
      () => json(page),
      () => json(page),
    );

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result.ok && result.value.length).toBe(PAGE_SIZE);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not take a different item for an answer: an ignored filter is a failure', async () => {
    // The whole sub type, which is what the service sends when it ignores `itemIds`.
    answers(() => json([row(1), row(2, { itemId: 10120000 })]));

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toMatchObject({
      ok: false,
      error: { reason: 'FAILED', message: expect.stringContaining('ignored the item filter') },
    });
  });

  it('retries an overloaded service, and gives up after three tries', async () => {
    const overloaded = () => new Response('<html>busy</html>', { status: 503 });
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };

    answers(overloaded, () => json([row(1)]));
    const recovered = await source({ sleep }).scanItem('heimdall', SUB_TYPE, ITEM);

    const fetchMock = answers(overloaded, overloaded, overloaded);
    const gaveUp = await source({ sleep }).scanItem('heimdall', SUB_TYPE, ITEM);

    expect(recovered.ok && recovered.value).toHaveLength(1);
    expect(gaveUp).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2000, 2000, 4000]);
  });

  it('does not retry what a retry cannot change', async () => {
    const fetchMock = answers(() => new Response('Not found', { status: 404 }));

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls an unreachable service OFFLINE, at once, so the person can choose to try again', async () => {
    const fetchMock = answers(() => new TypeError('Network request failed'));

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses an answer that does not have the shape it reads, rather than skipping a row', async () => {
    answers(() => json([row(1), { ...row(2), price: 'free' }]));

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toMatchObject({
      ok: false,
      error: { reason: 'FAILED', message: expect.stringContaining('shape') },
    });
  });

  it('has no market for a planet the registry does not list, and asks nothing', async () => {
    const fetchMock = answers();

    const result = await source().scanItem('thor', SUB_TYPE, ITEM);

    expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is stopped between pages by the caller, and answers CANCELLED with no list', async () => {
    const controller = new AbortController();
    const fetchMock = answers(
      () => json(rows(0, PAGE_SIZE)),
      () => json(rows(PAGE_SIZE, 5)),
    );

    const result = await source().scanItem('heimdall', SUB_TYPE, ITEM, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    expect(result).toMatchObject({ ok: false, error: { reason: 'CANCELLED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not hand over a list as complete when it ran out of pages', async () => {
    answers(
      () => json(rows(0, PAGE_SIZE)),
      () => json(rows(PAGE_SIZE, PAGE_SIZE)),
    );

    const result = await source({ maxPages: 2 }).scanItem('heimdall', SUB_TYPE, ITEM);

    expect(result).toMatchObject({
      ok: false,
      error: { reason: 'FAILED', message: expect.stringContaining('2 pages') },
    });
  });
});
