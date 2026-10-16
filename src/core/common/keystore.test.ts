/**
 * Opening a keystore (ADR-0044, step B). The two reference vectors are the Web3 Secret Storage
 * spec's own (password `testpassword`), so they test against the format and not against this code;
 * the other keystores are built here with Node's `crypto`, an implementation of PBKDF2 and AES that
 * shares nothing with the one under test, to cover the shapes the vectors do not (a short
 * KDF, a different key).
 */

import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

import { keccak_256 } from '@noble/hashes/sha3.js';

import {
  MAX_PBKDF2_ROUNDS,
  addressOfKey,
  normaliseAgentAddress,
  openKeystore,
  parseKeystore,
  proveKeystore,
} from './keystore';

const PRIVATE_KEY = '7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d';
const ADDRESS = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';

const SPEC_PBKDF2 = JSON.stringify({
  crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: '6087dab2f9fdbbfaddc31a909735c1e6' },
    ciphertext: '5318b4d5bcd28de64ee5559e671353e16f075ecae9f99c7a79a38af5f869aa46',
    kdf: 'pbkdf2',
    kdfparams: {
      c: 262144,
      dklen: 32,
      prf: 'hmac-sha256',
      salt: 'ae3cd4e7013836a3df6bd7241b12db061dbe2c6785853cce422d148a624ce0bd',
    },
    mac: '517ead924a9d0dc3124507e3393d175ce3ff7c1e96529c6c555ce9e51205e9b2',
  },
  id: '3198bc9c-6672-5ab3-d995-4942343ae5b6',
  version: 3,
});

const SPEC_SCRYPT = JSON.stringify({
  crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: '83dbcc02d8ccb40e466191a123791e0e' },
    ciphertext: 'd172bf743a674da9cdad04534d56926ef8358534d458fffccd4e6ad2fbde479c',
    kdf: 'scrypt',
    kdfparams: {
      dklen: 32,
      n: 262144,
      r: 1,
      p: 8,
      salt: 'ab0c7876052600dd703518d6fc3fe8984592145b591fc8fb5c6d43190334ba19',
    },
    mac: '2103ac29920d71da29f15d75b4a16dbe95cfd7ff8faea1056c33131d846e3097',
  },
  id: '3198bc9c-6672-5ab3-d995-4942343ae5b6',
  version: 3,
});

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/** A keystore written by Node's crypto, the way Libplanet writes one (PBKDF2, a few rounds). */
const writeKeystore = (privateKeyHex: string, passphrase: string, rounds = 10): string => {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = pbkdf2Sync(passphrase, salt, rounds, 32, 'sha256');
  const cipher = createCipheriv('aes-128-ctr', derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKeyHex, 'hex')),
    cipher.final(),
  ]);
  const mac = keccak_256(Buffer.concat([derived.subarray(16, 32), ciphertext]));
  return JSON.stringify({
    version: 3,
    id: 'f0f0f0f0-0000-4000-8000-000000000000',
    address: 'ABCDEF',
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: { iv: iv.toString('hex') },
      ciphertext: ciphertext.toString('hex'),
      kdf: 'pbkdf2',
      kdfparams: { c: rounds, dklen: 32, prf: 'hmac-sha256', salt: salt.toString('hex') },
      mac: hex(mac),
    },
  });
};

const parsed = (text: string) => {
  const result = parseKeystore(text);
  if (!result.ok) throw new Error(`fixture: ${result.error.message}`);
  return result.value;
};

describe('the spec vectors', () => {
  it('opens the PBKDF2 keystore with its passphrase and finds the key and its address', async () => {
    const opened = await openKeystore(parsed(SPEC_PBKDF2), 'testpassword');

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(hex(opened.value.privateKey)).toBe(PRIVATE_KEY);
    expect(opened.value.address).toBe(ADDRESS);
  });

  it('opens the scrypt keystore too', async () => {
    const opened = await openKeystore(parsed(SPEC_SCRYPT), 'testpassword');

    expect(opened.ok && hex(opened.value.privateKey)).toBe(PRIVATE_KEY);
  });

  it('refuses the wrong passphrase before decrypting anything', async () => {
    const result = await openKeystore(parsed(SPEC_PBKDF2), 'testpassword ');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'WRONG_PASSPHRASE',
        message: 'Wrong passphrase, or the keystore was changed.',
      },
    });
  });
});

