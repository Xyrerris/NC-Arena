/**
 * What the keystore block says: how an account is shortened, and what an opened keystore means for
 * buying, for each way the comparison with the avatar's account can come out.
 */

import { describeOpened, shortAgent, storedLine } from './keystoreUiState';

const KEY = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';
const OTHER = '0xD7E4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1f2e';

describe('shortAgent', () => {
  it('keeps the ends of an account, with or without its prefix, in lower case', () => {
    expect(shortAgent(KEY)).toBe('0x008a…786b');
    expect(shortAgent(`0x${KEY.toUpperCase()}`)).toBe('0x008a…786b');
    expect(shortAgent('0xABCD')).toBe('0xabcd');
  });
});

describe('storedLine', () => {
  it('names the address the file claims, or just says a keystore is saved', () => {
    expect(storedLine(KEY)).toBe('Saved keystore · 0x008a…786b');
    expect(storedLine(null)).toBe('Saved keystore');
  });
});

describe('describeOpened', () => {
  it("says the key is the avatar's account when they match", () => {
    expect(describeOpened(KEY, { kind: 'matches' })).toBe(
      'The passphrase opens it. The key is 0x008a…786b, the account of your avatar.',
    );
  });

  it('says it opens but is not the avatar’s account, naming both, when they differ', () => {
    const text = describeOpened(KEY, { kind: 'differs', avatarAgent: OTHER });

    expect(text).toContain('0x008a…786b');
    expect(text).toContain('0xd7e4…1f2e');
    expect(text).toContain('not the account of your avatar');
    expect(text).toContain('could not buy');
  });

  it('says why it could not compare, in three different ways', () => {
    const none = describeOpened(KEY, { kind: 'unchecked', why: 'no-avatar' });
    const offline = describeOpened(KEY, { kind: 'unchecked', why: 'offline' });
    const failed = describeOpened(KEY, { kind: 'unchecked', why: 'failed' });

    expect(none).toContain('Say which avatar you play');
    expect(offline).toContain('could not be reached');
    expect(failed).toContain('could not be read');
    for (const text of [none, offline, failed]) {
      expect(text.startsWith('The passphrase opens it.')).toBe(true);
    }
  });
});
