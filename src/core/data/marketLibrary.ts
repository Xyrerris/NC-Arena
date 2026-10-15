/**
 * What is on sale of an item, scanned once and kept for a minute (ADR-0044, "Next: buying").
 *
 * A scan of a common item reads five pages and takes about eight seconds, so the sheet that shows
 * it must not repeat the scan every time it is opened, switched or reopened a moment later. This
 * is the layer that makes that so, and it keeps three promises:
 *
 * - **A success is kept for `ttlMs`, and a failure is not.** The person's retry has to ask again,
 *   and a transient error must not be served back to them for a minute. A stopped scan is not a
 *   result at all.
 * - **Two askers of the same item share one scan.** Opening the sheet on a collection whose
 *   pieces overlap with another already being read must not double the requests. A late joiner is
 *   told how far the scan already is, so its counter does not start from nothing.
 * - **A scan nobody is waiting for stops.** Each asker can leave with its own `AbortSignal`; one
 *   leaving does not stop the scan for the others, and the last one leaving does, so a sheet
 *   closed halfway through a long scan stops reading pages instead of finishing for no one.
 *
 * In memory only, for the life of the process: the listings are prices, and a price kept for the
 * night is a price that is wrong.
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
import type { Planet } from '../model';

/** A complete scan and when it finished, for "updated N ago". */
export interface MarketScan {
  readonly listings: readonly MarketListing[];
  /** Epoch milliseconds. */
  readonly readAt: number;
}

export interface LibraryScanOptions extends ScanOptions {
  /**
   * Skip what is kept and ask the market. A purchase re-reads the offer it is about to show
   * (the service has no lookup by product), and a price kept for 59 seconds is not good enough
   * for that. A scan already running is still joined: it started moments ago.
   */
  readonly fresh?: boolean;
}

export interface MarketLibrary {
  /** Every listing of the item, from the cache when it is fresh, from the market when it is not. */
  scan(
    planet: Planet,
    itemSubType: number,
    itemId: number,
    options?: LibraryScanOptions,
  ): Promise<Result<MarketScan, MarketError>>;
}

export interface MarketLibraryDeps {
  source: MarketSource;
  /** How long a complete scan is served without asking the market again. */
  ttlMs?: number;
  /** Injected so a test can say how much time has passed. */
  now?: () => number;
}

export const DEFAULT_MARKET_TTL_MS = 60_000;

interface InFlight {
  readonly controller: AbortController;
  readonly subscribers: Set<(scanned: number) => void>;
  promise: Promise<Result<MarketScan, MarketError>>;
  /** How many askers are still waiting on it. */
  waiting: number;
  /** How far the scan has got, for an asker that arrives late. */
  scanned: number;
  finished: boolean;
}

const cancelled = (): MarketError => ({
  reason: 'CANCELLED',
  message: 'market: the scan was stopped.',
});

export function createMarketLibrary({
  source,
  ttlMs = DEFAULT_MARKET_TTL_MS,
  now = Date.now,
}: MarketLibraryDeps): MarketLibrary {
  const fresh = new Map<string, MarketScan>();
  const inFlight = new Map<string, InFlight>();

  const begin = (key: string, planet: Planet, itemSubType: number, itemId: number): InFlight => {
    const entry: InFlight = {
      controller: new AbortController(),
      subscribers: new Set(),
      promise: Promise.resolve(err(cancelled())),
      waiting: 0,
      scanned: 0,
      finished: false,
    };
    entry.promise = source
      .scanItem(planet, itemSubType, itemId, {
        signal: entry.controller.signal,
        onProgress: (scanned) => {
          entry.scanned = scanned;
          for (const subscriber of entry.subscribers) subscriber(scanned);
        },
      })
      // The port answers with a result; a source that throws instead is still a failed scan.
      .catch((cause: unknown): Result<readonly MarketListing[], MarketError> =>
        err({
          reason: 'FAILED',
          message: `${source.name}: ${cause instanceof Error ? cause.message : 'the scan threw.'}`,
        }),
      )
      .then((result) => {
        entry.finished = true;
        if (inFlight.get(key) === entry) inFlight.delete(key);
        if (!result.ok) return result;

        const scan: MarketScan = { listings: result.value, readAt: now() };
        for (const [cachedKey, cached] of fresh) {
          if (scan.readAt - cached.readAt >= ttlMs) fresh.delete(cachedKey);
        }
        fresh.set(key, scan);
        return ok(scan);
      });
    inFlight.set(key, entry);
    return entry;
  };

  const attach = (
    key: string,
    entry: InFlight,
    options: LibraryScanOptions,
  ): Promise<Result<MarketScan, MarketError>> =>
    new Promise((resolve) => {
      const { onProgress, signal } = options;
      let settled = false;

      entry.waiting += 1;
      if (onProgress !== undefined) {
        entry.subscribers.add(onProgress);
        if (entry.scanned > 0) onProgress(entry.scanned);
      }

      const finish = (result: Result<MarketScan, MarketError>): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (onProgress !== undefined) entry.subscribers.delete(onProgress);
        entry.waiting -= 1;
        // The last asker leaving a scan that is still running takes the scan with it.
        if (entry.waiting === 0 && !entry.finished) {
          if (inFlight.get(key) === entry) inFlight.delete(key);
          entry.controller.abort();
        }
        resolve(result);
      };
      const onAbort = (): void => finish(err(cancelled()));

      if (signal?.aborted) {
        finish(err(cancelled()));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      void entry.promise.then(finish);
    });

  return {
    scan(planet, itemSubType, itemId, options = {}) {
      if (options.signal?.aborted) return Promise.resolve(err(cancelled()));

      const key = `${planet}:${itemSubType}:${itemId}`;
      const cached = options.fresh === true ? undefined : fresh.get(key);
      if (cached !== undefined) {
        if (now() - cached.readAt < ttlMs) {
          options.onProgress?.(cached.listings.length);
          return Promise.resolve(ok(cached));
        }
        fresh.delete(key);
      }

      const entry = inFlight.get(key) ?? begin(key, planet, itemSubType, itemId);
      return attach(key, entry, options);
    },
  };
}
