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

import { PlayerDraftRejected, useArenaData, useViewerId } from '@/core/data';
import {
  asPlayerId,
  toPlayerDraft,
  type Player,
  type PlayerDraftErrors,
  type PlayerId,
} from '@/core/model';
import { deviceStatScanner, type StatScanner } from '@/core/ocr';

import {
  applyScan,
  emptyFormValues,
  formTitle,
  scanNote,
  toDraftValues,
  toFormValues,
  type PlayerFormEvent,
  type PlayerFormMode,
  type PlayerFormUiState,
  type PlayerFormValues,
  type StatScanUiState,
} from './playerFormUiState';

export interface PlayerFormOptions {
  mode: PlayerFormMode;
  /** Called once the row is on disk. The screen navigates; the hook does not. */
  onSaved: (player: Player) => void;
  onDeleted: () => void;
  /**
   * Where a screenshot import comes from. Defaults to the device's picker and ML Kit; a
   * test supplies a fake built from the same ports, which is what keeps this hook testable
   * without an emulator (ADR-0024).
   */
  scanner?: StatScanner;
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
  scanner = deviceStatScanner,
}: PlayerFormOptions): PlayerFormController => {
  const { repository, useLiveData } = useArenaData();

  // Create is the only mode with nothing to read; `viewer` carries the id the preference
  // resolved to, so it loads through exactly the same query an edit does.
  const editId: PlayerId = mode.kind === 'create' ? NO_PLAYER : mode.id;
  const viewerId = useViewerId();
  const detail = useLiveData(repository.observePlayer(editId), [editId, viewerId]);

  const [values, setValues] = useState<PlayerFormValues>(emptyFormValues);
  const [errors, setErrors] = useState<PlayerDraftErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scan, setScan] = useState<StatScanUiState>({ kind: 'idle' });

  /**
   * Set the moment a write succeeds, and it holds the screen on `loading` until the route
   * actually changes. Without it, deleting a player flashes the "not editable" state: the
   * live query re-reads before navigation lands, and correctly reports the row is gone.
   */
  const [isClosing, setIsClosing] = useState(false);

  const saving = useRef(false);
  /**
   * The picker is a native modal and the read that follows it is slow enough to press
   * twice. A ref rather than reading `scan.kind`, for the same reason `saving` is one: the
   * handler that just set the state cannot see it.
   */
  const scanning = useRef(false);

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

  /**
   * Fills the inputs from a screenshot. It deliberately does **not** save, and does not
   * clear the errors: a value the scanner read is exactly as unvalidated as one the user
   * typed, and pressing Save is still what decides whether it is a player.
   */
  const scanScreenshot = useCallback(async () => {
    if (scanning.current || isClosing) return;
    scanning.current = true;
    setScan({ kind: 'scanning' });

    const result = await scanner.scan();
    scanning.current = false;

    if (!result.ok) {
      setScan({ kind: 'failed', message: result.error.message });
      return;
    }
    // The user dismissed the picker. Nothing happened, and saying so would be noise about
    // a decision they already know they made.
    if (result.value === null) {
      setScan({ kind: 'idle' });
      return;
    }

    const { sheet, screenshot } = result.value;
    setValues((current) => applyScan(current, sheet));
    // Every scanned field's stale rejection goes with it: the value under the message has
    // just been replaced, so the message describes something that is no longer there.
    setErrors((current) => {
      const next = { ...current };
      for (const field of sheet.found) delete next[field];
      return next;
    });
    setScan({ kind: 'applied', note: scanNote(sheet.found, sheet.missing, screenshot) });
  }, [isClosing, scanner]);

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
        case 'scan':
          // Floating: the event API is synchronous, and a rejection is impossible —
          // `scan()` returns a `Result` rather than throwing.
          void scanScreenshot();
          return;
        case 'submit':
          submit();
          return;
        case 'delete':
          remove();
          return;
      }
    },
    [remove, scanScreenshot, submit],
  );

  const state: PlayerFormUiState = useMemo(() => {
    if (isClosing) return { kind: 'loading' };

    if (mode.kind !== 'create') {
      if (loaded && player === null) {
        return {
          kind: 'unavailable',
          message:
            mode.kind === 'viewer'
              ? 'The player you chose as your avatar is no longer on the ladder. Pick another.'
              : 'That player is no longer on the ladder.',
        };
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
      scan,
    };
  }, [errors, isClosing, isSaving, loaded, message, mode, origin, player, scan, seeded, values]);

  return { state, onEvent };
};
