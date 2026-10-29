/**
 * The equipment in the viewer's bag, with what each piece holds, for the upgrade planner.
 *
 * Read when `enabled` turns true (the planner opens), not on every visit to the screen: the bag is
 * about 300 kB. The answer is kept with the avatar it was read for. A bag that cannot be read says
 * why; it is never an empty list.
 */

import { useCallback, useEffect, useState } from 'react';

import type { HeldEquipment } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';

export type OwnedEquipmentState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'no-avatar' }
  | { readonly status: 'failed'; readonly reason: 'OFFLINE' | 'FAILED' }
  | { readonly status: 'ready'; readonly equipment: readonly HeldEquipment[] };

export const useOwnedEquipment = (
  enabled: boolean,
): OwnedEquipmentState & { readonly retry: () => void } => {
  const { inventory } = useArenaData();
  const avatar = useViewerAvatar();
  const [state, setState] = useState<OwnedEquipmentState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const key = avatar === null ? 'none' : `${avatar.planet}:${avatar.address}`;

  useEffect(() => {
    if (!enabled) return;
    if (avatar === null || inventory === undefined) return;
    let current = true;
    void inventory.readInventory(avatar).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.error.reason });
      } else if (result.value === null) {
        setState({ status: 'no-avatar' });
      } else {
        setState({ status: 'ready', equipment: result.value.equipment });
      }
    });
    return () => {
      current = false;
    };
    // The avatar is read through its key: a new object for the same avatar is not a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, inventory, key, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  // No avatar or no inventory source is known at once; it is not something to wait for.
  const unreadable = enabled && (avatar === null || inventory === undefined);
  return { ...(unreadable ? ({ status: 'no-avatar' } as const) : state), retry };
};
