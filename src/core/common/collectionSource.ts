/**
 * The port behind "which collections has this avatar unlocked" (ADR-0044, decision 4).
 *
 * It sits beside `AccountGateway` and `RosterSource` for the same reason they do: `core/network`
 * implements it, §4 forbids `core/network` from importing `core/data`, so the contract has to
 * live where both can see it. It is also what lets the collection screen be driven in a test
 * with no chain.
 *
 * **A read is complete or it is not a read.** Success carries every id the chain reported, and
 * anything short of that — a timeout, a response that does not match the shape, a state the
 * decoder will not vouch for — is a failure, never a smaller set. A partial list would show
 * collections as missing that the avatar owns, and nothing on the screen could tell.
 */

import type { ViewerAvatar } from '../model';
import type { Result } from './result';

/**
 * What a complete read returned.
 *
 * `ids` is every unlocked collection id. `source` names what answered, so a screen that shows
 * "updated N ago" can also say from where. `blockIndex` is how far that source had indexed when
 * it answered, or `null` when it cannot say cheaply — Mimir can lag the chain and the node
 * cannot, which is why the two are both kept (ADR-0044).
 */
export interface UnlockedCollections {
  readonly ids: ReadonlySet<number>;
  readonly source: string;
  readonly blockIndex: number | null;
}

/**
 * Why a read failed. Two cases rather than more, for the reason `AccountFailure` gives: the
 * screen has two remedies, "try again when you are online" and "try again later", and a third
 * code with no remedy of its own is a distinction the user cannot act on.
 */
export type CollectionFailure =
  /** The source was never reached, or did not answer in time. Worth retrying unchanged. */
  | 'OFFLINE'
  /** Anything else — an error from the source, a malformed answer, a planet it does not serve. */
  | 'FAILED';

export interface CollectionError {
  readonly reason: CollectionFailure;
  readonly message: string;
}

export interface CollectionSource {
  /** Identifies the source in the failure surfaced to the user, like `RosterSource.name`. */
  readonly name: string;
  /**
   * The collections this avatar has unlocked.
   *
   * `ok(null)` means the chain **has no collection state for this address** — an avatar that
   * never unlocked one, or an address that is not an avatar at all. It is neither an empty set
   * nor a failure: the caller decides what it means, and confirming the address (ADR-0044,
   * "Not built yet" 2) is what separates the two.
   */
  readUnlocked(avatar: ViewerAvatar): Promise<Result<UnlockedCollections | null, CollectionError>>;
}
