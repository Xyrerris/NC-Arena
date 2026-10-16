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