describe('proveKeystore', () => {
  it('hands back the address only', async () => {
    const keystore = parsed(writeKeystore(PRIVATE_KEY, 'pässphrase ✓'));

    const proof = await proveKeystore(keystore, 'pässphrase ✓');

    expect(proof).toEqual({ ok: true, value: ADDRESS });
  });

  it('reports a wrong passphrase, and a changed file, the same way', async () => {
    const text = writeKeystore(PRIVATE_KEY, 'right');
    expect(await proveKeystore(parsed(text), 'wrong')).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PASSPHRASE' },
    });

    const tampered = JSON.parse(text) as { crypto: { ciphertext: string } };
    tampered.crypto.ciphertext = tampered.crypto.ciphertext.replace(/^../, (b) =>
      b === '00' ? '01' : '00',
    );
    expect(await proveKeystore(parsed(JSON.stringify(tampered)), 'right')).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PASSPHRASE' },
    });
  });

  it('refuses a key that is not a valid secp256k1 secret, even when the MAC is right', async () => {
    const zero = '00'.repeat(32);

    expect(await proveKeystore(parsed(writeKeystore(zero, 'p')), 'p')).toMatchObject({
      ok: false,
      error: { code: 'BAD_KEY' },
    });
  });
});

describe('parseKeystore', () => {
  it('keeps the address the file claims, as written, and the text it came from', () => {
    const text = writeKeystore(PRIVATE_KEY, 'p');
    const keystore = parsed(text);

    expect(keystore.claimedAddress).toBe('ABCDEF');
    expect(keystore.source).toBe(text);
  });

  it('accepts the capitalised Crypto key some writers use', () => {
    const file = JSON.parse(SPEC_PBKDF2) as { crypto: unknown };
    const renamed = JSON.stringify({ version: 3, Crypto: file.crypto });

    expect(parseKeystore(renamed).ok).toBe(true);
  });

  it('says what it is when it is not a keystore at all', () => {
    expect(parseKeystore('not json')).toMatchObject({ ok: false, error: { code: 'MALFORMED' } });
    expect(parseKeystore('{"version":2}')).toMatchObject({
      ok: false,
      error: { code: 'MALFORMED' },
    });
    expect(parseKeystore('[]')).toMatchObject({ ok: false, error: { code: 'MALFORMED' } });
  });

  it('names another cipher or key derivation instead of calling the file broken', () => {
    const file = JSON.parse(SPEC_PBKDF2) as { crypto: Record<string, unknown> };
    const cipher = JSON.stringify({
      version: 3,
      crypto: { ...file.crypto, cipher: 'aes-256-gcm' },
    });
    const kdf = JSON.stringify({ version: 3, crypto: { ...file.crypto, kdf: 'argon2' } });

    expect(parseKeystore(cipher)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });
    expect(parseKeystore(kdf)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });
  });

  it('refuses a key derivation too heavy for a phone, instead of trying it', () => {
    const file = JSON.parse(SPEC_SCRYPT) as {
      crypto: { kdfparams: Record<string, unknown> } & Record<string, unknown>;
    };
    const heavy = JSON.stringify({
      version: 3,
      crypto: { ...file.crypto, kdfparams: { ...file.crypto.kdfparams, r: 8 } },
    });
    const rounds = JSON.parse(SPEC_PBKDF2) as {
      crypto: { kdfparams: Record<string, unknown> } & Record<string, unknown>;
    };
    const slow = JSON.stringify({
      version: 3,
      crypto: {
        ...rounds.crypto,
        kdfparams: { ...rounds.crypto.kdfparams, c: MAX_PBKDF2_ROUNDS + 1 },
      },
    });

    expect(parseKeystore(heavy)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });
    expect(parseKeystore(slow)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });
  });
});

describe('addresses', () => {
  it('derives the address of a key, and compares spellings of an address as one', () => {
    expect(addressOfKey(Uint8Array.from(Buffer.from(PRIVATE_KEY, 'hex')))).toBe(ADDRESS);

    expect(normaliseAgentAddress(`0x${ADDRESS.toUpperCase()}`)).toBe(ADDRESS);
    expect(normaliseAgentAddress(` ${ADDRESS} `)).toBe(ADDRESS);
    expect(normaliseAgentAddress('0x1234')).toBeNull();
    expect(normaliseAgentAddress(`${ADDRESS}zz`)).toBeNull();
  });
});
