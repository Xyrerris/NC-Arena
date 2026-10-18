/**
 * The port behind "what does this avatar own" — the inventory, read so the collection screen can
 * say which pieces a collection asks for are already in the bag (docs/AVATAR_INVENTORY.md).
 *
 * It sits beside `CollectionSource` for the same reason: `core/network` implements it and §4
 * forbids `core/network` from importing `core/data`.
 *
 * **A read is complete or it is not a read**, as for collections. A partial list would show as
 * "still to buy" a piece the avatar already holds, and nothing on the screen could tell.
 */

import type { ViewerAvatar } from '../model';
import type { Result } from './result';

/** One piece of equipment in the bag. The fields are exactly what a collection requirement tests. */
export interface OwnedEquipment {
  readonly itemId: number;
  readonly level: number;
  /** An ordinary or a buff skill is present (lib9c: `Skills.Any() || BuffSkills.Any()`). */
  readonly hasSkill: boolean;
}

/** What a complete read returned. */
export interface AvatarInventory {
  readonly equipment: readonly OwnedEquipment[];
  /** Costumes, materials and consumables: item id to how many are held. Equipment is not here. */
  readonly stackable: ReadonlyMap<number, number>;
  readonly source: string;
  readonly readAt: number;
}

/** Two reasons, like `CollectionFailure`: the screen has two remedies and no more. */
export type InventoryFailure = 'OFFLINE' | 'FAILED';

export interface InventoryError {
  readonly reason: InventoryFailure;
  readonly message: string;
}

export interface InventorySource {
  readonly name: string;
  /**
   * The avatar's inventory, or `ok(null)` when the chain has no avatar at this address — which
   * is neither an empty bag nor a failure, and is what a mistyped address looks like.
   */
  readInventory(avatar: ViewerAvatar): Promise<Result<AvatarInventory | null, InventoryError>>;
}
