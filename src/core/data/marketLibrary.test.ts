/**
 * `createMarketLibrary` (ADR-0044): a scan kept for a minute, shared between askers, and stopped
 * when nobody is waiting for it. The market is replaced by a source whose scans the test finishes
 * by hand, so "while it is still running" is something a test can stand in.
 */

import {
  err,
  ok,
  type MarketError,
  type MarketListing,
  type MarketSource,
  type Result,
  type ScanOptions,
} from '../common';
import { createMarketLibrary } from './marketLibrary';

const listing = (n: number): MarketListing => ({
  productId: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 100,
  price: n,
  quantity: 1,
  unitPrice: n,
  hasSkill: false,
  sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  registeredBlockIndex: 1,
});

type Answer = Result<readonly MarketListing[], MarketError>;

interface Scan {
  planet: string;
  subType: number;
  itemId: number;
  options: ScanOptions;
  finish: (answer: Answer) => void;
  aborted: () => boolean;
}

/** A source whose every scan stays open until the test finishes it. */
const controllableSource = () => {
  const scans: Scan[] = [];
  const source: MarketSource = {
    name: 'test',
    scanItem: (planet, subType, itemId, options = {}) =>
      new Promise<Answer>((resolve) => {
        let aborted = false;
        options.signal?.addEventListener('abort', () => {
          aborted = true;
          resolve(err({ reason: 'CANCELLED', message: 'stopped' }));
        });
        scans.push({
          planet,
          subType,
          itemId,
          options,
          finish: resolve,
          aborted: () => aborted,
        });
      }),
  };
  return { source, scans };
};

describe('createMarketLibrary', () => {
  let clock = 1_000_000;
  const now = () => clock;
  beforeEach(() => {
    clock = 1_000_000;
  });

  const build = (ttlMs = 60_000) => {
    const { source, scans } = controllableSource();
    return { library: createMarketLibrary({ source, ttlMs, now }), scans };
  };

  it('serves a fresh scan from memory, with when it was read, and asks the market again once it is stale', async () => {
    const { library, scans } = build();

    const first = library.scan('heimdall', 6, 10110000);
    scans[0]?.finish(ok([listing(1), listing(2)]));
    expect(await first).toEqual({
      ok: true,
      value: { listings: [listing(1), listing(2)], readAt: 1_000_000 },
    });

    clock += 59_999;
    const seen: number[] = [];
    const again = await library.scan('heimdall', 6, 10110000, { onProgress: (n) => seen.push(n) });
    expect(again.ok && again.value.listings).toHaveLength(2);
    expect(scans).toHaveLength(1);
    // A cached answer still tells the counter how much it is made of, so the screen has one number.
    expect(seen).toEqual([2]);

    clock += 1;
    const stale = library.scan('heimdall', 6, 10110000);
    expect(scans).toHaveLength(2);
    scans[1]?.finish(ok([listing(9)]));
    const refreshed = await stale;
    expect(refreshed.ok && refreshed.value.readAt).toBe(1_060_000);
  });

  it('keeps one cache entry per planet, route and item', () => {
    const { library, scans } = build();

    void library.scan('heimdall', 6, 10110000);
    void library.scan('odin', 6, 10110000);
    void library.scan('heimdall', 7, 10110000);
    void library.scan('heimdall', 6, 10120000);

    expect(scans.map((s) => [s.planet, s.subType, s.itemId])).toEqual([
      ['heimdall', 6, 10110000],
      ['odin', 6, 10110000],
      ['heimdall', 7, 10110000],
      ['heimdall', 6, 10120000],
    ]);
  });

  it('does not keep a failure: the next ask reads the market again', async () => {
    const { library, scans } = build();

    const failed = library.scan('heimdall', 6, 10110000);
    scans[0]?.finish(err({ reason: 'OFFLINE', message: 'down' }));
    expect(await failed).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });

    const retry = library.scan('heimdall', 6, 10110000);
    expect(scans).toHaveLength(2);
    scans[1]?.finish(ok([listing(1)]));
    expect((await retry).ok).toBe(true);
  });

  it('counts a source that throws as a failed scan, not as a crash', async () => {
    const source: MarketSource = {
      name: 'test',
      scanItem: () => Promise.reject(new Error('socket closed')),
    };
    const library = createMarketLibrary({ source, now });

    expect(await library.scan('heimdall', 6, 10110000)).toMatchObject({
      ok: false,
      error: { reason: 'FAILED', message: expect.stringContaining('socket closed') },
    });
  });

  it('shares one scan between two askers, tells both how far it is, and hands both the answer', async () => {
    const { library, scans } = build();
    const first: number[] = [];
    const second: number[] = [];

    const a = library.scan('heimdall', 6, 10110000, { onProgress: (n) => first.push(n) });
    scans[0]?.options.onProgress?.(1000);
    // Arrives late: it is told 1,000 at once, and then follows the rest with the first.
    const b = library.scan('heimdall', 6, 10110000, { onProgress: (n) => second.push(n) });
    scans[0]?.options.onProgress?.(1500);
    scans[0]?.finish(ok([listing(1)]));

    const [ra, rb] = await Promise.all([a, b]);
    expect(scans).toHaveLength(1);
    expect(first).toEqual([1000, 1500]);
    expect(second).toEqual([1000, 1500]);
    expect(ra).toEqual(rb);
  });

  it('lets one asker leave without stopping the scan for the other', async () => {
    const { library, scans } = build();
    const leaving = new AbortController();

    const a = library.scan('heimdall', 6, 10110000, { signal: leaving.signal });
    const b = library.scan('heimdall', 6, 10110000);
    leaving.abort();

    expect(await a).toMatchObject({ ok: false, error: { reason: 'CANCELLED' } });
    expect(scans[0]?.aborted()).toBe(false);

    scans[0]?.finish(ok([listing(1)]));
    expect((await b).ok).toBe(true);
  });

  it('stops the scan when the last asker leaves, and keeps nothing of it', async () => {
    const { library, scans } = build();
    const one = new AbortController();
    const two = new AbortController();

    const a = library.scan('heimdall', 6, 10110000, { signal: one.signal });
    const b = library.scan('heimdall', 6, 10110000, { signal: two.signal });
    one.abort();
    two.abort();

    expect(await a).toMatchObject({ ok: false, error: { reason: 'CANCELLED' } });
    expect(await b).toMatchObject({ ok: false, error: { reason: 'CANCELLED' } });
    expect(scans[0]?.aborted()).toBe(true);

    // Nothing was cached and nothing is still in flight: asking again starts a new scan.
    void library.scan('heimdall', 6, 10110000);
    expect(scans).toHaveLength(2);
  });

  it('refuses at once an asker that is already gone, without touching the market', async () => {
    const { library, scans } = build();
    const gone = new AbortController();
    gone.abort();

    const result = await library.scan('heimdall', 6, 10110000, { signal: gone.signal });

    expect(result).toMatchObject({ ok: false, error: { reason: 'CANCELLED' } });
    expect(scans).toHaveLength(0);
  });
});
