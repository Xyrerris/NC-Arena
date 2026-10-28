/**
 * What the account behind the viewer's avatar holds in NCG.
 *
 * The balance needs the account, read from the chain, then the account's NCG; either step may fail,
 * and a balance that cannot be read is *unknown*, never zero. `readNcgBalance` is the reading, shared
 * by the purchase card (one offer) and the offers view (a selection of them); `useNcgBalance` runs it
 * for the view when there is something to compare it with.
 */

import { useEffect, useState } from 'react';

import type { AvatarSource, BalanceSource } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet, ViewerAvatar } from '@/core/model';

import type { BalanceState } from './balanceState';

export const readNcgBalance = async (
  planet: Planet,
  avatar: ViewerAvatar | null,
  avatarSource: AvatarSource | undefined,
  balance: BalanceSource | undefined,
): Promise<BalanceState> => {
  if (avatar === null || avatarSource === undefined || balance === undefined) {
    return { kind: 'unknown', why: 'no-avatar' };
  }
  const identity = await avatarSource.readAvatar(avatar);
  if (!identity.ok) {
    return { kind: 'unknown', why: identity.error.reason === 'OFFLINE' ? 'offline' : 'failed' };
  }
  if (identity.value === null) return { kind: 'unknown', why: 'no-avatar' };
  const held = await balance.readNcg(planet, identity.value.agentAddress);
  if (!held.ok) {
    return { kind: 'unknown', why: held.error.reason === 'OFFLINE' ? 'offline' : 'failed' };
  }
  return { kind: 'known', ncg: held.value };
};

/**
 * The balance, read once when `enabled` turns true (and again for another avatar). `null` is
 * "not asked, or still reading": the answer is kept with the avatar it was read for, so another
 * avatar's balance is never shown for this one.
 */
export const useNcgBalance = (planet: Planet, enabled: boolean): BalanceState | null => {
  const { avatarSource, balance } = useArenaData();
  const avatar = useViewerAvatar();
  const key = avatar === null ? 'none' : `${planet}:${avatar.address}`;
  const [answer, setAnswer] = useState<{
    readonly key: string;
    readonly state: BalanceState;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void readNcgBalance(planet, avatar, avatarSource, balance).then((state) => {
      if (current) setAnswer({ key, state });
    });
    return () => {
      current = false;
    };
  }, [enabled, planet, avatar, avatarSource, balance, key]);

  return answer?.key === key ? answer.state : null;
};
