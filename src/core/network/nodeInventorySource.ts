/**
 * `InventorySource` over a plain node: `stateQuery { avatar(avatarAddress) { inventory } }`
 * (docs/AVATAR_INVENTORY.md, option 1).
 *
 * Observed on Heimdall 2026-10-18 for a real avatar: 2295 equipment pieces, and `items` listing
 * every stack with its count and `itemType` (`EQUIPMENT`, `COSTUME`, `MATERIAL`, `CONSUMABLE`).
 * Equipment is read from `equipments` because only there are the level, the skills and the
 * stored experience (a JSON number, 566 G for a +13 belt, so well inside 2^53); everything
 * else comes from `items`, whose `EQUIPMENT` entries are skipped so a piece is never counted twice.
 * The answer is about 300 kB for an avatar with a full bag.
 *
 * An address with no avatar answers `avatar: null`, which is `ok(null)`. A response that does not
 * match the shape is a failure, never a smaller bag.
 */

import { z } from 'zod';

import {
  err,
  ok,
  type AvatarInventory,
  type InventoryError,
  type InventorySource,
  type Result,
} from '../common';
import { normaliseAvatarAddress, type ViewerAvatar } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import { NODE_ENDPOINTS, type NodeEndpoints } from './nodeCollectionSource';

const idSchema = z.number().int().safe();

const dataSchema = z.object({
  stateQuery: z.object({
    avatar: z
      .object({
        inventory: z.object({
          equipments: z.array(
            z.object({
              id: idSchema,
              level: z.number().int().safe(),
              exp: z.number().int().safe(),
              itemId: z.string(),
              equipped: z.boolean(),
              skills: z.array(z.object({ id: idSchema })),
              buffSkills: z.array(z.object({ id: idSchema })),
            }),
          ),
          items: z.array(
            z.object({ id: idSchema, count: z.number().int().safe(), itemType: z.string() }),
          ),
        }),
      })
      .nullable(),
  }),
});

export class NodeInventorySource implements InventorySource {
  readonly name = 'node';

  constructor(
    private readonly endpoints: NodeEndpoints = NODE_ENDPOINTS,
    private readonly now: () => number = Date.now,
  ) {}

  async readInventory(
    avatar: ViewerAvatar,
  ): Promise<Result<AvatarInventory | null, InventoryError>> {
    const endpoint = this.endpoints[avatar.planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${avatar.planet}.`));

    // Interpolated into the query text, so it is re-checked: only `0x` and 40 hex digits gets in.
    const address = normaliseAvatarAddress(avatar.address);
    if (address === null) return err(this.failed('the avatar address is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ stateQuery { avatar(avatarAddress: "${address}") { inventory { ` +
        'equipments { id level exp itemId equipped skills { id } buffSkills { id } } ' +
        'items { id count itemType } } } } }',
    );
    if (!response.ok) return err(networkFailure(this.name, response.error));

    const parsed = dataSchema.safeParse(response.value.data);
    if (!parsed.success) {
      return err(
        this.failed(
          response.value.errors[0]?.message ?? 'the answer did not match the expected shape.',
        ),
      );
    }

    const owner = parsed.data.stateQuery.avatar;
    if (owner === null) return ok(null);

    const stackable = new Map<number, number>();
    for (const { id, count, itemType } of owner.inventory.items) {
      if (itemType === 'EQUIPMENT') continue;
      stackable.set(id, (stackable.get(id) ?? 0) + count);
    }
    return ok({
      equipment: owner.inventory.equipments.map((piece) => ({
        itemId: piece.id,
        level: piece.level,
        hasSkill: piece.skills.length > 0 || piece.buffSkills.length > 0,
        exp: piece.exp,
        tradableId: piece.itemId,
        equipped: piece.equipped,
      })),
      stackable,
      source: this.name,
      readAt: this.now(),
    });
  }

  private failed(message: string): InventoryError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
