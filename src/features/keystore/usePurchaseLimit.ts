/**
 * The per-purchase limit in NCG and the purchase mode (ADR-0044, step D): read from the store,
 * validated when typed, and saved or removed. **No limit means no purchase** — the purchase flow
 * refuses without one — so removing it is a real act and the block says what it means.
 *
 * The mode is `dry-run` unless the person has turned real purchases on, and they can only do that in
 * a build that can send (`liveBuilt`): `resolveMode` answers `dry-run` for anything else, so a stored
 * `live` in a build without sending is still a dry run.
 *
 * Returns null where the app supplies no purchase store (a screen that never shows the block).
 */

import { useCallback, useState } from 'react';

import { LIVE_SENDING_BUILT, resolveMode, type PurchaseMode } from '@/core/common/purchasePolicy';
import { useArenaData } from '@/core/data';

import { LIMIT_ERROR, parseLimit } from './keystoreUiState';

export interface PurchaseLimitController {
  /** The limit in force, or null for none. */
  readonly limit: number | null;
  readonly error: string | null;
  /** Saves the typed amount. Returns whether it was valid and saved. */
  readonly onSave: (text: string) => boolean;
  readonly onRemove: () => void;
  /** The ceiling on a whole batch, or null for none (no batch can be bought). */
  readonly batchLimit: number | null;
  readonly batchError: string | null;
  readonly onSaveBatch: (text: string) => boolean;
  readonly onRemoveBatch: () => void;
  /** Whether this build can send at all. When false the mode cannot be changed. */
  readonly liveBuilt: boolean;
  readonly mode: PurchaseMode;
  readonly onMode: (mode: PurchaseMode) => void;
}

export const usePurchaseLimit = (
  liveBuilt: boolean = LIVE_SENDING_BUILT,
): PurchaseLimitController | null => {
  const { purchases } = useArenaData();
  const [limit, setLimit] = useState<number | null>(() => purchases?.getLimit() ?? null);
  const [stored, setStored] = useState<string | null>(() => purchases?.getMode() ?? null);
  const [error, setError] = useState<string | null>(null);
  const [batchLimit, setBatchLimit] = useState<number | null>(
    () => purchases?.getBatchLimit() ?? null,
  );
  const [batchError, setBatchError] = useState<string | null>(null);

  const onSaveBatch = useCallback(
    (text: string): boolean => {
      const parsed = parseLimit(text);
      if (parsed === null) {
        setBatchError(LIMIT_ERROR);
        return false;
      }
      purchases?.setBatchLimit(parsed);
      setBatchLimit(parsed);
      setBatchError(null);
      return true;
    },
    [purchases],
  );

  const onRemoveBatch = useCallback((): void => {
    purchases?.setBatchLimit(null);
    setBatchLimit(null);
    setBatchError(null);
  }, [purchases]);

  const onSave = useCallback(
    (text: string): boolean => {
      const parsed = parseLimit(text);
      if (parsed === null) {
        setError(LIMIT_ERROR);
        return false;
      }
      purchases?.setLimit(parsed);
      setLimit(parsed);
      setError(null);
      return true;
    },
    [purchases],
  );

  const onRemove = useCallback((): void => {
    purchases?.setLimit(null);
    setLimit(null);
    setError(null);
  }, [purchases]);

  const onMode = useCallback(
    (mode: PurchaseMode): void => {
      // A build that cannot send cannot be switched to sending.
      if (mode === 'live' && !liveBuilt) return;
      purchases?.setMode(mode);
      setStored(mode);
    },
    [purchases, liveBuilt],
  );

  return purchases === undefined
    ? null
    : {
        limit,
        error,
        onSave,
        onRemove,
        batchLimit,
        batchError,
        onSaveBatch,
        onRemoveBatch,
        liveBuilt,
        mode: resolveMode(stored, liveBuilt),
        onMode,
      };
};
