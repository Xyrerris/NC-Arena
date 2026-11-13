/**
 * Test doubles for buying (ADR-0044, steps B to D): a keystore written the way Libplanet writes one,
 * and a node that assembles the transaction it is asked for.
 *
 * The keystore is built with Node's own `crypto` (PBKDF2 and AES), which shares no code with the
 * module that opens it, so a test that opens it proves something. The node is honest unless a test
 * says otherwise, and — like the port it fakes — has no method that sends.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

import { err, ok } from '../common';
import type { GoldCurrency, TransactionSource, UnsignedRequest } from '../common';
import {
  decodeBencodex,
  dict,
  encodeBencodex,
  hexToBytes,
  isBencodexDict,
  type BencodexValue,
} from '../common/bencodex';
import { addressOfPublicKey } from '../common/transaction';

/** The Web3 Secret Storage spec's own key, so its address is known to be `008aeeda…`. */
export const TEST_PRIVATE_KEY = '7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d';
export const TEST_AGENT_ADDRESS = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';

/** A version-3 keystore of `TEST_PRIVATE_KEY`, locked with `passphrase` (10 PBKDF2 rounds, fast). */
export const writeTestKeystore = (passphrase: string, claimed = TEST_AGENT_ADDRESS): string => {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = pbkdf2Sync(passphrase, salt, 10, 32, 'sha256');
  const cipher = createCipheriv('aes-128-ctr', derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(TEST_PRIVATE_KEY, 'hex')),
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

export const TEST_GENESIS = '729fa26958648a35b53e8e3905d11ec53b1b4929bf5f499884aed7df616f5913';

const key = (letter: string): Uint8Array => Uint8Array.of(letter.charCodeAt(0));

export interface FakeTransactionNode extends TransactionSource {
  /** What was asked of it, in order. */
  readonly calls: string[];
}

/** An in-process node: the four questions of `TransactionSource`, answered the way a real one does. */
export const createFakeTransactionSource = (): FakeTransactionNode => {
  const calls: string[] = [];
  return {
    name: 'fake',
    calls,
    genesisHash: () => TEST_GENESIS,
    nextNonce: () => {
      calls.push('nextNonce');
      return Promise.resolve(ok(7n));
    },
    goldCurrency: () => {
      calls.push('goldCurrency');
      const gold: GoldCurrency = {
        currency: dict([
          ['ticker', 'NCG'],
          ['decimalPlaces', Uint8Array.of(2)],
          ['minters', null],
        ]),
        decimalPlaces: 2,
      };
      return Promise.resolve(ok(gold));
    },
    unsignedTransaction: (_planet, request: UnsignedRequest) => {
      calls.push('unsignedTransaction');
      const publicKey = hexToBytes(request.publicKeyHex);
      return Promise.resolve(
        ok(
          encodeBencodex(
            dict([
              [key('a'), [decodeBencodex(hexToBytes(request.plainValueHex))]],
              [key('p'), publicKey],
              [key('s'), hexToBytes(addressOfPublicKey(publicKey))],
              [key('n'), request.nonce],
              [key('g'), hexToBytes(TEST_GENESIS)],
              [key('l'), 1n],
              [
                key('m'),
                [
                  dict([
                    ['ticker', 'Mead'],
                    ['decimalPlaces', Uint8Array.of(18)],
                  ]),
                  10n ** 13n,
                ],
              ],
            ]),
          ),
        ),
      );
    },
    attachSignature: (_planet, unsigned, signature) => {
      calls.push('attachSignature');
      const body = decodeBencodex(unsigned);
      const entries = isBencodexDict(body) ? body.entries : [];
      const signed: (readonly [Uint8Array | string, BencodexValue])[] = [
        ...entries,
        [key('S'), signature],
      ];
      return Promise.resolve(ok(encodeBencodex(dict(signed))));
    },
  };
};

/** A node that cannot be reached, for the failure paths. */
export const createDownTransactionSource = (): FakeTransactionNode => {
  const calls: string[] = [];
  const down = (what: string) => {
    calls.push(what);
    return Promise.resolve(err({ reason: 'OFFLINE' as const, message: 'the node is down' }));
  };
  return {
    name: 'down',
    calls,
    genesisHash: () => TEST_GENESIS,
    nextNonce: () => down('nextNonce'),
    goldCurrency: () => down('goldCurrency'),
    unsignedTransaction: () => down('unsignedTransaction'),
    attachSignature: () => down('attachSignature'),
  };
};
