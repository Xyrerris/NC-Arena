/**
 * Keeping the endpoint book current (ADR-0045): the cache is applied first, the registry is read
 * only when the cache is old, a failure leaves the list alone, and latency orders what is left.
 */

import { err, ok } from '../common';
import {
  EndpointBook,
  encodeRegistryCache,
  type LatencyProbe,
  type PlanetRegistry,
  type RegistryReader,
} from '../network';
import { createEndpointRefresh, REGISTRY_MAX_AGE_MS } from './endpointRefresh';

const DEFAULTS = {
  nodes: { heimdall: ['https://builtin.example/graphql'] },
  mimir: { heimdall: 'https://builtin-mimir.example/graphql' },
  market: { heimdall: 'https://builtin-market.example' },
};

const registryOf = (nodes: string[]): PlanetRegistry => ({
  heimdall: { nodes, mimir: [], market: [] },
});

const NOW = 10_000_000_000;

function setup(options: {
  cached?: { registry: PlanetRegistry; readAt: number };
  read?: PlanetRegistry | 'FAIL';
  latency?: Record<string, number | null>;
}) {
  const book = new EndpointBook(DEFAULTS);
  let stored: string | null =
    options.cached === undefined
      ? null
      : encodeRegistryCache(options.cached.registry, options.cached.readAt);
  const read = jest.fn(async () =>
    options.read === undefined || options.read === 'FAIL'
      ? err({ code: 'OFFLINE' as const, message: 'down' })
      : ok(options.read),
  );
  const reader: RegistryReader = { read };
  const probe: LatencyProbe = async (url) => options.latency?.[url] ?? null;
  const refresh = createEndpointRefresh({
    book,
    reader,
    probe,
    cache: {
      get: () => stored,
      set: (json) => {
        stored = json;
      },
    },
    now: () => NOW,
  });
  return { book, read, refresh, stored: () => stored };
}

describe('createEndpointRefresh', () => {
  it('applies the cached registry at once, before anything is fetched', () => {
    const { book, refresh, read } = setup({
      cached: { registry: registryOf(['https://cached.example/graphql']), readAt: NOW },
    });

    expect(refresh.loadCached()).toBe(true);

    expect(book.nodes.heimdall).toEqual([
      'https://cached.example/graphql',
      'https://builtin.example/graphql',
    ]);
    expect(read).not.toHaveBeenCalled();
  });

  it('has nothing to apply on a first run', () => {
    const { book, refresh } = setup({});

    expect(refresh.loadCached()).toBe(false);
    expect(book.nodes.heimdall).toEqual(['https://builtin.example/graphql']);
  });

  it('does not ask the registry again while the cached answer is fresh', async () => {
    const { refresh, read } = setup({
      cached: {
        registry: registryOf(['https://cached.example/graphql']),
        readAt: NOW - REGISTRY_MAX_AGE_MS + 60_000,
      },
    });

    expect(await refresh.refresh()).toBe('CACHED');
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the registry when the cached answer is more than a day old, and keeps the new one', async () => {
    const { book, refresh, read, stored } = setup({
      cached: {
        registry: registryOf(['https://cached.example/graphql']),
        readAt: NOW - REGISTRY_MAX_AGE_MS - 1,
      },
      read: registryOf(['https://fresh.example/graphql']),
    });

    expect(await refresh.refresh()).toBe('FETCHED');

    expect(read).toHaveBeenCalledTimes(1);
    expect(book.nodes.heimdall).toEqual([
      'https://fresh.example/graphql',
      'https://builtin.example/graphql',
    ]);
    expect(stored()).toContain('fresh.example');
  });

  it('reads the registry on a first run', async () => {
    const { refresh, read } = setup({ read: registryOf(['https://fresh.example/graphql']) });

    expect(await refresh.refresh()).toBe('FETCHED');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not trust a cache dated in the future', async () => {
    const { refresh, read } = setup({
      cached: {
        registry: registryOf(['https://cached.example/graphql']),
        readAt: NOW + 86_400_000,
      },
      read: registryOf(['https://fresh.example/graphql']),
    });

    await refresh.refresh();

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached list when the registry cannot be read', async () => {
    const { book, refresh, stored } = setup({
      cached: {
        registry: registryOf(['https://cached.example/graphql']),
        readAt: NOW - REGISTRY_MAX_AGE_MS - 1,
      },
      read: 'FAIL',
    });
    const before = stored();
    refresh.loadCached();

    expect(await refresh.refresh()).toBe('CACHED');

    expect(book.nodes.heimdall).toEqual([
      'https://cached.example/graphql',
      'https://builtin.example/graphql',
    ]);
    expect(stored()).toBe(before);
  });

  it('falls back to the built-in list when there is no cache and no registry', async () => {
    const { book, refresh } = setup({ read: 'FAIL' });

    expect(await refresh.refresh()).toBe('BUILT_IN');
    expect(book.nodes.heimdall).toEqual(['https://builtin.example/graphql']);
  });

  it('orders the nodes by how fast they answer, a silent one last', async () => {
    const { book, refresh } = setup({
      cached: {
        registry: registryOf(['https://slow.example/graphql', 'https://dead.example/graphql']),
        readAt: NOW,
      },
      latency: {
        'https://slow.example/graphql': 400,
        'https://builtin.example/graphql': 80,
        'https://dead.example/graphql': null,
      },
    });
    refresh.loadCached();

    await refresh.refresh();

    expect(book.nodes.heimdall).toEqual([
      'https://builtin.example/graphql',
      'https://slow.example/graphql',
      'https://dead.example/graphql',
    ]);
  });

  it('never throws, even when the cache itself does', async () => {
    const book = new EndpointBook(DEFAULTS);
    const refresh = createEndpointRefresh({
      book,
      reader: {
        read: async () => {
          throw new Error('boom');
        },
      },
      probe: async () => null,
      cache: {
        get: () => {
          throw new Error('storage unavailable');
        },
        set: () => undefined,
      },
    });

    await expect(refresh.refresh()).resolves.toBe('BUILT_IN');
    expect(book.nodes.heimdall).toEqual(['https://builtin.example/graphql']);
  });
});
