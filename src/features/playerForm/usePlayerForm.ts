/**
 * The form's ViewModel-as-a-hook, alongside `useRoster` and `usePlayerDetail`
 * (ARCHITECTURE.md §8).
 *
 * It is the first hook in the app that *writes*, and two things follow from that:
 *
 * - **Navigation is a callback, not an import.** `onSaved` / `onDeleted` are supplied by
 *   the screen, which owns the router exactly as the other two screens do. A hook that
 *   imported `expo-router` could not be driven by `renderHook`.
 * - **The write is synchronous today and will not be tomorrow.** `expo-sqlite` and
 *   `better-sqlite3` are both sync, so `isSaving` never actually paints — but the double
 *   submit guard is a ref rather than that state, because a ref is correct in both worlds
 *   and reading `isSaving` inside the handler that just set it never is.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { PlayerDraftRejected, useArenaData } from '@/core/data';
import {
  asPlayerId,
  toPlayerDraft,
  type Player,
  type PlayerDraftErrors,
  type PlayerId,
} from '@/core/model';

import {
  emptyFormValues,
  formTitle,
  toDraftValues,
  toFormValues,
  type PlayerFormEvent,
  type PlayerFormMode,
  type PlayerFormUiState,
  type PlayerFormValues,
} from './playerFormUiState';

export interface PlayerFormOptions {
  mode: PlayerFormMode;
  /** Called once the row is on disk. The screen navigates; the hook does not. */
  onSaved: (player: Player) => void;
  onDeleted: () => void;
}

export interface PlayerFormController {
  state: PlayerFormUiState;
  onEvent: (event: PlayerFormEvent) => void;
}

/** Matches no row. Create mode still calls the observer, to keep hook order stable. */
const NO_PLAYER = asPlayerId('');

const NOT_EDITABLE =
  'This player came from the roster sync, so the next refresh would overwrite any change. ' +
  'Only players added on this device can be edited.';

export const usePlayerForm = ({
  mode,
  onSaved,
  onDeleted,
}: PlayerFormOptions): PlayerFormController => {
  const { repository, useLiveData } = useArenaData();

  const editId: PlayerId = mode.kind === 'edit' ? mode.id : NO_PLAYER;
  const viewerId = repository.getViewerId();
  const detail = useLiveData(repository.observePlayer(editId), [editId, viewerId]);

  const [values, setValues] = useState<PlayerFormValues>(emptyFormValues);
  const [errors, setErrors] = useState<PlayerDraftErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Set the moment a write succeeds, and it holds the screen on `loading` until the route
   * actually changes. Without it, deleting a player flashes the "not editable" state: the
   * live query re-reads before navigation lands, and correctly reports the row is gone.
   */
  const [isClosing, setIsClosing] = useState(false);

  const saving = useRef(false);

  const loaded = detail.loaded;
  const player = detail.data?.player ?? null;
  const origin = detail.data?.origin ?? null;

  /**
   * Which player the inputs currently hold. Edit mode seeds them from the row once, and
   * re-seeds only if the id underneath the screen changes — re-seeding on every read would
   * overwrite whatever the user was in the middle of typing.
   *
   * Adjusted **during render** rather than in an effect, which is the sanctioned shape for
   * "derive state from a value that changed" ("You Might Not Need an Effect"). React
   * re-renders immediately without painting the intermediate result, so unlike the effect
   * version there is no frame where an empty form sits over a player that exists.
   */
  const [seededId, setSeededId] = useState<PlayerId | null>(null);
  if (player !== null && seededId !== player.id) {
    setSeededId(player.id);
    setValues(toFormValues(toPlayerDraft(player)));
  }
  const seeded = mode.kind === 'create' || seededId !== null;

  const applyFailure = useCallback((error: Error) => {
    if (error instanceof PlayerDraftRejected) {
      setErrors(error.fields);
      setMessage(null);
      return;
    }
    setErrors({});
    setMessage(error.message);
  }, []);

  const submit = useCallback(() => {
    if (saving.current || isClosing) return;
    saving.current = true;
    setIsSaving(true);

    const draft = toDraftValues(values);
    const result =
      mode.kind === 'create'
        ? repository.createPlayer(draft)
        : repository.updatePlayer(mode.id, draft);

    saving.current = false;
    setIsSaving(false);

    if (!result.ok) {
      applyFailure(result.error);
      return;
    }
    setErrors({});
    setMessage(null);
    setIsClosing(true);
    onSaved(result.value);
  }, [applyFailure, isClosing, mode, onSaved, repository, values]);

  const remove = useCallback(() => {
    if (mode.kind !== 'edit' || isClosing) return;
    const result = repository.deletePlayer(mode.id);
    if (!result.ok) {
      applyFailure(result.error);
      return;
    }
    setIsClosing(true);
    onDeleted();
  }, [applyFailure, isClosing, mode, onDeleted, repository]);

  const onEvent = useCallback(
    (event: PlayerFormEvent) => {
      switch (event.type) {
        case 'change':
          setValues((current) => ({ ...current, [event.field]: event.value }));
          // This field's error clears as it is retyped, rather than on the next submit: a
          // message that outlives the value it described reads as a control that is stuck,
          // and nothing on screen tells the user it is stale.
          setErrors((current) => {
            if (current[event.field] === undefined) return current;
            const next = { ...current };
            delete next[event.field];
            return next;
          });
          return;
        case 'submit':
          submit();
          return;
        case 'delete':
          remove();
          return;
      }
    },
    [remove, submit],
  );

  const state: PlayerFormUiState = useMemo(() => {
    if (isClosing) return { kind: 'loading' };

    if (mode.kind === 'edit') {
      if (loaded && player === null) {
        return { kind: 'unavailable', message: 'That player is no longer on the ladder.' };
      }
      if (loaded && origin === 'REMOTE') {
        return { kind: 'unavailable', message: NOT_EDITABLE };
      }
      if (!seeded) return { kind: 'loading' };
    }

    return {
      kind: 'ready',
      mode,
      title: formTitle(mode, player?.name ?? ''),
      values,
      errors,
      message,
      isSaving,
    };
  }, [errors, isClosing, isSaving, loaded, message, mode, origin, player, seeded, values]);

  return { state, onEvent };
};
