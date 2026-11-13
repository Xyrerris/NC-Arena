/**
 * Reading a Nine Chronicles keystore: Web3 Secret Storage v3, the JSON file Libplanet writes
 * (ADR-0044, "Next: buying", step B).
 *
 * A keystore holds an account's private key encrypted with a passphrase. This file opens one and
 * answers a single question the purchase flow rests on: **which address does this key belong to?**
 * It never stores a passphrase or a key, and it signs nothing. The caller that gets a key out
 * (`openKeystore`) owns the bytes and must `fill(0)` them; `proveKeystore` is the version that
 * does it for them and hands back only the address.
 *
 * The format (the public spec, and what Libplanet's `Web3KeyStore` writes):
 *
 * - `kdf` turns the passphrase into a 32-byte key: `pbkdf2` (HMAC-SHA256; Libplanet's default) or
 *   `scrypt`.
 * - The first 16 bytes of it decrypt the ciphertext with AES-128-CTR; the last 16, prepended to the
 *   ciphertext and hashed with **Keccak-256**, must equal `mac` — which is how a wrong passphrase
 *   is told from a right one *before* anything is decrypted.
 * - An address is the last 20 bytes of Keccak-256 over the 64-byte uncompressed public key.
 *
 * Checked against the spec's own test vectors (password `testpassword`), not against a keystore
 * this code wrote. Run on a phone the KDF is the cost: a PBKDF2 of 10,240 rounds is a fraction of
 * a second, while the spec's scrypt default (n = 262,144, r = 8) needs 256 MiB of memory and is
 * refused here (`UNSUPPORTED`) rather than left to take the app down. The async KDFs yield between
 * blocks, so a long derivation does not freeze the screen.
 */

import { ctr } from '@noble/ciphers/aes.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { z } from 'zod';

import { err, ok, type Result } from './result';

export type KeystoreErrorCode =
  /** Not JSON, or JSON that is not a version-3 keystore. */
  | 'MALFORMED'
  /** A well-formed keystore this code will not open: another cipher or KDF, or one too heavy. */
  | 'UNSUPPORTED'
  /** The MAC does not match: the passphrase is wrong, or the file was altered. */
  | 'WRONG_PASSPHRASE'
  /** It opened, and what came out is not a usable private key. */
  | 'BAD_KEY';

export interface KeystoreError {
  readonly code: KeystoreErrorCode;
  readonly message: string;
}

const hexBytes = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{2})+$/, 'not hexadecimal')
  .transform((hex) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)));

const positive = z.number().int().positive().safe();

const kdfSchema = z.discriminatedUnion('kdf', [
  z.object({
    kdf: z.literal('pbkdf2'),
    kdfparams: z.object({
      c: positive,
      dklen: z.literal(32),
      prf: z.literal('hmac-sha256'),
      salt: hexBytes,
    }),
  }),
  z.object({
    kdf: z.literal('scrypt'),
    kdfparams: z.object({
      n: positive,
      r: positive,
      p: positive,
      dklen: z.literal(32),
      salt: hexBytes,
    }),
  }),
]);

const cryptoSchema = z
  .object({
    cipher: z.literal('aes-128-ctr'),
    cipherparams: z.object({ iv: hexBytes.refine((bytes) => bytes.length === 16) }),
    ciphertext: hexBytes,
    mac: hexBytes,
  })
  .and(kdfSchema);

const fileSchema = z
  .object({
    version: z.literal(3),
    id: z.string().optional(),
    address: z.string().optional(),
    crypto: cryptoSchema.optional(),
    // Some writers capitalise it (the spec's older drafts did).
    Crypto: cryptoSchema.optional(),
  })
  .refine((file) => file.crypto !== undefined || file.Crypto !== undefined);

export interface Keystore {
  /** The address the file *says* it holds, as written. Not proof: only opening it is. */
  readonly claimedAddress: string | null;
  readonly crypto: z.output<typeof cryptoSchema>;
  /** The text as imported, which is what is kept: re-parsing it later gives back the same keystore. */
  readonly source: string;
}

/**
 * The most memory a scrypt derivation may ask for (128 · n · r bytes). The spec's usual n = 262,144,
 * r = 8 is 256 MiB; a phone's JS engine does not have that to give.
 */
export const MAX_SCRYPT_BYTES = 64 * 1024 * 1024;
/** Rounds of PBKDF2 past which the file is refused rather than allowed to spin the device. */
export const MAX_PBKDF2_ROUNDS = 2_000_000;

const fail = (code: KeystoreErrorCode, message: string): Result<never, KeystoreError> =>
  err({ code, message });

