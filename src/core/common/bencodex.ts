/**
 * Bencodex, the binary format Nine Chronicles writes transactions and state in (ADR-0044, step C).
 *
 * Just enough of it to build one action and read back the transaction a node assembles from it:
 * `null`, booleans, integers, byte strings, text, lists and dictionaries. The rules that matter
 * for a signature are the ones about **order**: a dictionary is written with its binary keys first
 * and its text keys after, each group sorted by the bytes of the key, so the same value always
 * encodes to the same bytes — which is what lets two encodings be compared for equality and what a
 * hash over them means.
 *
 * | value   | form                              |
 * | ------- | --------------------------------- |
 * | null    | `n`                               |
 * | boolean | `t` / `f`                         |
 * | integer | `i42e`, `i-7e`                    |
 * | binary  | `3:abc`      (length in bytes)    |
 * | text    | `u3:abc`     (length in UTF-8 bytes) |
 * | list    | `l…e`                             |
 * | dict    | `d` key value … `e`               |
 *
 * Binary and text are different things and stay different here: a `Uint8Array` is binary and a
 * `string` is text. A decode that leaves bytes over, or reads a form this does not know, is an error
 * and not a guess, because a transaction that was half understood is one that must not be signed.
 */

export interface BencodexDict {
  /** In the order they were read, or in the order they will be written (sorted) for an encode. */
  readonly entries: readonly (readonly [Uint8Array | string, BencodexValue])[];
}

export type BencodexValue =
  null | boolean | bigint | Uint8Array | string | readonly BencodexValue[] | BencodexDict;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const isBencodexDict = (value: BencodexValue | undefined): value is BencodexDict =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array);

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
};

const ascii = (text: string): Uint8Array => encoder.encode(text);

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export function encodeBencodex(value: BencodexValue): Uint8Array {
  if (value === null) return ascii('n');
  if (typeof value === 'boolean') return ascii(value ? 't' : 'f');
  if (typeof value === 'bigint') return ascii(`i${value.toString(10)}e`);
  if (value instanceof Uint8Array) return concat([ascii(`${value.length}:`), value]);
  if (typeof value === 'string') {
    const bytes = encoder.encode(value);
    return concat([ascii(`u${bytes.length}:`), bytes]);
  }
  if (Array.isArray(value)) {
    return concat([ascii('l'), ...value.map(encodeBencodex), ascii('e')]);
  }
  const keyed = (value as BencodexDict).entries.map(([key, item]) => ({
    binary: key instanceof Uint8Array,
    bytes: key instanceof Uint8Array ? key : encoder.encode(key),
    key,
    item,
  }));
  keyed.sort((a, b) =>
    a.binary === b.binary ? compareBytes(a.bytes, b.bytes) : a.binary ? -1 : 1,
  );
  return concat([
    ascii('d'),
    ...keyed.flatMap(({ key, item }) => [encodeBencodex(key), encodeBencodex(item)]),
    ascii('e'),
  ]);
}

export class BencodexError extends Error {}

export function decodeBencodex(bytes: Uint8Array): BencodexValue {
  let at = 0;

  const fail = (message: string): never => {
    throw new BencodexError(`${message} (at byte ${at})`);
  };
  const peek = (): number => bytes[at] ?? fail('unexpected end of data');
  const take = (): number => {
    const byte = peek();
    at += 1;
    return byte;
  };

  const readDigits = (terminator: number): bigint => {
    const start = at;
    if (peek() === 0x2d) at += 1;
    while (peek() >= 0x30 && peek() <= 0x39) at += 1;
    if (take() !== terminator) fail('malformed number');
    const text = decoder.decode(bytes.subarray(start, at - 1));
    // Bencodex integers have no leading zeros and no negative zero.
    if (!/^(0|-?[1-9][0-9]*)$/.test(text)) fail('malformed number');
    return BigInt(text);
  };

  const readLength = (): number => {
    const length = readDigits(0x3a);
    if (length < 0n || length > BigInt(bytes.length - at)) fail('length runs past the data');
    return Number(length);
  };

  const read = (): BencodexValue => {
    const tag = peek();
    switch (tag) {
      case 0x6e: // n
        at += 1;
        return null;
      case 0x74: // t
        at += 1;
        return true;
      case 0x66: // f
        at += 1;
        return false;
      case 0x69: // i
        at += 1;
        return readDigits(0x65);
      case 0x75: {
        // u
        at += 1;
        const length = readLength();
        const text = decoder.decode(bytes.subarray(at, at + length));
        at += length;
        return text;
      }
      case 0x6c: {
        // l
        at += 1;
        const items: BencodexValue[] = [];
        while (peek() !== 0x65) items.push(read());
        at += 1;
        return items;
      }
      case 0x64: {
        // d
        at += 1;
        const entries: (readonly [Uint8Array | string, BencodexValue])[] = [];
        while (peek() !== 0x65) {
          const key = read();
          if (!(key instanceof Uint8Array) && typeof key !== 'string') {
            fail('a dictionary key is neither binary nor text');
          }
          entries.push([key as Uint8Array | string, read()]);
        }
        at += 1;
        return { entries };
      }
      default:
        if (tag >= 0x30 && tag <= 0x39) {
          const length = readLength();
          const value = bytes.slice(at, at + length);
          at += length;
          return value;
        }
        return fail(`unknown form "${String.fromCharCode(tag)}"`);
    }
  };

  let value: BencodexValue;
  try {
    value = read();
  } catch (cause) {
    if (cause instanceof BencodexError) throw cause;
    throw new BencodexError(cause instanceof Error ? cause.message : 'unreadable data');
  }
  if (at !== bytes.length) fail('data left over after the value');
  return value;
}

/** A dictionary from plain pairs, for building values. Keys are text unless given as bytes. */
export const dict = (
  entries: readonly (readonly [Uint8Array | string, BencodexValue])[],
): BencodexDict => ({ entries });

/** The value under `key` (text or binary — the two are different keys), or undefined. */
export function dictGet(
  source: BencodexValue | undefined,
  key: Uint8Array | string,
): BencodexValue | undefined {
  if (!isBencodexDict(source)) return undefined;
  for (const [candidate, value] of source.entries) {
    if (key instanceof Uint8Array) {
      if (candidate instanceof Uint8Array && compareBytes(candidate, key) === 0) return value;
    } else if (candidate === key) {
      return value;
    }
  }
  return undefined;
}

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new BencodexError('not hexadecimal');
  }
  return Uint8Array.from(clean.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}
