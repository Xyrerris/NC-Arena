/**
 * Which of the selected offers can be bought from here (ADR-0044, the cart, step 2b). The sheet that
 * buys them, and the sentences it says, are `core/purchase`'s; the rules of a batch — the ceiling,
 * the money, the order, where it stops — are `core/common/purchaseBatch`'s.
 */

import type { Offer } from '@/core/collection';
import type { BatchItem } from '@/core/common/purchaseBatch';
import { toPurchaseOffer } from '@/core/common/purchasePolicy';
import { planOf, type BatchPlan } from '@/core/purchase';

import { pieceAsListed, type MarketPiece } from './marketUiState';

/**
 * The batch a selection makes. An offer is bought whole or not at all: if any of its lots is not a
 * single piece of equipment the offer is left out, since buying part of a count would leave the
 * collection no nearer.
 */
export const batchPlan = (
  chosen: readonly { readonly offer: Offer; readonly piece: MarketPiece }[],
): BatchPlan => {
  const items: BatchItem[] = [];
  let excluded = 0;
  for (const { offer, piece } of chosen) {
    if (offer.picks.some((listing) => toPurchaseOffer(listing) === null)) {
      excluded += 1;
      continue;
    }
    for (const listing of offer.picks) {
      items.push({
        key: listing.productId,
        shown: listing,
        label: pieceAsListed(piece, listing).label,
      });
    }
  }
  return planOf(items, excluded);
};
