/**
 * The batch sheet's "buy": open the keystore once with the passphrase the person typed, and run the
 * selected pieces through `runBatch`, each as a purchase exactly as one is made alone (ADR-0044, the
 * cart, step 2b).
 *
 * What it keeps and what it does not. The passphrase is an argument: it opens the keystore and is
 * gone. The private key that comes out is held for the length of the batch — it has to sign every
 * piece — and cleared in a `finally`, so it is zeroed whether the batch ended, stopped, or threw. The
 * mode is `resolveMode`'s: a dry run unless the person turned real purchases on and this build can
 * send, and only a live batch is handed the thing that can send.
 *
 * Before the first piece: the keystore opens, the balance and the account are read **now** (not the
 * bar's older copy), and `checkBatch` runs — no ceiling on the batch, or not enough money, ends it
 * with nothing written. Then, for each piece: the offer is read again, fresh, and `runPurchase` takes
 * over (rules, the record written first, the signature, and for a live one the send), and a sent
 * piece is watched with `awaitPurchase` until the chain decides, before the next begins.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { openKeystore, parseKeystore } from '@/core/common/keystore';
import {
  awaitPurchase,
  deriveActionId,
  deriveRecordId,
  runPurchase,
} from '@/core/common/purchaseFlow';
import {
  checkBatch,
  runBatch,
  type BatchItem,
  type BatchRefusal,
  type BatchResult,
  type StepOutcome,
} from '@/core/common/purchaseBatch';
import { purchaseLogOver } from '@/core/common/purchaseLog';
import { resolveMode, type PurchaseMode } from '@/core/common/purchasePolicy';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet } from '@/core/model';

import { UNAVAILABLE_NOTE } from './purchaseAttemptState';
import { readNcgBalance } from './useNcgBalance';

export type BatchRowState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'working' }
  | { readonly kind: 'done'; readonly outcome: StepOutcome }
  /** The batch ended before this piece. */
  | { readonly kind: 'not-attempted' };

export type BatchState =
  | { readonly kind: 'idle' }
  /** Opening the keystore and reading the balance. */
  | { readonly kind: 'preparing' }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'problem'; readonly message: string }
  | { readonly kind: 'refused'; readonly refusal: BatchRefusal }
  | { readonly kind: 'running'; readonly rows: readonly BatchRowState[] }
  | {
      readonly kind: 'finished';
      readonly rows: readonly BatchRowState[];
      readonly result: BatchResult;
    };

export interface BatchPurchase {
  readonly state: BatchState;
  /** `dry-run` unless the person turned real purchases on (and this build can send). */
  readonly mode: PurchaseMode;
  readonly hasKeystore: boolean;
  /** The ceiling on the whole batch, or null when none is set. */
  readonly batchLimit: number | null;
  readonly onRun: (passphrase: string) => void;
}

const SCAN_FAILED =
  'The market could not be read to check the offer again, so the batch stops here.';

