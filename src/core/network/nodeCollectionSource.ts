/**
 * `CollectionSource` over a plain Nine Chronicles node (ADR-0044): the root `state(address,
 * accountAddress)` query returns the raw Bencodex state as hex, and `parseUnlockedCollectionIds`
 * turns it into ids.
 *
 * Slower to use than Mimir — there is a decoder in the way — and never behind: it reads the
 * chain's own state, so it is what a stale Mimir answer is checked against. `blockIndex` is
 * `null`, because the tip is a second query this one does not need.
 *
 * `0x…1f` is the account the collection state lives under (observed 2026-10-01). An address with
 * no state answers `state: null`, which is `ok(null)`; a state the decoder refuses is a failure,
 * because the alternative — the ids that happened to parse — is a quietly wrong list.
 */

import {
  err,
  ok,
  type CollectionError,
  type CollectionSource,
  type Result,
  type UnlockedCollections,
} from '../common';
import { parseUnlockedCollectionIds } from '../collection';
import { normaliseAvatarAddress, type ViewerAvatar } from '../model';
import { postGraphql, type GraphqlEndpoints } from './chainGraphql';
import type { NetworkError } from './errors';

/** The collection account. */
const COLLECTION_ACCOUNT = '0x000000000000000000000000000000000000001f';

/** A planet's node, or its nodes in the order to try them (`postGraphql` falls over on transport failures). */
export type NodeEndpoints = GraphqlEndpoints;

/**
 * Public nodes per planet, in the order of the planet registry's `headless.gql`
 * (https://planets.nine-chronicles.com/planets/, read 2026-10-21 — the same list the official
 * client's node selector works from). The old Heimdall `heimdall-rpc-1` is gone from it: it timed
 * out and answered 502 while `heimdall6.9capi.com` answered in under half a second.
 *
 * Thor is absent on purpose: the registry gives it no node this app has verified, and a URL
 * guessed by analogy is not one to ship. Add it when it is verified.
 */
export const NODE_ENDPOINTS: NodeEndpoints = {
  odin: [
    'https://odin-rpc-1.nine-chronicles.com/graphql',
    'https://odin5.9capi.com/graphql',
    'https://odin6.9capi.com/graphql',
  ],
  heimdall: ['https://heimdall6.9capi.com/graphql'],
};

export class NodeCollectionSource implements CollectionSource {
  readonly name = 'node';

  constructor(private readonly endpoints: NodeEndpoints = NODE_ENDPOINTS) {}

  async readUnlocked(
    avatar: ViewerAvatar,
  ): Promise<Result<UnlockedCollections | null, CollectionError>> {
    const endpoint = this.endpoints[avatar.planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${avatar.planet}.`));

    const address = normaliseAvatarAddress(avatar.address);
    if (address === null) return err(this.failed('the avatar address is malformed.'));

    const response = await postGraphql(
      endpoint,
      `{ state(address: "${address}", accountAddress: "${COLLECTION_ACCOUNT}") }`,
    );
    if (!response.ok) return err(this.networkFailure(response.error));

    const { data, errors } = response.value;
    if (errors.length > 0) {
      return err(this.failed(errors[0]?.message ?? 'the node reported an error.'));
    }

    const state = (data as { state?: unknown } | null)?.state;
    if (state === null) return ok(null);
    if (typeof state !== 'string') return err(this.failed('the answer held no state field.'));

    try {
      return ok({ ids: parseUnlockedCollectionIds(state), source: this.name, blockIndex: null });
    } catch (cause) {
      return err(
        this.failed(cause instanceof Error ? cause.message : 'the state could not be decoded.'),
      );
    }
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
