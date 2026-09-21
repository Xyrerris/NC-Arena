/**
 * Whether this device still has to be paired to an account (ADR-0035, decision 2), as a
 * subscription.
 *
 * `useSyncExternalStore` rather than React state, for the reason `useViewerId` gives: the
 * source of truth is MMKV, and a context holding a second copy would disagree with it the
 * moment setup stored a key.
 *
 * It answers with a **boolean**, never the key. The gate only needs to know whether one
 * exists, and a hook that returned the token would put it in the React tree on every launch
 * for the whole life of the app — in the props of whatever held it, and in any error
 * reporting that ever serialises a component tree. The one screen that has to display a
 * secret receives it as the return value of the call that minted it, once, and nothing
 * stores it afterwards.
 */

import { useSyncExternalStore } from 'react';

import { useArenaData } from './arenaContext';

export const useNeedsAccount = (): boolean => {
  const { repository } = useArenaData();

  // Both are stable for the life of the repository, and `needsAccount` returns a primitive,
  // so there is no cached-snapshot trap here.
  return useSyncExternalStore(repository.subscribeAccount, repository.needsAccount);
};
