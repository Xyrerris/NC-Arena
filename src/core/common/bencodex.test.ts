/**
 * Bencodex (ADR-0044, step C): each form encodes to the bytes the format defines, a dictionary is
 * written in the one canonical order, and a decode refuses anything it does not fully understand.
 */

import {
  BencodexError,
  bytesToHex,
  decodeBencodex,
  dict,
  dictGet,
  encodeBencodex,
  hexToBytes,
  type BencodexValue,
} from './bencodex';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const encoded = (value: BencodexValue): string => text(encodeBencodex(value));
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const raw = (input: string): Uint8Array =>
  Uint8Array.from(Array.from(input, (c) => c.charCodeAt(0)));

describe('encodeBencodex', () => {
  it('writes each scalar in its own form', () => {
    expect(encoded(null)).toBe('n');
    expect(encoded(true)).toBe('t');
    expect(encoded(false)).toBe('f');
    expect(encoded(0n)).toBe('i0e');
    expect(encoded(-123n)).toBe('i-123e');
    expect(encoded(10n ** 20n)).toBe('i100000000000000000000e');
  });

  it('tells binary from text by the u in front of the text, and counts text in UTF-8 bytes', () => {
    expect(encoded(bytes(0x61, 0x62, 0x63))).toBe('3:abc');
    expect(encoded('abc')).toBe('u3:abc');
    expect(encoded('')).toBe('u0:');
    // "é" is two bytes in UTF-8.
    expect(bytesToHex(encodeBencodex('é'))).toBe('75323ac3a9');
  });

  it('writes a list in order', () => {
    expect(encoded([1n, 'a', [], null])).toBe('li1eu1:alene');
  });

  it('writes a dictionary with binary keys first, then text keys, each sorted by bytes', () => {
    const value = dict([
      ['b', 1n],
      [bytes(0x7a), 2n],
      ['a', 3n],
      [bytes(0x61), 4n],
    ]);

    expect(encoded(value)).toBe('d1:ai4e1:zi2eu1:ai3eu1:bi1ee');
  });

  it('writes the same dictionary the same way whatever order it was built in', () => {
    const forward = dict([
      ['type_id', 'buy_product3'],
      ['values', 1n],
    ]);
    const backward = dict([
      ['values', 1n],
      ['type_id', 'buy_product3'],
    ]);

    expect(bytesToHex(encodeBencodex(forward))).toBe(bytesToHex(encodeBencodex(backward)));
  });
});

describe('decodeBencodex', () => {
  it('reads back what was written, keeping binary and text apart', () => {
    const value = dict([
      [bytes(0x61), [1n, -2n, true, false, null]],
      ['t', 'héllo'],
      ['b', bytes(0, 1, 2, 255)],
    ]);

    const again = decodeBencodex(encodeBencodex(value));

    expect(bytesToHex(encodeBencodex(again))).toBe(bytesToHex(encodeBencodex(value)));
    expect(dictGet(again, 't')).toBe('héllo');
    expect(dictGet(again, bytes(0x61))).toEqual([1n, -2n, true, false, null]);
    // Text key "a" and binary key "a" are different keys.
    expect(dictGet(again, 'a')).toBeUndefined();
  });

  it('reads a value a node sends as hex', () => {
    // l i1e i3e e
    expect(decodeBencodex(hexToBytes('6c693165693365'.concat('65')))).toEqual([1n, 3n]);
  });

  it.each([
    ['', 'unexpected end'],
    ['i', 'unexpected end'],
    ['i01e', 'malformed number'],
    ['i-0e', 'malformed number'],
    ['ie', 'malformed number'],
    ['3:ab', 'length runs past'],
    ['x', 'unknown form'],
    ['li1e', 'unexpected end'],
    ['di1ei2ee', 'neither binary nor text'],
    ['i1ei2e', 'left over'],
  ])('refuses %j', (input, why) => {
    expect(() => decodeBencodex(raw(input))).toThrow(BencodexError);
    expect(() => decodeBencodex(raw(input))).toThrow(why);
  });

  it('refuses text that is not UTF-8', () => {
    expect(() => decodeBencodex(Uint8Array.from([0x75, 0x31, 0x3a, 0xff]))).toThrow(BencodexError);
  });
});

describe('hex', () => {
  it('goes both ways and refuses what is not hexadecimal', () => {
    expect(bytesToHex(bytes(0, 15, 255))).toBe('000fff');
    expect(Array.from(hexToBytes('0x000FfF'))).toEqual([0, 15, 255]);
    expect(() => hexToBytes('abc')).toThrow(BencodexError);
    expect(() => hexToBytes('zz')).toThrow(BencodexError);
  });
});
