/**
 * The real purchases whose end is not known, and a way to clear one (ADR-0044, the cart, step 2b).
 *
 * A live purchase that was sent without a verdict, or that began and never finished, keeps its offer
 * blocked so the piece is not bought twice. That is the safe reading and also a dead end if the
 * person cannot get out of it: here they can see each one and, once they have looked at their own
 * inventory and balance, clear it. Clearing is the person's word that they checked, not something
 * the app can verify, so it is a button of its own with a sentence saying so, and it only touches a
 * purchase that is still unsettled (`clearUnsettled`).
 *
 * Returns null where the app supplies no purchase store.
 */

import { useCallback, useState } from 'react';

import {
  clearUnsettled,
  purchaseLogOver,
  unsettledRecords,
  type PurchaseRecord,
} from '@/core/common/purchaseLog';
import { useArenaData } from '@/core/data';

export interface PurchaseRecordController {
  readonly unsettled: readonly PurchaseRecord[];
  /** The stored record could not be understood, so nothing can be listed or cleared. */
  readonly unreadable: boolean;
  readonly onClear: (id: string) => void;
}

export const usePurchaseRecord = (): PurchaseRecordController | null => {
  const { purchases } = useArenaData();
  const read = useCallback(() => {
    if (purchases === undefined) return { unsettled: [], unreadable: false };
    const stored = purchaseLogOver({ get: purchases.getLog, set: purchases.setLog }).read();
    return { unsettled: unsettledRecords(stored.records), unreadable: stored.unreadable };
  }, [purchases]);
  const [view, setView] = useState(read);

  const onClear = useCallback(
    (id: string): void => {
      if (purchases === undefined) return;
      const log = purchaseLogOver({ get: purchases.getLog, set: purchases.setLog });
      const stored = log.read();
      // A log that cannot be read is never written over.
      if (stored.unreadable) return;
      log.write(clearUnsettled(stored.records, id));
      setView(read());
    },
    [purchases, read],
  );

  return purchases === undefined ? null : { ...view, onClear };
};
