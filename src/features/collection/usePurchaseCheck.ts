/**
 * Looks at one offer before anyone could buy it (ADR-0044, "Next: buying", step A): is it still
 * on sale, and what is in the account that would pay.
 *
 * The market service has no lookup of one listing (`/Market/product/{id}` is a 404), so "is it
 * still there" is a **fresh** scan of its item with the `productId` picked out of it, which is
 * what a purchase will have to do too. The balance needs the account behind the viewer's avatar,
 * read from the chain, then the account's NCG. The two run together; either may fail without the
 * other: an offer that is gone needs no balance, and a balance that cannot be read does not
 * make the offer any less real.
 *
 * Nothing is kept: closing the card aborts the scan, and opening it again looks again.
 */

import { useEffect, useState } from 'react';

import type { MarketListing } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet } from '@/core/model';

import type { PurchaseCheck } from './purchaseCardState';
import { readNcgBalance } from '@/core/purchase/useNcgBalance';

export const usePurchaseCheck = (planet: Planet, listing: MarketListing): PurchaseCheck => {
  const { market, avatarSource, balance } = useArenaData();
  if (market === undefined) {
    throw new Error(
      'The purchase card needs `market` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }
  const avatar = useViewerAvatar();
  const [check, setCheck] = useState<PurchaseCheck>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      market.scan(planet, listing.itemSubType, listing.itemId, {
        fresh: true,
        signal: controller.signal,
      }),
      readNcgBalance(planet, avatar, avatarSource, balance),
    ]).then(([scan, balanceState]) => {
      if (controller.signal.aborted) return;
      if (!scan.ok) {
        // A stopped scan means the card is gone; there is nothing left to tell.
        if (scan.error.reason === 'CANCELLED') return;
        setCheck({ kind: 'failed', reason: scan.error.reason });
        return;
      }
      const now = scan.value.listings.find((l) => l.productId === listing.productId);
      setCheck(
        now === undefined
          ? { kind: 'gone' }
          : { kind: 'ready', listing: now, balance: balanceState },
      );
    });

    return () => controller.abort();
  }, [market, avatarSource, balance, avatar, planet, listing]);

  return check;
};