export function parseKeystore(text: string): Result<Keystore, KeystoreError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('MALFORMED', 'This is not JSON. A keystore is a JSON file.');
  }

  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    // Name what was wrong in the two cases a person can fix: another cipher or KDF.
    const record =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const crypto = (record.crypto ?? record.Crypto) as Record<string, unknown> | undefined;
    if (crypto !== undefined && typeof crypto === 'object') {
      if (crypto.cipher !== 'aes-128-ctr') {
        return fail('UNSUPPORTED', `Cipher "${String(crypto.cipher)}" is not supported.`);
      }
      if (crypto.kdf !== 'pbkdf2' && crypto.kdf !== 'scrypt') {
        return fail('UNSUPPORTED', `Key derivation "${String(crypto.kdf)}" is not supported.`);
      }
    }
    return fail('MALFORMED', 'This is not a version 3 keystore.');
  }

  const file = parsed.data;
  const cryptoPart = (file.crypto ?? file.Crypto) as z.output<typeof cryptoSchema>;
  if (cryptoPart.kdf === 'scrypt') {
    const { n, r, p } = cryptoPart.kdfparams;
    if (128 * n * r > MAX_SCRYPT_BYTES || (n & (n - 1)) !== 0 || p > 64) {
      return fail(
        'UNSUPPORTED',
        'This keystore uses a key derivation too heavy for a phone. Re-export it with PBKDF2.',
      );
    }
  } else if (cryptoPart.kdfparams.c > MAX_PBKDF2_ROUNDS) {
    return fail('UNSUPPORTED', 'This keystore asks for too many key-derivation rounds.');
  }

  return ok({ claimedAddress: file.address ?? null, crypto: cryptoPart, source: text });
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * An address as the chain spells it for comparison: lower-case, 40 digits, no prefix. Null for
 * anything that is not one. Checksummed (mixed-case) and plain spellings of one address compare
 * equal; the checksum itself is not verified, because a mismatch there is a typo the comparison
 * to the real address would catch anyway.
 */
export const normaliseAgentAddress = (address: string): string | null => {
  const match = /^(?:0x)?([0-9a-fA-F]{40})$/.exec(address.trim());
  return match === null ? null : (match[1] ?? '').toLowerCase();
};

/** The address of a private key: the last 20 bytes of Keccak-256 over the uncompressed public key. */
export const addressOfKey = (privateKey: Uint8Array): string => {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  return toHex(keccak_256(publicKey.slice(1)).slice(12));
};

export interface OpenedKeystore {
  /** Lower-case, 40 hex digits, no prefix. */
  readonly address: string;
  /** 32 bytes. The caller owns them and clears them (`fill(0)`) when done. */
  readonly privateKey: Uint8Array;
}

/**
 * Derives the key, checks the MAC, decrypts. The passphrase is taken as UTF-8 bytes exactly as
 * typed, like Libplanet: no normalisation, so a passphrase with an accent that was typed in another
 * form is a wrong passphrase, as it is in the game's own tools.
 */
export async function openKeystore(
  keystore: Keystore,
  passphrase: string,
): Promise<Result<OpenedKeystore, KeystoreError>> {
  const { crypto } = keystore;
  const password = new TextEncoder().encode(passphrase);

  let derived: Uint8Array;
  try {
    derived =
      crypto.kdf === 'pbkdf2'
        ? await pbkdf2Async(sha256, password, crypto.kdfparams.salt, {
            c: crypto.kdfparams.c,
            dkLen: 32,
          })
        : await scryptAsync(password, crypto.kdfparams.salt, {
            N: crypto.kdfparams.n,
            r: crypto.kdfparams.r,
            p: crypto.kdfparams.p,
            dkLen: 32,
          });
  } catch (cause) {
    return fail(
      'UNSUPPORTED',
      cause instanceof Error ? cause.message : 'The key derivation could not run on this device.',
    );
  } finally {
    password.fill(0);
  }

  const macInput = new Uint8Array(16 + crypto.ciphertext.length);
  macInput.set(derived.subarray(16, 32), 0);
  macInput.set(crypto.ciphertext, 16);
  const mac = keccak_256(macInput);
  macInput.fill(0);
  if (!bytesEqual(mac, crypto.mac)) {
    derived.fill(0);
    return fail('WRONG_PASSPHRASE', 'Wrong passphrase, or the keystore was changed.');
  }

  const privateKey = ctr(derived.subarray(0, 16), crypto.cipherparams.iv).decrypt(
    crypto.ciphertext,
  );
  derived.fill(0);

  if (privateKey.length !== 32 || !secp256k1.utils.isValidSecretKey(privateKey)) {
    privateKey.fill(0);
    return fail('BAD_KEY', 'The keystore opened, but what is inside is not a private key.');
  }
  return ok({ address: addressOfKey(privateKey), privateKey });
}

/**
 * Opens the keystore, reads the address of the key inside, and lets go of the key. What step B
 * needs: proof that the passphrase opens it, and whose it is — and nothing left in memory.
 */
export async function proveKeystore(
  keystore: Keystore,
  passphrase: string,
): Promise<Result<string, KeystoreError>> {
  const opened = await openKeystore(keystore, passphrase);
  if (!opened.ok) return opened;
  opened.value.privateKey.fill(0);
  return ok(opened.value.address);
}
