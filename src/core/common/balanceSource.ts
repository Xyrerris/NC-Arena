/**
 * The port behind "how much NCG does this account hold" (ADR-0044, "Next: buying", step A).
 *
 * The confirmation card of a purchase shows the balance next to the price, so the person sees what
 * the buy would leave. Same placement as `AvatarSource`: `core/network` implements it and
 * `core/data` carries it. Only NCG: the other currencies of the chain are not what the market asks.
 *
 * The balance is **information, not authority** — the chain checks it again when a purchase is
 * sent, and a card that shows a stale or missing one must still be honest about it, which is why a
 * read that failed is a failure here and never a zero.
 */

import type { Planet } from '../model';
import type { CollectionFailure } from './collectionSource';
import type { Result } from './result';

export interface BalanceError {
  readonly reason: CollectionFailure;
  readonly message: string;
}

export interface BalanceSource {
  readonly name: string;
  /** NCG held by `agentAddress` (the account, not the avatar) on `planet`. */
  readNcg(planet: Planet, agentAddress: string): Promise<Result<number, BalanceError>>;
}
