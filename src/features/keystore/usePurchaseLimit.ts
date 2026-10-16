/**
 * The per-purchase limit in NCG (ADR-0044, step D): read from the store, validated when typed, and
 * saved or removed. **No limit means no purchase** — the purchase flow refuses without one — so
 * removing it is a real act and the block says what it means.
 *
 * Returns null where the app supplies no purchase store (a screen that never shows the block).
 */

import { useCallback, useState } from 'react';

import { useArenaData } from '@/core/data';

import { LIMIT_ERROR, parseLimit } from './keystoreUiState';

export interface PurchaseLimitController {
  /** The limit in force, or null for none. */
  readonly limit: number | null;
  readonly error: string | null;
  /** Saves the typed amount. Returns whether it was valid and saved. */
  readonly onSave: (text: string) => boolean;
  readonly onRemove: () => void;
}

export const usePurchaseLimit = (): PurchaseLimitController | null => {
  const { purchases } = useArenaData();
  const [limit, setLimit] = useState<number | null>(() => purchases?.getLimit() ?? null);
  const [error, setError] = useState<string | null>(null);

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

  return purchases === undefined ? null : { limit, error, onSave, onRemove };
};
