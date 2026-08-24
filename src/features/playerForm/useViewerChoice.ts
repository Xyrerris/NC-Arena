/**
 * The choice half of the viewer screen, as a hook (ARCHITECTURE.md §8).
 *
 * It reads the whole roster in rank order — not the search results, and not a sorted view:
 * this list is an identity question, so the order that matches the roster's own default is
 * the one the user recognises.
 *
 * The write it performs is a *preference*, not a row: `setViewerId` selects an existing
 * player and refuses an id that is not one (ADR-0022). Navigation stays a callback, as it
 * is in `usePlayerForm`, so the hook can be driven without a router.
 */

import { useCallback, useMemo, useState } from 'react';

import { useArenaData, useViewerId } from '@/core/data';
import type { PlayerId } from '@/core/model';

import { toViewerCandidateUi, type ViewerChoiceUiState } from './viewerChoiceUiState';

export interface ViewerChoiceOptions {
  /** Called once the preference is stored. The screen decides where that leads. */
  onChosen: () => void;
}

export interface ViewerChoiceController {
  state: ViewerChoiceUiState;
  onChoose: (id: PlayerId) => void;
}

export const useViewerChoice = ({ onChosen }: ViewerChoiceOptions): ViewerChoiceController => {
  const { repository, useLiveData } = useArenaData();

  // The current viewer is part of this subscription's identity: `observeRoster` resolves it
  // at call time to mark the viewer's own row, so choosing somebody else has to re-key it.
  const viewerId = useViewerId();
  const roster = useLiveData(repository.observeRoster('RANK', ''), [viewerId]);

  const [message, setMessage] = useState<string | null>(null);

  const candidates = useMemo(() => roster.data.map(toViewerCandidateUi), [roster.data]);

  const onChoose = useCallback(
    (id: PlayerId) => {
      const result = repository.setViewerId(id);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setMessage(null);
      onChosen();
    },
    [onChosen, repository],
  );

  const state: ViewerChoiceUiState = useMemo(() => {
    if (roster.error !== null) return { kind: 'error', message: roster.error.message };
    if (!roster.loaded) return { kind: 'loading' };
    if (candidates.length === 0) return { kind: 'empty' };
    return { kind: 'ready', candidates, message };
  }, [candidates, message, roster.error, roster.loaded]);

  return { state, onChoose };
};
