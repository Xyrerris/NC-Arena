/**
 * The port behind "who is at this avatar address" (ADR-0044, "Not built yet" 2).
 *
 * There is no way to find an address from a name (ADR-0044), so the user types one in. The shape
 * check catches a mangled paste; it cannot catch the wrong planet, a neighbour's address or one
 * digit changed into another valid one. Reading the avatar's name back and showing it for the
 * user to confirm can — and it costs one request, once, when the address is saved.
 *
 * Same placement and the same reasoning as `CollectionSource`: `core/network` implements it,
 * and §4 means the contract has to sit where both it and `core/data` can see it.
 */

import type { ViewerAvatar } from '../model';
import type { CollectionFailure } from './collectionSource';
import type { Result } from './result';

/** What the chain says about an avatar — enough to recognise your own. */
export interface AvatarIdentity {
  readonly name: string;
  readonly level: number;
  /** The account the avatar belongs to, as the chain spells it. */
  readonly agentAddress: string;
}

/** The same two remedies a collection read has, so the same two reasons. */
export interface AvatarError {
  readonly reason: CollectionFailure;
  readonly message: string;
}

export interface AvatarSource {
  /** Identifies the source in the failure surfaced to the user, like `RosterSource.name`. */
  readonly name: string;
  /**
   * The avatar at this address on this planet.
   *
   * `ok(null)` means the chain has **no avatar there**: a mistyped address, or the wrong planet.
   * It is the answer the confirmation exists to produce, so it is not a failure — a failure is a
   * read that did not happen, and the screen says something different for it.
   */
  readAvatar(avatar: ViewerAvatar): Promise<Result<AvatarIdentity | null, AvatarError>>;
}
