/**
 * `MarketSource` over Planetarium's market service (`market.rest` in the planet registry), the
 * backend of the official market site (ADR-0044, "Next: buying").
 *
 * Everything here that looks fussy was measured against the live service by NC-Market, a sibling
 * project that has read this market for weeks, and re-checked here on 2026-10-15:
 *
 * - **The route takes the item *sub type*, and the item id is a filter.** `…/products/items/6`
 *   is "every weapon"; `?itemIds=10110000` narrows it. An item id in the path answers 200 with
 *   nothing in it, a response that looks like an answer and is not.
 * - **A collection filter is repeated once per value** (`itemIds=1&itemIds=2`). `itemIds=1,2` is
 *   a 422, and `itemIds[]=1` is a 200 that is **ignored** — the whole sub type, dressed as a
 *   filtered answer. That is the failure that never shows, so a listing of another item in the
 *   answer is a failure here, not a row to skip.
 * - **`totalCount` is always 0**, so a scan ends on the first short or empty page.
 * - **Pages are ordered by `cp_desc`.** The service has no stable secondary key, and an order
 *   with many ties (`price`) shuffles them between requests: pages overlap and listings are
 *   missed. Combat point is almost always distinct. Even so a few listings repeat across pages
 *   (84 of 4,646 on the commonest weapon), so the scan de-duplicates by `productId`.
 * - **Level and skill are not filters.** `stat` does nothing at all. What the screen needs is
 *   decided on what comes back, which is why a scan is of the *item*, complete.
 * - A page of 1,000 is the size that works; 5,000 takes minutes and times out.
 */

import { z } from 'zod';

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
import type { NetworkError } from './errors';
import { HttpClient } from './httpClient';

/** The per-planet market service. Thor is not in the registry, so it has none. */
export const MARKET_SERVICE_ENDPOINTS: Partial<Record<Planet, string>> = {
  odin: 'https://b.9capi.com/marketProviderOdin',
  heimdall: 'https://b.9capi.com/marketProviderHeimdall',
};

export const PAGE_SIZE = 1000;
const ORDER = 'cp_desc';
const USER_AGENT = 'NC-Arena/1.0 (+https://github.com/Xyrerris/NC-Arena)';

/** Three pages in a row of listings already seen mean the scan is no longer moving forward. */
const MAX_STALE_PAGES = 3;
const MAX_ATTEMPTS = 3;

