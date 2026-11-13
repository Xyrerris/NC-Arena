/**
 * The keystore block's state (ADR-0044, "Next: buying", step B): the text the person imported, and
 * the result of opening it with a passphrase.
 *
 * What it keeps and what it does not. The imported text is kept (it is already encrypted). The
 * passphrase is **not**: it is an argument to `onProve`, used to open the keystore and then gone,
 * and the key that comes out is cleared by `proveKeystore` before this ever sees the result — only
 * an address comes back. Nothing here signs, sends, or reads a balance.
 *
 * "Opens" is not "is yours". After a proof the address of the key is compared with the account of
 * the avatar the person plays, read from the chain; a keystore whose key belongs to another
 * account opens fine and still could not buy for this avatar, which is what the result says.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  normaliseAgentAddress,
  parseKeystore,
  proveKeystore,
  type Keystore,
} from '@/core/common/keystore';
import { useArenaData, useViewerAvatar } from '@/core/data';

import type { Comparison } from './keystoreUiState';

export type ProofState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'proving' }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'failed'; readonly message: string }
  | {
      readonly kind: 'opened';
      readonly address: string;
      readonly comparison: Comparison;
      /** The file's own `address` field names a different account than its key. */
      readonly claimedDiffers: boolean;
    };

export interface KeystoreController {
  /** The keystore on the device, or null. */
  readonly stored: { readonly claimedAddress: string | null } | null;
  readonly importError: string | null;
  readonly removed: boolean;
  readonly proof: ProofState;
  /** Saves pasted text if it is a keystore. Returns whether it was saved. */
  readonly onImport: (text: string) => boolean;
  readonly onRemove: () => void;
  readonly onProve: (passphrase: string) => void;
}

export const useKeystore = (): KeystoreController => {
  const { keystore: store, avatarSource } = useArenaData();
  if (store === undefined) {
    throw new Error(
      'The keystore block needs `keystore` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }
  const avatar = useViewerAvatar();

  const [keystore, setKeystore] = useState<Keystore | null>(() => {
    const text = store.get();
    if (text === null) return null;
    const parsed = parseKeystore(text);
    return parsed.ok ? parsed.value : null;
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [proof, setProof] = useState<ProofState>({ kind: 'idle' });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onImport = useCallback(
    (text: string): boolean => {
      const parsed = parseKeystore(text.trim());
      if (!parsed.ok) {
        setImportError(parsed.error.message);
        return false;
      }
      store.set(parsed.value.source);
      setKeystore(parsed.value);
      setImportError(null);
      setRemoved(false);
      setProof({ kind: 'idle' });
      return true;
    },
    [store],
  );

  const onRemove = useCallback((): void => {
    store.clear();
    setKeystore(null);
    setProof({ kind: 'idle' });
    setRemoved(true);
  }, [store]);

  const compare = useCallback(
    async (address: string): Promise<Comparison> => {
      if (avatar === null || avatarSource === undefined) {
        return { kind: 'unchecked', why: 'no-avatar' };
      }
      const identity = await avatarSource.readAvatar(avatar);
      if (!identity.ok) {
        return {
          kind: 'unchecked',
          why: identity.error.reason === 'OFFLINE' ? 'offline' : 'failed',
        };
      }
      if (identity.value === null) return { kind: 'unchecked', why: 'no-avatar' };
      const theirs = normaliseAgentAddress(identity.value.agentAddress);
      if (theirs === null) return { kind: 'unchecked', why: 'failed' };
      return theirs === address
        ? { kind: 'matches' }
        : { kind: 'differs', avatarAgent: identity.value.agentAddress };
    },
    [avatar, avatarSource],
  );

  const proving = proof.kind === 'proving';
  const onProve = useCallback(
    (passphrase: string): void => {
      if (keystore === null || proving) return;
      setProof({ kind: 'proving' });
      void proveKeystore(keystore, passphrase).then(async (result) => {
        if (!mounted.current) return;
        if (!result.ok) {
          setProof(
            result.error.code === 'WRONG_PASSPHRASE'
              ? { kind: 'wrong' }
              : { kind: 'failed', message: result.error.message },
          );
          return;
        }
        const address = result.value;
        const comparison = await compare(address);
        if (!mounted.current) return;
        const claimed =
          keystore.claimedAddress === null ? null : normaliseAgentAddress(keystore.claimedAddress);
        setProof({
          kind: 'opened',
          address,
          comparison,
          claimedDiffers: claimed !== null && claimed !== address,
        });
      });
    },
    [keystore, proving, compare],
  );

  return {
    stored: keystore === null ? null : { claimedAddress: keystore.claimedAddress },
    importError,
    removed,
    proof,
    onImport,
    onRemove,
    onProve,
  };
};
