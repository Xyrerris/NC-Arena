/**
 * `AvatarSource` over Mimir: `avatar(address) { name level agentAddress }` (ADR-0044).
 *
 * Observed 2026-10-01: an address with no avatar answers HTTP 200 with a "Document not found"
 * error on `path: ["avatar"]`, the same shape as a missing collection. The planet matters — the
 * same address is "not found" on the planet it does not belong to, which is exactly the mistake
 * the confirmation is there to catch.
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
import { MIMIR_ENDPOINTS } from './mimirCollectionSource';

const dataSchema = z.object({
  avatar: z
    .object({ name: z.string(), level: z.number().int().safe(), agentAddress: z.string() })
    .nullish(),
});

export class MimirAvatarSource implements AvatarSource {
  readonly name = 'mimir';

  constructor(private readonly endpoints: Partial<Record<Planet, string>> = MIMIR_ENDPOINTS) {}

  async readAvatar(avatar: ViewerAvatar): Promise<Result<AvatarIdentity | null, AvatarError>> {
    const endpoint = this.endpoints[avatar.planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${avatar.planet}.`));

    // Interpolated into the query text, so re-checked rather than trusted.
    const address = normaliseAvatarAddress(avatar.address);
    if (address === null) return err(this.failed('the avatar address is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ avatar(address: "${address}") { name level agentAddress } }`,
    );
    if (!response.ok) return err(networkFailure(this.name, response.error));

    const { data, errors } = response.value;
    const parsed = dataSchema.safeParse(data ?? {});
    if (!parsed.success) return err(this.failed('the answer did not match the expected shape.'));

    if (parsed.data.avatar) return ok(parsed.data.avatar);

    const onlyMissingDocument =
      errors.length > 0 &&
      errors.every((e) => e.path?.[0] === 'avatar' && e.message.startsWith('Document not found'));
    if (onlyMissingDocument) return ok(null);

    return err(this.failed(errors[0]?.message ?? 'the answer held no avatar and no error.'));
  }

  private failed(message: string): AvatarError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
