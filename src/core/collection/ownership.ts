/**
 * Which pieces a collection asks for the avatar already holds (docs/AVATAR_INVENTORY.md).
 *
 * A piece of equipment counts when it is the rule `marketMatch.listingMatches` applies to a
 * listing, which is lib9c's `CollectionSheet.Requirement.Validate`: same item id, same level, and
 * a skill present exactly when the requirement says so. Anything else — a costume, a material, a
 * consumable — is a stack, and has only an id: its level and skill flag mean nothing.
 *
 * An item id is either equipment or a stack, never both, so the two counts are simply added. A
 * requirement is met when the avatar holds at least the `count` it asks for.
 */

import type { AvatarInventory } from '../common';
import type { Collection, CollectionRequirement } from './collectionSheet';

type Holdings = Pick<AvatarInventory, 'equipment' | 'stackable'>;

/** How many of the piece the avatar holds: 0 means it still has to be found. */
export const ownedCount = (requirement: CollectionRequirement, inventory: Holdings): number =>
  (inventory.stackable.get(requirement.itemId) ?? 0) +
  inventory.equipment.filter(
    (piece) =>
      piece.itemId === requirement.itemId &&
      piece.level === requirement.level &&
      piece.hasSkill === requirement.skillContains,
  ).length;

export interface OwnedPieces {
  /** One entry per requirement, in the sheet's order: how many of that piece are held. */
  readonly counts: readonly number[];
  /** Requirements the avatar already meets (holds at least the `count` asked for). */
  readonly have: number;
  readonly total: number;
}

export const ownedPieces = (collection: Collection, inventory: Holdings): OwnedPieces => {
  const counts = collection.requirements.map((requirement) => ownedCount(requirement, inventory));
  return {
    counts,
    have: collection.requirements.filter(
      (requirement, index) => (counts[index] ?? 0) >= Math.max(1, requirement.count),
    ).length,
    total: counts.length,
  };
};
