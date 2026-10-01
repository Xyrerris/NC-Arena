/**
 * Several `CollectionSource`s read in order, the first useful answer winning (ADR-0044: Mimir
 * first, the node behind it).
 *
 * "Useful" is a read with ids. A **failure falls through**, and so does `ok(null)` — Mimir can
 * lag the chain, so "no state" from it may only mean the avatar is newer than its index, and the
 * node is the one that can say otherwise.
 *
 * The ending is deliberately conservative. `ok(null)` comes out only when **every** source
 * answered it. If one answered null and another failed, the result is that failure: "no
 * collections" would be a claim resting on a source that could not be checked against the other.
 */

import {
  err,
  ok,
  type CollectionError,
  type CollectionSource,
  type Result,
  type UnlockedCollections,
} from '../common';
import type { ViewerAvatar } from '../model';

export class FallbackCollectionSource implements CollectionSource {
  readonly name: string;

  constructor(private readonly sources: readonly CollectionSource[]) {
    this.name = sources.map((s) => s.name).join(' → ');
  }

  async readUnlocked(
    avatar: ViewerAvatar,
  ): Promise<Result<UnlockedCollections | null, CollectionError>> {
    let failure: CollectionError | undefined;
    for (const source of this.sources) {
      const read = await source.readUnlocked(avatar);
      if (read.ok && read.value !== null) return read;
      if (!read.ok) failure = read.error;
    }
    return failure === undefined ? ok(null) : err(failure);
  }
}
