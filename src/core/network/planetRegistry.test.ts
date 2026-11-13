/**
 * The planet registry (ADR-0045): which of its keys are read, what is thrown away, and that a
 * cache which is not exactly what was written is a miss.
 */

import {
  decodeRegistryCache,
  encodeRegistryCache,
  parsePlanetRegistry,
  PlanetRegistrySource,
} from './planetRegistry';

/** The shape the registry answered with on 2026-10-21, cut down to what matters. */
const REGISTRY = [
  {
    id: '0x000000000000',
    name: 'odin',
    rpcEndpoints: {
      'headless.gql': [
        'https://odin-rpc-1.nine-chronicles.com/graphql',
        'https://odin5.9capi.com/graphql',
        'https://odin6.9capi.com/graphql',
      ],
      'market.rest': ['https://b.9capi.com/marketProviderOdin'],
      'mimir.gql': ['https://odin-mimir.9c.gg/graphql'],
      'world-boss.rest': ['https://odin-world-boss.9c.gg'],
    },
  },
  {
    id: '0x000000000001',
    name: 'heimdall',
    rpcEndpoints: {
      'headless.gql': ['https://heimdall6.9capi.com/graphql'],
      'market.rest': ['https://b.9capi.com/marketProviderHeimdall'],
      'mimir.gql': ['https://heimdall-mimir.9c.gg/graphql'],
      'world-boss.rest': ['http://heimdall-world-boss.9c.gg'],
    },
  },
];

describe('parsePlanetRegistry', () => {
  it('reads nodes, Mimir and the market of each served planet, in the registry order', () => {
    expect(parsePlanetRegistry(REGISTRY)).toEqual({
      odin: {
        nodes: [
          'https://odin-rpc-1.nine-chronicles.com/graphql',
          'https://odin5.9capi.com/graphql',
          'https://odin6.9capi.com/graphql',
        ],
        mimir: ['https://odin-mimir.9c.gg/graphql'],
        market: ['https://b.9capi.com/marketProviderOdin'],
      },
      heimdall: {
        nodes: ['https://heimdall6.9capi.com/graphql'],
        mimir: ['https://heimdall-mimir.9c.gg/graphql'],
        market: ['https://b.9capi.com/marketProviderHeimdall'],
      },
    });
  });

  it('leaves Thor out even when the registry names it', () => {
    const withThor = [
      ...REGISTRY,
      {
        name: 'thor',
        rpcEndpoints: { 'headless.gql': ['https://thor-rpc-1.nine-chronicles.com/graphql'] },
      },
    ];

    expect(Object.keys(parsePlanetRegistry(withThor)).sort()).toEqual(['heimdall', 'odin']);
  });

  it('keeps only https URLs, once each', () => {
    const registry = parsePlanetRegistry([
      {
        name: 'heimdall',
        rpcEndpoints: {
          'headless.gql': [
            'http://insecure.example/graphql',
            'https://a.example/graphql',
            'https://a.example/graphql',
            'ftp://nope',
          ],
        },
      },
    ]);

    expect(registry.heimdall?.nodes).toEqual(['https://a.example/graphql']);
  });

  it('drops a planet with no usable node, and only that planet', () => {
    const registry = parsePlanetRegistry([
      { name: 'odin', rpcEndpoints: { 'headless.gql': ['http://only-http.example/graphql'] } },
      REGISTRY[1],
    ]);

    expect(Object.keys(registry)).toEqual(['heimdall']);
  });

  it('skips an entry it cannot read without losing the others', () => {
    const registry = parsePlanetRegistry([{ name: 7 }, null, 'text', REGISTRY[1]]);

    expect(Object.keys(registry)).toEqual(['heimdall']);
  });

  it('answers nothing for anything that is not a list', () => {
    expect(parsePlanetRegistry({ planets: REGISTRY })).toEqual({});
    expect(parsePlanetRegistry(null)).toEqual({});
  });
});

describe('the registry cache', () => {
  const registry = parsePlanetRegistry(REGISTRY);

  it('reads back what it wrote', () => {
    expect(decodeRegistryCache(encodeRegistryCache(registry, 1234))).toEqual({
      readAt: 1234,
      registry,
    });
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', 'not json'],
    ['a version this code does not know', JSON.stringify({ version: 2, readAt: 1, registry })],
    ['a registry with no planet', JSON.stringify({ version: 1, readAt: 1, registry: {} })],
    [
      'a URL that is not https',
      JSON.stringify({
        version: 1,
        readAt: 1,
        registry: { odin: { nodes: ['http://x.example'], mimir: [], market: [] } },
      }),
    ],
  ])('is a miss for %s', (_name, text) => {
    expect(decodeRegistryCache(text)).toBeNull();
  });
});

describe('PlanetRegistrySource', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const answer = (response: Response | Error) => {
    const fetchMock = jest.fn();
    if (response instanceof Error) fetchMock.mockRejectedValue(response);
    else fetchMock.mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  it('reads the registry with a GET', async () => {
    const fetchMock = answer(new Response(JSON.stringify(REGISTRY)));

    const result = await new PlanetRegistrySource('https://registry.example/planets/').read();

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://registry.example/planets/');
    expect(init.method).toBe('GET');
  });

  it('is a failure when the registry names no usable planet', async () => {
    answer(new Response(JSON.stringify([])));

    const result = await new PlanetRegistrySource().read();

    expect(result.ok).toBe(false);
  });

  it('is a failure when the registry cannot be reached', async () => {
    answer(new TypeError('Network request failed'));

    const result = await new PlanetRegistrySource().read();

    expect(result.ok).toBe(false);
  });
});
