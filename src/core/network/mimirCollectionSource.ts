/**
 * `CollectionSource` over Mimir, Planetarium's indexer (ADR-0044): `collection(address) { ids }`
 * answers the unlocked ids as JSON, with no Bencodex to decode.
 *
 * It is the first choice because it is the cheaper read, and not the last word because it can lag
 * the chain. `blockIndex` carries `metadata(collectionName: "collection") { latestBlockIndex }`
 * from the same request, so a screen can say how far behind the answer was.
 *
 * **"No collections" is an error response here, not `data: null`.** Observed on 2026-10-01: an
 * address Mimir has no document for answers HTTP 200 with `errors[0].message` starting "Document
 * not found" and `path: ["collection"]`. That is the one error that means "nothing there" rather
 * than "something broke", and it is matched on the path as well as the text so another resolver's
 * failure is not read as an empty answer.
 */

import { z } from 'zod';

import {
  err,
  ok,
  type CollectionError,
  type CollectionSource,
  type Result,
  type UnlockedCollections,
} from '../common';
import { normaliseAvatarAddress, type Planet, type ViewerAvatar } from '../model';
import { postGraphql } from './chainGraphql';
import type { NetworkError } from './errors';

/** Mimir's per-planet GraphQL endpoints. Thor has none: `/thor/graphql/` answers 404. */
export const MIMIR_ENDPOINTS: Partial<Record<Planet, string>> = {
  odin: 'https://mimir.nine-chronicles.dev/odin/graphql/',
  heimdall: 'https://mimir.nine-chronicles.dev/heimdall/graphql/',
};

const dataSchema = z.object({
  collection: z.object({ ids: z.array(z.number().int().safe()) }).nullish(),
  metadata: z.object({ latestBlockIndex: z.number().int().safe() }).nullish(),
});

export class MimirCollectionSource implements CollectionSource {
  readonly name = 'mimir';

  constructor(private readonly endpoints: Partial<Record<Planet, string>> = MIMIR_ENDPOINTS) {}

  async readUnlocked(
    avatar: ViewerAvatar,
  ): Promise<Result<UnlockedCollections | null, CollectionError>> {
    const endpoint = this.endpoints[avatar.planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${avatar.planet}.`));

    // The address is interpolated into the query text, so it is re-checked here rather than
    // trusted to have been normalised upstream: only `0x` and 40 hex digits ever gets through.
    const address = normaliseAvatarAddress(avatar.address);
    if (address === null) return err(this.failed('the avatar address is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ collection(address: "${address}") { ids } ` +
        `metadata(collectionName: "collection") { latestBlockIndex } }`,
    );
    if (!response.ok) return err(this.networkFailure(response.error));

    const { data, errors } = response.value;
    const parsed = dataSchema.safeParse(data ?? {});
    if (!parsed.success) return err(this.failed('the answer did not match the expected shape.'));

    const { collection, metadata } = parsed.data;
    if (collection) {
      return ok({
        ids: new Set(collection.ids),
        source: this.name,
        blockIndex: metadata?.latestBlockIndex ?? null,
      });
    }

    // No ids. That is "nothing there" only if the single thing wrong is the missing document;
    // any other error, or no error and no data, is a read that did not happen.
    const onlyMissingDocument =
      errors.length > 0 &&
      errors.every(
        (e) => e.path?.[0] === 'collection' && e.message.startsWith('Document not found'),
      );
    if (onlyMissingDocument) return ok(null);

    return err(this.failed(errors[0]?.message ?? 'the answer held no collection and no error.'));
  }

  private failed(message: string): CollectionError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }

  private networkFailure(error: NetworkError): CollectionError {
    return {
      reason: error.code === 'OFFLINE' ? 'OFFLINE' : 'FAILED',
      message: `${this.name}: ${error.code} — ${error.message}`,
    };
  }
}
