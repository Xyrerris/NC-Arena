/**
 * What the purchase card says when the person tries to buy (ADR-0044, step D): the button's wording
 * and every outcome of a dry run, as plain values.
 *
 * It says one thing on every state, because it is the one thing that is true of all of them: this is
 * a dry run. The offer is checked and a transaction is signed here, and **nothing is sent**.
 */

import type { PurchaseOutcome } from '@/core/common/purchaseFlow';

export const TRY_LABEL = 'TRY BUYING (DRY RUN)';
export const PASSPHRASE_LABEL = 'Keystore passphrase';
export const PASSPHRASE_HINT = 'Used once to sign, then forgotten. It is never saved.';
export const NO_KEYSTORE_NOTE = 'Import your keystore on the You tab to try this.';
export const DRY_RUN_NOTE = 'A dry run: checked and signed here, and nothing is sent.';
export const WORKING_NOTE = 'Checking and signing… this can take a few seconds.';
export const WRONG_NOTE = 'Wrong passphrase, or the keystore was changed.';
export const UNAVAILABLE_NOTE =
  'This build cannot try a purchase: the node or the account is missing.';

export type AttemptState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'problem'; readonly message: string }
  | { readonly kind: 'done'; readonly outcome: PurchaseOutcome };

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
      return { tone: 'negative', text: 'Buying for real is not available yet.' };
    case 'failed':
      return {
        tone: 'negative',
        text: `Stopped at "${outcome.error.stage}": ${outcome.error.message}`,
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
  }
}
