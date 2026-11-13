/**
 * Every word the keystore block says, and how a proof reads (ADR-0044, "Next: buying", step B).
 * Plain values, so the sentences are testable without rendering.
 *
 * Two promises sit in this wording and the block must keep both: the passphrase is never saved,
 * and nothing here can spend. A person who pastes a keystore into an app should be told, in the
 * same place, what the app will and will not do with it.
 */

export const SECTION_TITLE = 'Wallet keystore';
export const SECTION_HINT =
  'Paste your Nine Chronicles keystore (the JSON file) so the app can check that it is yours. ' +
  'The passphrase is never saved, and nothing here can spend: buying is not built yet.';

export const IMPORT_LABEL = 'Keystore text';
export const IMPORT_HINT = 'Open the file in any text editor, copy everything, paste it here.';
export const IMPORT_BUTTON = 'SAVE KEYSTORE';
export const REMOVE_BUTTON = 'REMOVE KEYSTORE';
export const REMOVE_NOTE = 'Removed. Nothing of the keystore is left on this device.';

export const PASSPHRASE_LABEL = 'Passphrase';
export const PASSPHRASE_HINT = 'Typed for this check only. It is not saved.';
export const TEST_BUTTON = 'TEST PASSPHRASE';
export const PROVING_NOTE = 'Opening the keystore… this can take a few seconds.';

export const SAVED_NOTE = 'Saved. It is still locked: the next step is to test the passphrase.';
export const WRONG_NOTE = 'Wrong passphrase, or the keystore was changed.';
export const CLAIMED_DIFFERS_NOTE =
  'The file names another address than the key inside it. The key is what counts.';

export const MODE_NOTE =
  'Real purchases are switched off in this build: every purchase is a dry run, checked and signed here, and nothing is sent.';
export const MODE_ON_LINE = 'Real purchases: ON. A purchase spends NCG from your account.';
export const MODE_OFF_LINE = 'Real purchases: OFF. A purchase is a dry run and nothing is sent.';
export const MODE_TURN_ON = 'TURN ON REAL PURCHASES';
export const MODE_TURN_OFF = 'TURN OFF REAL PURCHASES';
export const MODE_CONFIRM_ON = 'YES, TURN THEM ON';
export const MODE_CANCEL = 'CANCEL';
export const MODE_WARNING =
  'With real purchases on, confirming a purchase pays NCG from your account and cannot be undone. ' +
  'Set a low limit first, and try a cheap piece.';

export const LIMIT_LABEL = 'Limit per purchase (NCG)';
export const LIMIT_HINT =
  'Nothing that costs more is bought. With no limit, nothing can be bought.';
export const LIMIT_SAVE = 'SAVE LIMIT';
export const LIMIT_REMOVE = 'REMOVE LIMIT';
export const LIMIT_ERROR = 'Enter an amount above 0, with at most two decimals.';

/** The most a limit may be, so a slip of the finger is not "a million". */
export const MAX_LIMIT_NCG = 100_000;

/**
 * The typed limit as a number, or null when it is not an amount above zero with at most two decimals.
 * Either `,` or `.` is the decimal mark: the app writes commas (ADR-0025) and a keyboard may not.
 */
export const parseLimit = (text: string): number | null => {
  const clean = text.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean.replace(',', '.'));
  return value > 0 && value <= MAX_LIMIT_NCG ? value : null;
};

export const limitLine = (limit: number | null): string =>
  limit === null
    ? 'No limit set: nothing can be bought.'
    : `Limit: ${String(limit).replace('.', ',')} NCG per purchase`;

export const BATCH_LIMIT_LABEL = 'Limit for a whole batch (NCG)';
export const BATCH_LIMIT_HINT =
  'The most a selection of offers may cost together. With none, no selection can be bought.';

export const batchLimitLine = (limit: number | null): string =>
  limit === null
    ? 'No batch limit set: no selection can be bought.'
    : `Batch limit: ${String(limit).replace('.', ',')} NCG for all together`;

export const UNSETTLED_TITLE = 'Purchases not settled';
export const UNSETTLED_HINT =
  'A real purchase whose end is not known keeps its offer blocked, so it is not bought twice. ' +
  'Look at your inventory and your balance; only if you are sure, clear it.';
export const UNSETTLED_CLEAR = 'I CHECKED: CLEAR IT';
export const UNSETTLED_CLEAR_A11Y = (what: string): string =>
  `Clear the unsettled purchase of ${what}, after checking the inventory and the balance`;

/** One unsettled purchase as a line: what, how much, its state, and the note the flow left. */
export const unsettledLine = (record: {
  readonly itemId: number;
  readonly price: number;
  readonly status: string;
  readonly note: string | null;
}): string =>
  `${record.itemId} · ${String(record.price).replace('.', ',')} NCG · ${record.status}` +
  (record.note === null ? '' : ` · ${record.note}`);

/** `0x1a2b…c3d4`: enough to tell accounts apart on a phone. */
export const shortAgent = (address: string): string => {
  const bare = address.replace(/^0x/i, '').toLowerCase();
  return bare.length <= 10 ? `0x${bare}` : `0x${bare.slice(0, 4)}…${bare.slice(-4)}`;
};

export const storedLine = (claimedAddress: string | null): string =>
  claimedAddress === null ? 'Saved keystore' : `Saved keystore · ${shortAgent(claimedAddress)}`;

export type Comparison =
  | { readonly kind: 'matches' }
  | { readonly kind: 'differs'; readonly avatarAgent: string }
  | { readonly kind: 'unchecked'; readonly why: 'no-avatar' | 'offline' | 'failed' };

/**
 * What an opened keystore means for buying: whether its key is the account of the avatar the
 * person plays. Only a match lets a later step buy for that avatar; a different account is not an
 * error, but it is not "yours" either, and the sentence says so.
 */
export const describeOpened = (address: string, comparison: Comparison): string => {
  const key = shortAgent(address);
  switch (comparison.kind) {
    case 'matches':
      return `The passphrase opens it. The key is ${key}, the account of your avatar.`;
    case 'differs':
      return (
        `The passphrase opens it, but the key is ${key}, not the account of your avatar ` +
        `(${shortAgent(comparison.avatarAgent)}). It could not buy for this avatar.`
      );
    case 'unchecked':
      return (
        `The passphrase opens it. The key is ${key}. ` +
        (comparison.why === 'no-avatar'
          ? 'Say which avatar you play, above, to compare it with your account.'
          : comparison.why === 'offline'
            ? 'Your avatar’s account could not be read to compare: the chain could not be reached.'
            : 'Your avatar’s account could not be read to compare it.')
      );
  }
};
