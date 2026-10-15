/**
 * Several `AvatarSource`s read in order, the first avatar found winning (ADR-0044: Mimir first,
 * the node behind it). The rule is `firstUseful`'s — a failure falls through, and so does "no
 * avatar", because a brand-new avatar may exist on the chain before Mimir has indexed it.
 */

import type { AvatarError, AvatarIdentity, AvatarSource, Result } from '../common';
import type { ViewerAvatar } from '../model';
import { firstUseful } from './firstUseful';

export class FallbackAvatarSource implements AvatarSource {
  readonly name: string;

  constructor(private readonly sources: readonly AvatarSource[]) {
    this.name = sources.map((s) => s.name).join(' → ');
  }

  readAvatar(avatar: ViewerAvatar): Promise<Result<AvatarIdentity | null, AvatarError>> {
    return firstUseful(this.sources, (source) => source.readAvatar(avatar));
  }
}
