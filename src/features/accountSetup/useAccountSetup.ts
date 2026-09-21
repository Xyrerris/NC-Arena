/**
 * The setup gate's ViewModel-as-a-hook (ARCHITECTURE.md §8).
 *
 * It talks to the repository, never to the network: `core/data` is the only layer that may
 * (§4), and it is also the only one that can store the key the two calls return. That is the
 * whole reason this screen has no idea the backend exists — swap the gateway for a fake in
 * `createTestRepository` and the same flow runs with no server, which is how its tests work.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { useArenaData } from '@/core/data';

import { actionLabel, failureMessage, type AccountSetupUiState } from './accountSetupUiState';

export interface AccountSetupOptions {
  /**
   * Called when this device is paired **and** the user is finished reading whatever was on
   * screen. The gate decides what that leads to; this hook only knows it is over.
   */
  onDone: () => void;
}

export interface AccountSetupController {
  state: AccountSetupUiState;
  code: string;
  onChangeCode: (next: string) => void;
  /** What the primary action will do, given what is currently typed. */
  actionLabel: string;
  onSubmit: () => void;
  /** Acknowledges the secrets. The only way out of the `created` state. */
  onContinue: () => void;
}

export const useAccountSetup = ({ onDone }: AccountSetupOptions): AccountSetupController => {
  const { repository } = useArenaData();

  const [state, setState] = useState<AccountSetupUiState>({ kind: 'asking', error: null });
  const [code, setCode] = useState('');

  /**
   * A ref rather than `state.kind === 'working'`, for the reason `useRosterBackup`'s guard
   * is one: the handler that just set the state cannot see it, and a double press here is
   * not a double render — it is a **second account**, minted and then orphaned, because the
   * first response's key would be overwritten by the second's.
   */
  const working = useRef(false);

  const submit = useCallback(async (): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setState({ kind: 'working' });

    // Trimmed, and the trimmed value is what decides the branch: a code pasted with a
    // trailing newline is a code, and creating a second account because of one would be
    // unrecoverable in the way this whole screen exists to prevent.
    const entered = code.trim();

    if (entered === '') {
      const created = await repository.createAccount();
      working.current = false;
      setState(
        created.ok
          ? {
              kind: 'created',
              apiKey: created.value.apiKey,
              recoveryCode: created.value.recoveryCode,
            }
          : { kind: 'asking', error: failureMessage(created.error.reason) },
      );
      return;
    }

    const linked = await repository.linkAccount(entered);
    working.current = false;
    if (!linked.ok) {
      setState({ kind: 'asking', error: failureMessage(linked.error.reason) });
      return;
    }
    // Nothing to show: linking mints no recovery code, and the one that got us here is
    // already written down somewhere. The gate closes straight onto the roster.
    setState({ kind: 'asking', error: null });
    onDone();
  }, [code, onDone, repository]);

  const onSubmit = useCallback(() => {
    // Floating, like the backup controls': the event API is synchronous, and neither call
    // can reject — both sides of `AccountGateway` return a `Result`.
    void submit();
  }, [submit]);

  const onChangeCode = useCallback((next: string) => setCode(next), []);

  return useMemo(
    () => ({
      state,
      code,
      onChangeCode,
      actionLabel: actionLabel(code),
      onSubmit,
      onContinue: onDone,
    }),
    [code, onChangeCode, onDone, onSubmit, state],
  );
};
