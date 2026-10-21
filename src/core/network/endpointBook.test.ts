/**
 * The endpoint book (ADR-0045): built-in lists, the registry on top, latency on top of that — and
 * tables the sources can keep a reference to while all of it changes.
 */

import { EndpointBook } from './endpointBook';
import type { PlanetRegistry } from './planetRegistry';

const DEFAULTS = {
  nodes: {
    odin: ['https://odin-rpc-1.example/graphql', 'https://odin5.example/graphql'],
    heimdall: ['https://heimdall6.example/graphql'],
  },
  mimir: {
    odin: 'https://mimir.example/odin/graphql/',
    heimdall: 'https://mimir.example/heimdall/graphql/',
  },
  market: {
    odin: 'https://market.example/odin',
    heimdall: 'https://market.example/heimdall',
  },
};

const registry = (heimdall: Partial<NonNullable<PlanetRegistry['heimdall']>>): PlanetRegistry => ({
  heimdall: { nodes: [], mimir: [], market: [], ...heimdall },
});

describe('EndpointBook', () => {
  it('serves the built-in lists before any registry is known', () => {
    const book = new EndpointBook(DEFAULTS);

    expect(book.nodes.heimdall).toEqual(['https://heimdall6.example/graphql']);
    expect(book.nodes.odin).toEqual(DEFAULTS.nodes.odin);
    expect(book.mimir.heimdall).toEqual(['https://mimir.example/heimdall/graphql/']);
    expect(book.market.heimdall).toBe('https://market.example/heimdall');
  });

  it('puts the registry first and keeps the built-in nodes it did not mention', () => {
    const book = new EndpointBook(DEFAULTS);

    book.apply(registry({ nodes: ['https://new.example/graphql'] }));

    expect(book.nodes.heimdall).toEqual([
      'https://new.example/graphql',
      'https://heimdall6.example/graphql',
    ]);
  });

  it('does not repeat a node that is both in the registry and built in', () => {
    const book = new EndpointBook(DEFAULTS);

    book.apply(registry({ nodes: ['https://heimdall6.example/graphql'] }));

    expect(book.nodes.heimdall).toEqual(['https://heimdall6.example/graphql']);
  });

  it('takes Mimir and the market from the registry too', () => {
    const book = new EndpointBook(DEFAULTS);

    book.apply(
      registry({
        mimir: ['https://heimdall-mimir.example/graphql'],
        market: ['https://registry-market.example/heimdall'],
      }),
    );

    expect(book.mimir.heimdall).toEqual([
      'https://heimdall-mimir.example/graphql',
      'https://mimir.example/heimdall/graphql/',
    ]);
    expect(book.market.heimdall).toBe('https://registry-market.example/heimdall');
  });

  it('orders by latency, with a node the ranking never saw after the ones it did', () => {
    const book = new EndpointBook(DEFAULTS);

    book.rank('nodes', 'odin', [
      'https://odin5.example/graphql',
      'https://odin-rpc-1.example/graphql',
    ]);
    book.apply({
      odin: {
        nodes: ['https://odin-rpc-1.example/graphql', 'https://odin-new.example/graphql'],
        mimir: [],
        market: [],
      },
    });

    expect(book.nodes.odin).toEqual([
      'https://odin5.example/graphql',
      'https://odin-rpc-1.example/graphql',
      'https://odin-new.example/graphql',
    ]);
  });

  it('ignores a ranked URL that is no longer a candidate', () => {
    const book = new EndpointBook(DEFAULTS);
    book.rank('nodes', 'heimdall', [
      'https://gone.example/graphql',
      'https://heimdall6.example/graphql',
    ]);

    expect(book.nodes.heimdall).toEqual(['https://heimdall6.example/graphql']);
  });

  it('shows a table it handed out the lists that arrive later', () => {
    const book = new EndpointBook(DEFAULTS);
    const table = book.nodes;
    const before = table.heimdall;

    book.apply(registry({ nodes: ['https://new.example/graphql'] }));

    expect(before).toEqual(['https://heimdall6.example/graphql']);
    expect(table.heimdall).toEqual([
      'https://new.example/graphql',
      'https://heimdall6.example/graphql',
    ]);
  });

  it('has no entry for Thor, in any table', () => {
    const book = new EndpointBook(DEFAULTS);

    expect(book.nodes.thor).toBeUndefined();
    expect(book.mimir.thor).toBeUndefined();
    expect(book.market.thor).toBeUndefined();
  });
});
