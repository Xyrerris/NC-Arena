/**
 * The purchase card's "try buying" (ADR-0044, step D): open the keystore with the passphrase the
 * person typed, and run the purchase **as a dry run** — rules, record, signature, and no further.
 *
 * What it keeps and what it does not. The passphrase is an argument: it opens the keystore and is
 * gone. The private key that comes out is handed to `runPurchase` for the one signature and cleared
 * in a `finally`, so it is zeroed whether the purchase refused, failed or finished. Nothing is
 * stored but what `runPurchase` records (the offer, the price, the state), and nothing is sent: the
 * mode is the default, `resolveMode(null)`, which is a dry run, and the node source it is given has
 * no way to send.
 *
 * "Whose" is checked inside the flow, against the avatar's account read from the chain here; a
 * keystore of another account opens and is then refused with a sentence, not a crash.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MarketListing } from '@/core/common';
import { openKeystore, parseKeystore } from '@/core/common/keystore';
import { deriveActionId, deriveRecordId, runPurchase } from '@/core/common/purchaseFlow';
import { purchaseLogOver } from '@/core/common/purchaseLog';
import { resolveMode } from '@/core/common/purchasePolicy';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet } from '@/core/model';

import { UNAVAILABLE_NOTE, type AttemptState } from './purchaseAttemptState';
import type { PurchaseCheck } from './purchaseCardState';

export interface PurchaseAttempt {
  readonly state: AttemptState;
  /** Whether a keystore is on the device to open. */
  readonly hasKeystore: boolean;
  readonly onTry: (passphrase: string) => void;
}

export const usePurchaseAttempt = (
  planet: Planet,
  shown: MarketListing,
  check: PurchaseCheck,
): PurchaseAttempt => {
  const { keystore, avatarSource, transactions, purchases } = useArenaData();
  const avatar = useViewerAvatar();
  const [state, setState] = useState<AttemptState>({ kind: 'idle' });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const working = state.kind === 'working';
  const onTry = useCallback(
    (passphrase: string): void => {
      if (check.kind !== 'ready' || working) return;
      if (keystore === undefined || transactions === undefined || purchases === undefined) {
        setState({ kind: 'problem', message: UNAVAILABLE_NOTE });
        return;
      }
      const stored = keystore.get();
      const parsed = stored === null ? null : parseKeystore(stored);
      if (parsed === null || !parsed.ok) {
        setState({
          kind: 'problem',
          message: parsed === null ? 'There is no keystore on this device.' : parsed.error.message,
        });
        return;
      }
      if (avatar === null) {
        setState({ kind: 'problem', message: 'Say which avatar you play first (the You tab).' });
        return;
      }

      const fresh = check.listing;
      const balance = check.balance;
      setState({ kind: 'working' });
      void (async () => {
        const opened = await openKeystore(parsed.value, passphrase);
        if (!opened.ok) {
          if (!mounted.current) return;
          setState(
            opened.error.code === 'WRONG_PASSPHRASE'
              ? { kind: 'wrong' }
              : { kind: 'problem', message: opened.error.message },
          );
          return;
        }
        try {
          let avatarAgent: string | null = null;
          if (avatarSource !== undefined) {
            const identity = await avatarSource.readAvatar(avatar);
            if (identity.ok && identity.value !== null) avatarAgent = identity.value.agentAddress;
          }
          const at = Date.now();
          const outcome = await runPurchase({
            planet,
            mode: resolveMode(null),
            source: transactions,
            privateKey: opened.value.privateKey,
            log: purchaseLogOver({ get: purchases.getLog, set: purchases.setLog }),
            actionId: deriveActionId(fresh.productId, at, Math.random()),
            now: () => at,
            newId: () => deriveRecordId(at, Math.random()),
            shown,
            fresh,
            limitNcg: purchases.getLimit(),
            balanceNcg: balance.kind === 'known' ? balance.ncg : null,
            keyAddress: opened.value.address,
            avatarAgent,
            buyerAvatar: avatar.address,
          });
          if (mounted.current) setState({ kind: 'done', outcome });
        } finally {
          opened.value.privateKey.fill(0);
        }
      })();
    },
    [check, working, keystore, transactions, purchases, avatar, avatarSource, planet, shown],
  );

  return { state, hasKeystore: keystore?.get() != null, onTry };
};
