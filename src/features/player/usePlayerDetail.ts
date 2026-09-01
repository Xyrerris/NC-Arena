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
  const [recordError, setRecordError] = useState<Error | null>(null);

  /**
   * Bumped by every step of the record, and a dependency of the observer below.
   *
   * ADR-0027 noted this screen had the roster's `useLiveQuery` staleness and left it alone,
   * because nothing here wrote a record. The stepper is that writer (ADR-0029):
   * `observePlayer` selects from `players`, so a write to `head_to_head` does not re-run it
   * and the badge would keep the number it had when the screen opened. Re-keying re-runs the
   * query, the same mechanism a changed viewer already uses — a counter rather than a
   * boolean, so two taps in a row are two updates.
   */
  const [adjusted, setAdjusted] = useState(0);

  // Subscribed, not read: choosing an avatar (ADR-0022) is what turns the Vs You tab from
  // "nothing to compare against" into a comparison, and this screen can be open while it
  // happens — the choice is reachable from the roster underneath it.
  const viewerId = useViewerId();
  const shortUnit = repository.getShortUnit();

  const detail = useLiveData(repository.observePlayer(id), [id, viewerId, adjusted]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onEvent = useCallback(
    (event: PlayerDetailEvent) => {
      // The failure describes the last step, so anything else the user does retires it —
      // the roster's rule (useRoster.ts), for the same reason: a message that outlives the
      // act it explains reads as a screen that is stuck.
      if (event.type !== 'adjustRecord') setRecordError(null);

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
        case 'adjustRecord': {
          const result =
            event.delta === 1
              ? repository.recordMatch(id, event.outcome)
              : repository.removeMatch(id, event.outcome);
          setRecordError(result.ok ? null : result.error);
          // Only on success, so a refused step does not re-run a query nothing changed in —
          // and so the failure line is not immediately re-rendered away.
          if (result.ok) setAdjusted((count) => count + 1);
          return;
        }
      }
    },
    [id, repository],
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
      recordError: recordError?.message ?? null,
    };
  }, [failure, detail.loaded, data, id, tab, shortUnit, recordError]);

  return { state, onEvent };
};
