/**
 * Whether this device is unpaired while a backend exists — the state the user reaches by
 * skipping setup (ADR-0038) — as a subscription.
 *
 * The same shape as `useNeedsAccount`, on the same store and the same announcement, so a
 * device paired from the "You" screen stops offering to connect the moment the key lands.
 */

import { useSyncExternalStore } from 'react';

import { useArenaData } from './arenaContext';

export const useCanLinkAccount = (): boolean => {
  const { repository } = useArenaData();
  return useSyncExternalStore(repository.subscribeAccount, repository.canLinkAccount);
};
