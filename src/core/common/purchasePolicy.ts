/**
 * The rules a purchase must pass before anything is signed (ADR-0044, "Next: buying", step D).
 *
 * Pure, and strict in one direction: every rule can only *refuse*. Nothing here talks to a node or
 * a store, so each rule is a plain function of what it is given, and the order they run in is the
 * order a person would want to be told in — the offer is gone, the price moved, the account is not
 * theirs, the limit, the money.
 *
 * What each rule is for:
 *
 * - **Gone / price moved.** The card showed one offer; the buy is of the offer as the market has it
 *   *now*. A listing that vanished is gone, and one whose price differs from what was shown is
 *   refused — the person confirmed that price, not another. (A price change on the market is a new
 *   product with a new id, so a "moved" price under the same id should not happen; if it ever does,
 *   it is refused rather than trusted.)
 * - **One per offer.** A purchase is recorded before it is sent, so an offer that already has a live
 *   record in flight, sent or confirmed is not bought twice — including after a crash between the
 *   record and the send, where the safe reading is "it may have gone".
 * - **Whose key.** The key must be the account of the avatar the person plays. A different account
 *   would pay with the wrong money and receive on an avatar that is not its own.
 * - **The limit.** A per-purchase ceiling the person set. **No limit set means no purchase**: the
 *   default is the cautious one, and a cap is something to choose, not to find out about.
 * - **The money.** A balance that is not known is not "enough".
 * - **Not from oneself.** The chain refuses it after a signature and a fee; here it costs nothing.
 *
 * And the **mode**: the default is `dry-run`, which signs and sends nothing. `live` sends, and is
 * reached only by the literal word `live` having been stored by the person (`resolveMode`); anything
 * else — nothing stored, a typo, an old value — is a dry run. `LIVE_SENDING_BUILT` is the switch
 * that keeps `live` unreachable in a build that has no sending.
 */

import type { MarketListing } from './marketSource';
import type { PurchaseRecord } from './purchaseLog';
import {
  EQUIPMENT_TYPES,
  addressBytes,
  type EquipmentType,
  type PurchaseOffer,
} from './transaction';

export type PurchaseMode = 'dry-run' | 'live';

export const DEFAULT_PURCHASE_MODE: PurchaseMode = 'dry-run';

/**
 * The switch between a build that can never send and one that can. Sending now exists
 * (`TransactionSender`, `runPurchase`'s live branch, `awaitPurchase`), but this stays `false` until
 * the owner turns it on, deliberately and by hand: while it is `false`, no stored setting can make
 * `resolveMode` answer `live`, so nothing in the app can reach `stageTransaction`.
 */
export const LIVE_SENDING_BUILT = false;

/** Only the literal `live` asks for live, and only once sending exists. Anything else is a dry run. */
export const resolveMode = (
  stored: string | null,
  liveBuilt: boolean = LIVE_SENDING_BUILT,
): PurchaseMode => (stored === 'live' && liveBuilt ? 'live' : DEFAULT_PURCHASE_MODE);

/** lib9c's `ItemSubType` numbers of the equipment the market sells, as the service's route spells them. */
const EQUIPMENT_BY_SUB_TYPE: Readonly<Record<number, EquipmentType>> = {
  6: 'Weapon',
  7: 'Armor',
  8: 'Belt',
  9: 'Necklace',
  10: 'Ring',
};

/** What the purchase action names of a listing, or null when it is not equipment this layout covers. */
export function toPurchaseOffer(listing: MarketListing): PurchaseOffer | null {
  const equipmentType = EQUIPMENT_BY_SUB_TYPE[listing.itemSubType];
  if (equipmentType === undefined || !EQUIPMENT_TYPES.includes(equipmentType)) return null;
  if (listing.quantity !== 1) return null;
  return {
    productId: listing.productId,
    sellerAgentAddress: listing.sellerAgentAddress,
    sellerAvatarAddress: listing.sellerAvatarAddress,
    price: listing.price,
    legacy: listing.legacy,
    equipmentType,
    tradableId: listing.tradableId,
  };
}