export const useBatchPurchase = (
  planet: Planet,
  items: readonly BatchItem[],
  /** Told as each piece is confirmed by the chain, so the listing can leave the lists at once. */
  onBought?: (productId: string) => void,
): BatchPurchase => {
  const told = useRef(onBought);
  useEffect(() => {
    told.current = onBought;
  }, [onBought]);
  const { keystore, avatarSource, balance, market, transactions, purchases, sender } =
    useArenaData();
  const mode = resolveMode(purchases?.getMode() ?? null);
  const avatar = useViewerAvatar();
  const [state, setState] = useState<BatchState>({ kind: 'idle' });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = state.kind === 'preparing' || state.kind === 'running';
  const onRun = useCallback(
    (passphrase: string): void => {
      if (busy || items.length === 0) return;
      if (
        keystore === undefined ||
        transactions === undefined ||
        purchases === undefined ||
        market === undefined
      ) {
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

      setState({ kind: 'preparing' });
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
          const held = await readNcgBalance(planet, avatar, avatarSource, balance);
          const startNcg = held.kind === 'known' ? held.ncg : null;

          const refusal = checkBatch({
            items,
            batchLimitNcg: purchases.getBatchLimit(),
            balanceNcg: startNcg,
          });
          if (refusal !== null) {
            if (mounted.current) setState({ kind: 'refused', refusal });
            return;
          }

          const log = purchaseLogOver({ get: purchases.getLog, set: purchases.setLog });
          const rows: BatchRowState[] = items.map(() => ({ kind: 'waiting' }));
          const show = (): void => {
            if (mounted.current) setState({ kind: 'running', rows: [...rows] });
          };
          show();

          const buy = async (item: BatchItem, balanceNcg: number | null): Promise<StepOutcome> => {
            const scan = await market.scan(planet, item.shown.itemSubType, item.shown.itemId, {
              fresh: true,
            });
            if (!scan.ok) return { kind: 'problem', message: SCAN_FAILED };
            const fresh = scan.value.listings.find((l) => l.productId === item.shown.productId);

            const at = Date.now();
            const outcome = await runPurchase({
              planet,
              mode,
              source: transactions,
              // Only a purchase that resolved to live is handed the thing that can send.
              sender: mode === 'live' ? sender : undefined,
              privateKey: opened.value.privateKey,
              log,
              actionId: deriveActionId(item.shown.productId, at, Math.random()),
              now: () => at,
              newId: () => deriveRecordId(at, Math.random()),
              shown: item.shown,
              fresh: fresh ?? null,
              limitNcg: purchases.getLimit(),
              balanceNcg,
              keyAddress: opened.value.address,
              avatarAgent,
              buyerAvatar: avatar.address,
            });

            switch (outcome.kind) {
              case 'refused':
                return { kind: 'refused', refusal: outcome.refusal };
              case 'dry-run':
                return { kind: 'signed', transactionId: outcome.run.transactionId };
              case 'live-unavailable':
                return {
                  kind: 'problem',
                  message: 'Buying for real is not available in this build.',
                };
              case 'failed':
                return {
                  kind: 'problem',
                  message: `Stopped at "${outcome.error.stage}": ${outcome.error.message}`,
                };
              case 'not-accepted':
                return { kind: 'not-accepted', message: outcome.message };
              case 'sent': {
                if (sender === undefined) {
                  return {
                    kind: 'unknown',
                    transactionId: outcome.transactionId,
                    message: 'It was sent but cannot be watched in this build.',
                  };
                }
                const settled = await awaitPurchase({
                  planet,
                  sender,
                  log,
                  recordId: outcome.recordId,
                  transactionId: outcome.transactionId,
                  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                });
                switch (settled.kind) {
                  case 'confirmed':
                    return { kind: 'confirmed', transactionId: outcome.transactionId };
                  case 'failed':
                    return {
                      kind: 'chain-failed',
                      transactionId: outcome.transactionId,
                      reason: settled.reason,
                    };
                  case 'unknown':
                    return {
                      kind: 'unknown',
                      transactionId: outcome.transactionId,
                      message: settled.message,
                    };
                }
              }
            }
          };

          const result = await runBatch({
            items,
            balanceNcg: startNcg,
            buy,
            onStep: (index, item, outcome) => {
              rows[index] = outcome === null ? { kind: 'working' } : { kind: 'done', outcome };
              if (outcome?.kind === 'confirmed') told.current?.(item.shown.productId);
              show();
            },
          });
          // Pieces after the one that ended it were not touched, and the sheet says so.
          result.notAttempted.forEach((_item, offset) => {
            rows[result.steps.length + offset] = { kind: 'not-attempted' };
          });
          if (mounted.current) setState({ kind: 'finished', rows: [...rows], result });
        } finally {
          opened.value.privateKey.fill(0);
        }
      })();
    },
    [
      busy,
      items,
      keystore,
      transactions,
      purchases,
      market,
      sender,
      mode,
      avatar,
      avatarSource,
      balance,
      planet,
    ],
  );

  return {
    state,
    mode,
    hasKeystore: keystore?.get() != null,
    batchLimit: purchases?.getBatchLimit() ?? null,
    onRun,
  };
};
