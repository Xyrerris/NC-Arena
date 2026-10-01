/**
 * `AvatarSource` over a plain node: `stateQuery { avatar(avatarAddress) { name level agentAddress } }`
 * (ADR-0044).
 *
 * **A missing avatar is `avatar: null` plus an error per selected field.** Observed 2026-10-01:
 * the data holds `stateQuery.avatar = null` and `errors` lists "Error trying to resolve field
 * 'name'" (NULL_REFERENCE) on `["stateQuery", "avatar", "name"]`, one per field asked for.
 * That is the node's way of saying "nothing there", so it is read as `ok(null)` — but only when
 * every error sits under that path. An error anywhere else is a node having a bad day, and
 * calling it "no such avatar" would tell the user their correct address is wrong.
 */

import { z } from 'zod';

import {
  err,
  ok,
  type AvatarError,
  type AvatarIdentity,
  type AvatarSource,
  type Result,
} from '../common';
import { normaliseAvatarAddress, type Planet, type ViewerAvatar } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import { NODE_ENDPOINTS } from './nodeCollectionSource';

const dataSchema = z.object({
  stateQuery: z.object({
    avatar: z
      .object({ name: z.string(), level: z.number().int().safe(), agentAddress: z.string() })
      .nullable(),
  }),
});

export class NodeAvatarSource implements AvatarSource {
  readonly name = 'node';

  constructor(private readonly endpoints: Partial<Record<Planet, string>> = NODE_ENDPOINTS) {}

  async readAvatar(avatar: ViewerAvatar): Promise<Result<AvatarIdentity | null, AvatarError>> {
    const endpoint = this.endpoints[avatar.planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${avatar.planet}.`));

    const address = normaliseAvatarAddress(avatar.address);
    if (address === null) return err(this.failed('the avatar address is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ stateQuery { avatar(avatarAddress: "${address}") { name level agentAddress } } }`,
    );
    if (!response.ok) return err(networkFailure(this.name, response.error));

    const { data, errors } = response.value;
    const parsed = dataSchema.safeParse(data);
    if (!parsed.success) {
      return err(this.failed(errors[0]?.message ?? 'the answer did not match the expected shape.'));
    }

    const found = parsed.data.stateQuery.avatar;
    if (found !== null) return ok(found);

    const underAvatar = errors.every((e) => e.path?.[0] === 'stateQuery' && e.path[1] === 'avatar');
    return underAvatar ? ok(null) : err(this.failed(errors[0]?.message ?? 'the node failed.'));
  }

  private failed(message: string): AvatarError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
