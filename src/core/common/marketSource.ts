/**
 * The port behind "what is on sale of this item right now" (ADR-0044, "Next: buying").
 *
 * Like `CollectionSource` and `SheetSource`, `core/network` implements it and `core/data` will
 * consume it, so the contract lives here. It is asked about **one item at a time**, because that
 * is the only question the market service can answer cheaply: it narrows by item id and by
 * nothing else that matters here — level and skill are decided on what comes back.
 *
 * **A scan is complete or it is not a scan.** Success carries every listing of the item the
 * service had when the last page was read, and anything short of that — an unreachable service,
 * a page that will not parse, a scan stopped by the caller — is a failure, never a shorter list.
 * A partial list would show the cheapest piece as dearer than it is and nothing on screen could
 * tell, which is the failure `CollectionSource` is built around too.
 */

import type { Planet } from '../model';
import type { Result } from './result';

/**
 * One piece on sale. Only what a list of offers needs, plus the four fields a purchase will need
 * to find the same listing again (`productId`, `itemSubType`, `itemId`, and the seller): the
 * service has no lookup by product, so a buyer re-reads the item and picks the product out.
 */
export interface MarketListing {
  /** The listing's id. Stable for the life of the offer; a price change is a new product. */
  readonly productId: string;
  readonly itemId: number;
  /** lib9c's `ItemSubType` number — also the route the listing was read from. */
  readonly itemSubType: number;
  readonly level: number;
  readonly grade: number;
  /** lib9c's `ElementalType`: 0 Normal, 1 Fire, 2 Water, 3 Land, 4 Wind. */
  readonly elementalType: number;
  readonly combatPoint: number;
  /** In NCG. Equipment is sold singly, so this is also the unit price. */
  readonly price: number;
  /**
   * The piece carries at least one skill, ordinary or buff — the market service lists them
   * together — which is exactly what lib9c's `SkillContains` asks about.
   */
  readonly hasSkill: boolean;
  readonly sellerAvatarAddress: string;
  readonly registeredBlockIndex: number;
}

/** Three reasons: the user has two remedies, and a scan they stopped is not a failure to report. */
export type MarketFailure =
  /** The service was never reached or did not answer in time. Worth retrying unchanged. */
  | 'OFFLINE'
  /** Anything else: an error from the service, an answer that does not match, a planet it lacks. */
  | 'FAILED'
  /** The caller aborted the scan. Nothing went wrong, and nothing is to be shown. */
  | 'CANCELLED';

export interface MarketError {
  readonly reason: MarketFailure;
  readonly message: string;
}

export interface ScanOptions {
  /**
   * Called after every page with how many distinct listings have been read so far. The service
   * does not say how many there are (`totalCount` is always 0), so this is a count and never a
   * fraction: the screen shows "2,000 read", not a bar that would have to lie.
   */
  readonly onProgress?: (scanned: number) => void;
  /** Aborting stops the scan before the next page and answers `CANCELLED`. */
  readonly signal?: AbortSignal;
}

export interface MarketSource {
  /** Identifies the source in a failure shown to the user, like `CollectionSource.name`. */
  readonly name: string;
  /**
   * Every listing of `itemId` on `planet`'s market, read from the route of `itemSubType`. An
   * empty list is a real answer — nothing is on sale — and not a failure.
   */
  scanItem(
    planet: Planet,
    itemSubType: number,
    itemId: number,
    options?: ScanOptions,
  ): Promise<Result<readonly MarketListing[], MarketError>>;
}