export interface MarketServiceOptions {
  /** A courtesy pause between pages of one scan: this is a public service. */
  readonly pageDelayMs?: number;
  /** Most pages one scan reads before it gives up. A bound on a runaway, not on the data. */
  readonly maxPages?: number;
  /** Waits before the n-th retry (1 for the first). Injected so a test does not wait. */
  readonly retryDelayMs?: (retry: number) => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * The URL of one page. Pure, and where the shape that matters is pinned by a test: the item id
 * is a query parameter and the sub type is the path.
 */
export function marketItemsUrl(
  baseUrl: string,
  itemSubType: number,
  itemId: number,
  offset: number,
): string {
  if (!Number.isSafeInteger(itemSubType) || itemSubType <= 0) {
    throw new Error(`Not an item sub type: ${itemSubType}`);
  }
  // An empty or malformed id would not be "no filter" to the service: it would be the whole sub
  // type, which is exactly the question a scan of one item must never ask by accident.
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    throw new Error(`Not an item id: ${itemId}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`Not an offset: ${offset}`);
  }
  return (
    `${baseUrl.replace(/\/+$/, '')}/Market/products/items/${itemSubType}` +
    `?limit=${PAGE_SIZE}&offset=${offset}&order=${ORDER}&itemIds=${itemId}`
  );
}

const listingSchema = z.object({
  productId: z.string().min(1),
  itemId: z.number().int().safe(),
  itemSubType: z.number().int().safe(),
  level: z.number().int().safe(),
  grade: z.number().int().safe(),
  elementalType: z.number().int().safe(),
  combatPoint: z.number().int().safe(),
  price: z.number().finite().nonnegative(),
  quantity: z.number().int().positive().safe(),
  unitPrice: z.number().finite().nonnegative(),
  sellerAvatarAddress: z.string(),
  registeredBlockIndex: z.number().int().safe(),
  // Ordinary and buff skills together; only whether there are any is read.
  skillModels: z.array(z.unknown()),
});

const pageSchema = z.object({ itemProducts: z.array(listingSchema) });

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * The HTTP status behind a failed response, when `HttpClient` kept it. It does not keep a field
 * for it: a body that is not the backend's error envelope — which every failure of this service
 * is — becomes `MALFORMED_RESPONSE` with the status in its message (`HTTP 503`).
 */
const statusOf = (error: NetworkError): number | null => {
  const match = /^HTTP (\d{3})/.exec(error.message);
  return match === null ? null : Number(match[1]);
};

/** What a second attempt could change: the service is overloaded, or says so (5xx, 429). */
const isTransient = (error: NetworkError): boolean => {
  const status = statusOf(error);
  return status !== null && (status >= 500 || status === 429);
};

export class MarketServiceSource implements MarketSource {
  readonly name = 'market-service';

  private readonly pageDelayMs: number;
  private readonly maxPages: number;
  private readonly retryDelayMs: (retry: number) => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(
    private readonly endpoints: Partial<Record<Planet, string>> = MARKET_SERVICE_ENDPOINTS,
    options: MarketServiceOptions = {},
  ) {
    this.pageDelayMs = options.pageDelayMs ?? 250;
    this.maxPages = options.maxPages ?? 100;
    this.retryDelayMs = options.retryDelayMs ?? ((retry) => 1000 * 2 ** retry);
    this.sleep = options.sleep ?? defaultSleep;
  }

  async scanItem(
    planet: Planet,
    itemSubType: number,
    itemId: number,
    options: ScanOptions = {},
  ): Promise<Result<readonly MarketListing[], MarketError>> {
    const base = this.endpoints[planet];
    if (base === undefined) return err(this.failed(`it does not serve ${planet}.`));

    const seen = new Map<string, MarketListing>();
    let offset = 0;
    let stalePages = 0;

    for (let page = 0; page < this.maxPages; page += 1) {
      if (options.signal?.aborted) return err(this.cancelled());

      let url: string;
      try {
        url = marketItemsUrl(base, itemSubType, itemId, offset);
      } catch (cause) {
        return err(this.failed(cause instanceof Error ? cause.message : 'bad request.'));
      }

      const read = await this.readPage(url, options.signal);
      if (!read.ok) return read;
      const rows = read.value;
      if (rows.length === 0) return ok([...seen.values()]);

      // A listing of some other item means the filter was not applied: the service answered the
      // whole sub type. Nothing in such an answer can be trusted to be complete or to be ours.
      if (rows.some((row) => row.itemId !== itemId)) {
        return err(this.failed('the service ignored the item filter.'));
      }

      let added = 0;
      for (const row of rows) {
        if (!seen.has(row.productId)) {
          seen.set(row.productId, row);
          added += 1;
        }
      }
      stalePages = added === 0 ? stalePages + 1 : 0;
      offset += rows.length;
      options.onProgress?.(seen.size);

      if (rows.length < PAGE_SIZE || stalePages >= MAX_STALE_PAGES) return ok([...seen.values()]);

      await this.sleep(this.pageDelayMs, options.signal);
    }

    // Out of pages with the service still handing out full ones. Not a list to show as complete.
    return err(this.failed(`it still had listings after ${this.maxPages} pages.`));
  }

  private async readPage(
    url: string,
    signal?: AbortSignal,
  ): Promise<Result<readonly MarketListing[], MarketError>> {
    for (let attempt = 1; ; attempt += 1) {
      const response = await new HttpClient(url, null).request<unknown>('', {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (response.ok) {
        const parsed = pageSchema.safeParse(response.value);
        if (!parsed.success) {
          return err(this.failed('the answer did not match the expected shape.'));
        }
        return ok(
          parsed.data.itemProducts.map((row) => ({
            productId: row.productId,
            itemId: row.itemId,
            itemSubType: row.itemSubType,
            level: row.level,
            grade: row.grade,
            elementalType: row.elementalType,
            combatPoint: row.combatPoint,
            price: row.price,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            hasSkill: row.skillModels.length > 0,
            sellerAvatarAddress: row.sellerAvatarAddress,
            registeredBlockIndex: row.registeredBlockIndex,
          })),
        );
      }

      // Only an overloaded service is retried. A definitive answer (404, 422) would be the same
      // again, and an unreachable one is left to the person's retry rather than made to wait.
      if (!isTransient(response.error) || attempt >= MAX_ATTEMPTS) {
        return err(this.networkFailure(response.error));
      }
      if (signal?.aborted) return err(this.cancelled());
      await this.sleep(this.retryDelayMs(attempt), signal);
      if (signal?.aborted) return err(this.cancelled());
    }
  }

  private failed(message: string): MarketError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }

  private cancelled(): MarketError {
    return { reason: 'CANCELLED', message: `${this.name}: the scan was stopped.` };
  }

  private networkFailure(error: NetworkError): MarketError {
    return {
      reason: error.code === 'OFFLINE' ? 'OFFLINE' : 'FAILED',
      message: `${this.name}: ${error.code} — ${error.message}`,
    };
  }
}
