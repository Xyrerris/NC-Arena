/**
 * Several `CollectionSource`s read in order, the first useful answer winning (ADR-0044: Mimir
 * first, the node behind it). The rule — a failure falls through, so does "no state", and "no
 * state" comes out only when every source said it — is `firstUseful`'s.
 */

import type { CollectionError, CollectionSource, Result, UnlockedCollections } from '../common';
import type { ViewerAvatar } from '../model';
import { firstUseful } from './firstUseful';

export class FallbackCollectionSource implements CollectionSource {
  readonly name: string;

  constructor(private readonly sources: readonly CollectionSource[]) {
    this.name = sources.map((s) => s.name).join(' → ');
  }

  readUnlocked(avatar: ViewerAvatar): Promise<Result<UnlockedCollections | null, CollectionError>> {
    return firstUseful(this.sources, (source) => source.readUnlocked(avatar));
  }
}
