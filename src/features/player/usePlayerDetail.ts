/**
 * The detail screen's ViewModel-as-a-hook, mirroring `useRoster` (ARCHITECTURE.md §8).
 *
 * One live query answers the whole screen: `observePlayer` resolves the opponent, the
 * viewer and the head-to-head between them in a single row, so the two tabs can never
 * disagree about which sync they are showing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useArenaData, useViewerId } from '@/core/data';
import type { PlayerId } from '@/core/model';

import {
  toPlayerHeaderUi,
  toStatRows,
  toVersusUi,
  type PlayerDetailEvent,
  type PlayerDetailTab,
  type PlayerDetailUiState,
} from './playerDetailUiState';

export interface PlayerDetailController {
  state: PlayerDetailUiState;
  onEvent: (event: PlayerDetailEvent) => void;
}

export const usePlayerDetail = (id: PlayerId): PlayerDetailController => {
  const { repository, useLiveData } = useArenaData();

  // Tab state lives here rather than in the screen so it survives anything that re-renders
  // the screen, and it is plain component state because Android keeps the process alive
  // across a backgrounding — persisting a tab choice per player would outlive its usefulness.
  const [tab, setTab] = useState<PlayerDetailTab>('STATS');
  const [refreshError, setRefreshError] = useState<Error | null>(null);

  // Subscribed, not read: choosing an avatar (ADR-0022) is what turns the Vs You tab from
  // "nothing to compare against" into a comparison, and this screen can be open while it
  // happens — the choice is reachable from the roster underneath it.
  const viewerId = useViewerId();
  const shortUnit = repository.getShortUnit();

  const detail = useLiveData(repository.observePlayer(id), [id, viewerId]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onEvent = useCallback(
    (event: PlayerDetailEvent) => {
      switch (event.type) {
        case 'selectTab':
          setTab(event.tab);
          return;
        case 'refresh':
          void repository.refresh().then((result) => {
            if (!mounted.current) return;
            setRefreshError(result.ok ? null : result.error);
          });
          return;
      }
    },
    [repository],
  );

  const failure = detail.error ?? refreshError;
  const data = detail.data;

  const state: PlayerDetailUiState = useMemo(() => {
    if (failure !== null) {
      return { kind: 'error', message: failure.message, canRetry: true };
    }
    if (!detail.loaded) return { kind: 'loading' };
    if (data === null) return { kind: 'notFound', id };

    return {
      kind: 'ready',
      tab,
      header: toPlayerHeaderUi(data.player),
      canEdit: data.origin === 'LOCAL',
      stats: toStatRows(data.player, shortUnit),
      versus:
        data.viewer === null
          ? null
          : toVersusUi(data.viewer, data.player, data.headToHead, shortUnit),
    };
  }, [failure, detail.loaded, data, id, tab, shortUnit]);

  return { state, onEvent };
};
