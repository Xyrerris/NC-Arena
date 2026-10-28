/**
 * What the purchase card says when the person tries to buy (ADR-0044, step D): the buttons' wording
 * and every outcome, as plain values.
 *
 * A dry run says one thing on every state: the offer is checked and a transaction is signed here, and
 * **nothing is sent**. A real purchase says the opposite just as plainly — what it will cost, that it
 * cannot be undone — and, when the answer is doubtful, says so rather than guessing: a purchase whose
 * fate is not known is never described as failed, because the person might then buy the piece again.
 */

import type { AwaitOutcome, PurchaseOutcome } from '@/core/common/purchaseFlow';

export const TRY_LABEL = 'TRY BUYING (DRY RUN)';
export const PASSPHRASE_LABEL = 'Keystore passphrase';
export const PASSPHRASE_HINT = 'Used once to sign, then forgotten. It is never saved.';
export const NO_KEYSTORE_NOTE = 'Import your keystore on the You tab to try this.';
export const DRY_RUN_NOTE = 'A dry run: checked and signed here, and nothing is sent.';
export const WORKING_NOTE = 'Checking and signing… this can take a few seconds.';
export const WRONG_NOTE = 'Wrong passphrase, or the keystore was changed.';
export const UNAVAILABLE_NOTE =
  'This build cannot try a purchase: the node or the account is missing.';

export const BUY_LABEL = (price: string): string => `BUY FOR REAL (${price} NCG)`;
export const CONFIRM_LABEL = (price: string): string => `CONFIRM AND PAY ${price} NCG`;
export const CANCEL_LABEL = 'CANCEL';
export const CONFIRM_WARNING = (what: string, price: string): string =>
  `You are about to pay ${price} NCG for ${what}. The payment cannot be undone once it is sent.`;
export const LIVE_NOTE = 'Real purchase: this spends NCG from the account of your keystore.';

export type AttemptState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'problem'; readonly message: string }
  | { readonly kind: 'done'; readonly outcome: PurchaseOutcome }
  /** Sent (or possibly sent), and being watched until the chain decides. */
  | {
      readonly kind: 'waiting';
      readonly transactionId: string;
      readonly uncertain: boolean;
    }
  | {
      readonly kind: 'settled';
      readonly transactionId: string;
      readonly outcome: AwaitOutcome;
    };

export interface AttemptUi {
  readonly tone: 'subtle' | 'accent' | 'negative';
  readonly text: string | null;
}

/** `0x3f1a2b…d4e5`: enough to recognise a transaction id on a phone. */
export const shortTransactionId = (id: string): string =>
  id.length <= 12 ? `0x${id}` : `0x${id.slice(0, 6)}…${id.slice(-4)}`;

const describeOutcome = (outcome: PurchaseOutcome): AttemptUi => {
  switch (outcome.kind) {
    case 'refused':
      return { tone: 'negative', text: outcome.refusal.message };
    case 'live-unavailable':
      return { tone: 'negative', text: 'Buying for real is not available in this build.' };
    case 'failed':
      return {
        tone: 'negative',
        text: `Stopped at "${outcome.error.stage}": ${outcome.error.message}`,
      };
    case 'not-accepted':
      return {
        tone: 'negative',
        text: `The node did not accept it, so nothing was bought: ${outcome.message}`,
      };
    case 'sent':
      return {
        tone: 'subtle',
        text: `Sent (${shortTransactionId(outcome.transactionId)}). Waiting for the chain…`,
      };
    case 'dry-run':
      return {
        tone: 'accent',
        text:
          'Checked and signed, nothing sent. The transaction would have the id ' +
          `${shortTransactionId(outcome.run.transactionId)}.`,
      };
  }
};

const describeSettled = (transactionId: string, outcome: AwaitOutcome): AttemptUi => {
  const id = shortTransactionId(transactionId);
  switch (outcome.kind) {
    case 'confirmed':
      return {
        tone: 'accent',
        text: `Bought. The chain executed it (transaction ${id}). The piece is in your avatar's inventory.`,
      };
    case 'failed':
      return {
        tone: 'negative',
        text: `The chain refused it, so nothing was bought: ${outcome.reason}`,
      };
    case 'unknown':
      return {
        tone: 'negative',
        text:
          `${outcome.message} Do not buy this piece again until you have looked at your ` +
          `inventory and your balance (transaction ${id}).`,
      };
  }
};

export function describeAttempt(state: AttemptState): AttemptUi {
  switch (state.kind) {
    case 'idle':
      return { tone: 'subtle', text: null };
    case 'working':
      return { tone: 'subtle', text: WORKING_NOTE };
    case 'wrong':
      return { tone: 'negative', text: WRONG_NOTE };
    case 'problem':
      return { tone: 'negative', text: state.message };
    case 'done':
      return describeOutcome(state.outcome);
    case 'waiting':
      return {
        tone: 'subtle',
        text: state.uncertain
          ? `The send got no clear answer, so it may have gone through. Waiting for the chain (${shortTransactionId(state.transactionId)})…`
          : `Sent (${shortTransactionId(state.transactionId)}). Waiting for the chain…`,
      };
    case 'settled':
      return describeSettled(state.transactionId, state.outcome);
  }
}
