/**
 * The Nine Chronicles avatar the viewer plays, as a subscription (ADR-0044).
 *
 * It rides the viewer's own subscription: the avatar is cleared and set in the same places the
 * viewer is, and `getViewerAvatar` hands back one object per value, so the snapshot is stable
 * between changes.
 */

import { useSyncExternalStore } from 'react';

import type { ViewerAvatar } from '../model';
import { useArenaData } from './arenaContext';

export const useViewerAvatar = (): ViewerAvatar | null => {
  const { repository } = useArenaData();
  return useSyncExternalStore(repository.subscribeViewerId, repository.getViewerAvatar);
};