export type RefusalCode =
  | 'NOT_EQUIPMENT'
  | 'GONE'
  | 'PRICE_MOVED'
  | 'ALREADY'
  | 'SELF'
  | 'WRONG_ACCOUNT'
  | 'NO_LIMIT'
  | 'OVER_LIMIT'
  | 'NO_BALANCE'
  | 'SHORT'
  | 'LOG_UNREADABLE';

export interface Refusal {
  readonly code: RefusalCode;
  readonly message: string;
}

export interface PolicyInput {
  readonly planet: string;
  /** The offer as the card showed it, and the price the person confirmed with it. */
  readonly shown: MarketListing;
  /** The same offer read again just now, or null when the market no longer has it. */
  readonly fresh: MarketListing | null;
  /** The per-purchase ceiling in NCG, or null when none is set. */
  readonly limitNcg: number | null;
  /** The account's NCG, or null when it could not be read. */
  readonly balanceNcg: number | null;
  /** The account of the key that would pay, 40 lower-case hex digits. */
  readonly keyAddress: string;
  /** The account of the avatar the person plays, as the chain spells it, or null when unknown. */
  readonly avatarAgent: string | null;
  /** The avatar that would receive the piece. */
  readonly buyerAvatar: string;
  readonly log: readonly PurchaseRecord[];
}

const refuse = (code: RefusalCode, message: string): Refusal => ({ code, message });

const sameAddress = (a: string, b: string): boolean => {
  const left = addressBytes(a);
  const right = addressBytes(b);
  return (
    left !== null &&
    right !== null &&
    left.length === right.length &&
    left.every((value, i) => value === right[i])
  );
};

/** A live record that may have reached the chain, or that did: the offer is not to be bought again. */
export const blocksPurchase = (record: PurchaseRecord): boolean =>
  record.mode === 'live' && record.status !== 'failed';

export function checkPurchase(input: PolicyInput): Refusal | null {
  const { fresh, shown } = input;

  if (fresh === null) {
    return refuse('GONE', 'This offer is no longer on the market: it was sold or withdrawn.');
  }
  if (fresh.price !== shown.price || fresh.quantity !== shown.quantity) {
    return refuse(
      'PRICE_MOVED',
      'The price is not the one you saw. Nothing was bought; look at the offer again.',
    );
  }
  if (toPurchaseOffer(fresh) === null) {
    return refuse('NOT_EQUIPMENT', 'Only single pieces of equipment can be bought so far.');
  }
  if (
    input.log.some(
      (record) =>
        record.productId === fresh.productId &&
        record.planet === input.planet &&
        blocksPurchase(record),
    )
  ) {
    return refuse(
      'ALREADY',
      'This offer has already been bought, or a purchase of it is in flight.',
    );
  }
  if (
    sameAddress(fresh.sellerAgentAddress, input.keyAddress) ||
    sameAddress(fresh.sellerAvatarAddress, input.buyerAvatar)
  ) {
    return refuse('SELF', 'This offer is yours: you cannot buy from yourself.');
  }
  if (input.avatarAgent === null) {
    return refuse('WRONG_ACCOUNT', 'It is not known whose account your avatar belongs to.');
  }
  if (!sameAddress(input.avatarAgent, input.keyAddress)) {
    return refuse('WRONG_ACCOUNT', 'This keystore is not the account of your avatar.');
  }
  if (input.limitNcg === null) {
    return refuse('NO_LIMIT', 'Set a limit per purchase first: with none, nothing can be bought.');
  }
  if (fresh.price > input.limitNcg) {
    return refuse('OVER_LIMIT', `This costs more than your limit of ${input.limitNcg} NCG.`);
  }
  if (input.balanceNcg === null) {
    return refuse('NO_BALANCE', 'Your balance could not be read, so it is not known to be enough.');
  }
  if (input.balanceNcg < fresh.price) {
    return refuse('SHORT', 'Your balance is below the price.');
  }
  return null;
}
