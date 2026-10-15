/**
 * What the purchase card says, as plain values (ADR-0044, "Next: buying", step A).
 *
 * The card is the last thing between a person and a purchase that does not exist yet: it shows the
 * offer as it is **now** (re-read, not the list's minute-old copy), the balance, and what the buy
 * would leave. Nothing here signs or sends anything, and the card says so on every state that could
 * be mistaken for a button to press.
 *
 * Two rules the wording keeps. A balance that could not be read is never shown as zero: "you are
 * short" would be a claim about the person's money that nothing supports. And a listing that is no
 * longer there is a different state from one that could not be checked: the first is an answer, the
 * second is not.
 */

import type { MarketListing } from '@/core/common';

import { askingPrice, formatNcg, type MarketPiece } from './marketUiState';
import { collectionStrings as words } from './strings';

export type BalanceState =
  | { readonly kind: 'known'; readonly ncg: number }
  /** `no-avatar`: no account to ask about. `offline` / `failed`: the node did not answer. */
  | { readonly kind: 'unknown'; readonly why: 'no-avatar' | 'offline' | 'failed' };

export type PurchaseCheck =
  | { readonly kind: 'checking' }
  /** The listing is no longer on the market: sold or withdrawn since the list was read. */
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly reason: 'OFFLINE' | 'FAILED' }
  | {
      readonly kind: 'ready';
      /** The listing as the market has it now. */
      readonly listing: MarketListing;
      readonly balance: BalanceState;
    };

export interface PurchaseCardUi {
  readonly status: 'checking' | 'gone' | 'failed' | 'ready';
  /** One sentence for the states that have no offer to show. */
  readonly message: string | null;
  /** Set when `status` is `ready`. */
  readonly offer: {
    readonly sentence: string;
    readonly price: string;
    readonly detail: string | null;
    /** The collection asks for more than this lot holds, or the lot holds more than it asks. */
    readonly countNote: string | null;
  } | null;
  readonly balanceLine: string | null;
  readonly afterLine: string | null;
  /** `short` only when the balance is known and below the price. */
  readonly enough: 'yes' | 'short' | 'unknown';
}

const hundredths = (ncg: number): number => Math.round(ncg * 100);

const balanceMessage = (balance: BalanceState): string =>
  balance.kind === 'known'
    ? words.purchaseBalance(formatNcg(balance.ncg))
    : balance.why === 'no-avatar'
      ? words.purchaseBalanceNoAvatar
      : balance.why === 'offline'
        ? words.purchaseBalanceOffline
        : words.purchaseBalanceFailed;

export const toPurchaseCardUi = (check: PurchaseCheck, piece: MarketPiece): PurchaseCardUi => {
  const empty = { offer: null, balanceLine: null, afterLine: null, enough: 'unknown' as const };
  switch (check.kind) {
    case 'checking':
      return { ...empty, status: 'checking', message: words.purchaseChecking };
    case 'gone':
      return { ...empty, status: 'gone', message: words.purchaseGone };
    case 'failed':
      return {
        ...empty,
        status: 'failed',
        message:
          check.reason === 'OFFLINE' ? words.purchaseFailedOffline : words.purchaseFailedOther,
      };
    case 'ready': {
      const { listing, balance } = check;
      const total = formatNcg(listing.price);
      const lot = listing.quantity > 1;
      let enough: PurchaseCardUi['enough'] = 'unknown';
      let afterLine: string | null = null;
      if (balance.kind === 'known') {
        const left = hundredths(balance.ncg) - hundredths(listing.price);
        enough = left >= 0 ? 'yes' : 'short';
        afterLine =
          left >= 0
            ? words.purchaseLeft(formatNcg(left / 100))
            : words.purchaseShort(formatNcg(-left / 100));
      }
      const needs = piece.count;
      return {
        status: 'ready',
        message: null,
        offer: {
          sentence: words.purchaseWouldBuy(
            lot ? `${listing.quantity} × ${piece.label}` : piece.label,
            total,
          ),
          price: askingPrice(listing),
          detail: lot ? words.listingLot(String(listing.quantity), total) : null,
          countNote: needs > 1 || lot ? words.purchaseCount(listing.quantity, needs) : null,
        },
        balanceLine: balanceMessage(balance),
        afterLine,
        enough,
      };
    }
  }
};
