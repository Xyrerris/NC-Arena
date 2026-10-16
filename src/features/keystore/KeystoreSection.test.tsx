/**
 * ADR-0044, step B, from the screen: a keystore is pasted, kept as the locked file it is, opened
 * with a passphrase that is never kept, and compared with the account of the avatar the person
 * plays. Nothing buys.
 *
 * The keystore is written here with Node's crypto (a few PBKDF2 rounds), not by the code under
 * test. jest-expo runs at fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type AvatarSource } from '@/core/common';
import { ArenaDataProvider, type KeystoreStore, type RosterRepository } from '@/core/data';
import type { PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { KeystoreSection } from './KeystoreSection';
import { WRONG_NOTE } from './keystoreUiState';

const PRIVATE_KEY = '7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d';
const ADDRESS = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';
const AVATAR = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
} as const;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const draft = (name: string): PlayerDraft => ({
  name,
  level: 400,
  gameCode: '',
  combatPower: 900,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const writeKeystore = (passphrase: string, claimed = ADDRESS): string => {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = pbkdf2Sync(passphrase, salt, 10, 32, 'sha256');
  const cipher = createCipheriv('aes-128-ctr', derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(PRIVATE_KEY, 'hex')),
    cipher.final(),
  ]);
  const mac = keccak_256(Buffer.concat([derived.subarray(16, 32), ciphertext]));
  return JSON.stringify({
    version: 3,
    address: claimed,
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: { iv: iv.toString('hex') },
      ciphertext: ciphertext.toString('hex'),
      kdf: 'pbkdf2',
      kdfparams: { c: 10, dklen: 32, prf: 'hmac-sha256', salt: salt.toString('hex') },
      mac: Buffer.from(mac).toString('hex'),
    },
  });
};

describe('KeystoreSection', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let kept: string | null;
  let store: KeystoreStore;
  let avatarSource: AvatarSource | undefined;

  const agent = (agentAddress: string): AvatarSource => ({
    name: 'test',
    readAvatar: jest.fn(() => Promise.resolve(ok({ name: 'Xyrerris', level: 400, agentAddress }))),
  });

  const wrapper = () =>
    function Harness({ children }: { children: ReactNode }) {
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ArenaDataProvider
            value={{
              repository,
              useLiveData: createStubLiveData(),
              avatarSource,
              keystore: store,
            }}
          >
            {children}
          </ArenaDataProvider>
        </SafeAreaProvider>
      );
    };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
    kept = null;
    store = {
      get: () => kept,
      set: (json) => {
        kept = json;
      },
      clear: () => {
        kept = null;
      },
    };
    avatarSource = undefined;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const withAvatar = (agentAddress: string): void => {
    const me = repository.createPlayer(draft('Xyrerris'));
    if (!me.ok) throw new Error('fixture: the player was refused');
    expect(repository.setViewerId(me.value.id).ok).toBe(true);
    expect(repository.setViewerAvatar(AVATAR).ok).toBe(true);
    avatarSource = agent(agentAddress);
  };

  const type = async (testID: string, value: string): Promise<void> => {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(testID), value);
    });
  };
  const press = async (testID: string): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };
  const text = (testID: string): unknown => screen.getByTestId(testID).props.children;
  const importIt = async (pasted: string): Promise<void> => {
    await type('keystore-text', pasted);
    await press('keystore-save');
  };
  const test = async (passphrase: string): Promise<void> => {
    await type('keystore-passphrase', passphrase);
    await press('keystore-test');
  };

  it('refuses text that is not a keystore, says why, and keeps nothing', async () => {
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await importIt('this is not json');

    expect(text('keystore-text-error')).toBe('This is not JSON. A keystore is a JSON file.');
    expect(kept).toBeNull();
    expect(screen.queryByTestId('keystore-stored')).toBeNull();
  });

  it('keeps a pasted keystore as it came, clears the box, and asks for the passphrase', async () => {
    await render(<KeystoreSection />, { wrapper: wrapper() });
    const pasted = writeKeystore('hunter2');

    await importIt(`  ${pasted}\n`);

    expect(kept).toBe(pasted);
    expect(text('keystore-stored')).toBe('Saved keystore · 0x008a…786b');
    expect(screen.queryByTestId('keystore-text')).toBeNull();
    expect(screen.getByTestId('keystore-passphrase').props.secureTextEntry).toBe(true);
  });

  it('shows a keystore already on the device without importing again', async () => {
    kept = writeKeystore('hunter2');

    await render(<KeystoreSection />, { wrapper: wrapper() });

    expect(screen.getByTestId('keystore-stored')).toBeTruthy();
    expect(screen.queryByTestId('keystore-save')).toBeNull();
  });

  it('says a wrong passphrase is wrong, and empties the field either way', async () => {
    kept = writeKeystore('hunter2');
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter3');

    await waitFor(() => expect(text('keystore-wrong')).toBe(WRONG_NOTE));
    expect(screen.getByTestId('keystore-passphrase').props.value).toBe('');
  });

  it("tells that it opens and is the avatar's account, whatever the spelling of the address", async () => {
    kept = writeKeystore('hunter2');
    withAvatar(`0x${ADDRESS.toUpperCase()}`);
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter2');

    await waitFor(() =>
      expect(text('keystore-opened')).toBe(
        'The passphrase opens it. The key is 0x008a…786b, the account of your avatar.',
      ),
    );
    expect(screen.getByTestId('keystore-passphrase').props.value).toBe('');
  });

  it("says plainly when it opens but is another account than the avatar's", async () => {
    kept = writeKeystore('hunter2');
    withAvatar('0xD7E4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1f2e');
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter2');

    await waitFor(() => expect(String(text('keystore-opened'))).toContain('not the account'));
  });

  it('opens it without an avatar to compare, and says the comparison was not made', async () => {
    kept = writeKeystore('hunter2');
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter2');

    await waitFor(() => expect(String(text('keystore-opened'))).toContain('Say which avatar'));
  });

  it('says so when the account of the avatar cannot be read', async () => {
    kept = writeKeystore('hunter2');
    withAvatar('0x0');
    avatarSource = {
      name: 'test',
      readAvatar: jest.fn(() => Promise.resolve(err({ reason: 'OFFLINE' as const, message: 'x' }))),
    };
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter2');

    await waitFor(() => expect(String(text('keystore-opened'))).toContain('could not be reached'));
  });

  it('notes when the file names another address than the key inside it', async () => {
    kept = writeKeystore('hunter2', 'ffffffffffffffffffffffffffffffffffffffff');
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await test('hunter2');

    await waitFor(() => expect(screen.getByTestId('keystore-claimed')).toBeTruthy());
  });

  it('removes the keystore and says nothing of it is left', async () => {
    kept = writeKeystore('hunter2');
    await render(<KeystoreSection />, { wrapper: wrapper() });

    await press('keystore-remove');

    expect(kept).toBeNull();
    expect(screen.getByTestId('keystore-removed')).toBeTruthy();
    expect(screen.getByTestId('keystore-text')).toBeTruthy();
  });
});
