/**
 * Who "you" are, as a subscription (ADR-0022).
 *
 * Every observer on the repository resolves the viewer at call time, which makes the id
 * part of each subscription's identity rather than an input to it. Reading it with a plain
 * `repository.getViewerId()` during render was correct while a sync was the only thing that
 * could change it — a sync also rewrites the whole ladder, so something always re-rendered.
 * Now the user can change it from a screen pushed *over* the roster, and the roster below
 * has nothing to re-render for.
 *
 * `useSyncExternalStore` rather than a context value, because the source of truth is MMKV
 * and not React state: a context would be a second copy of the id, and the two would
 * disagree the first time a sync moved one of them.
 */

import { useSyncExternalStore } from 'react';

import type { PlayerId } from '../model';
import { useArenaData } from './arenaContext';

export const useViewerId = (): PlayerId | null => {
  const { repository } = useArenaData();

  // Both are stable for the life of the repository, and `getViewerId` returns a primitive,
  // so there is no cached-snapshot trap here.
  return useSyncExternalStore(repository.subscribeViewerId, repository.getViewerId);
};
