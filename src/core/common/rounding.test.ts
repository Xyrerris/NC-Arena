/**
 * ARCHITECTURE.md §2.2 and §10. These run in the `node` Jest project — no RN preset, no
 * emulator — because they are the rules the rest of the app's numbers depend on.
 */

import { divideHalfUp, pow10, rescaleHalfUp } from './rounding';

describe('pow10', () => {
  it('returns exact powers of ten', () => {
    expect(pow10(0)).toBe(1);
    expect(pow10(6)).toBe(1_000_000);
    expect(pow10(15)).toBe(1_000_000_000_000_000);
  });

  it('refuses an exponent outside the table rather than returning Infinity', () => {
    expect(() => pow10(16)).toThrow(RangeError);
    expect(() => pow10(-1)).toThrow(RangeError);
  });
});

describe('divideHalfUp', () => {
  it('is exact when the division does not round', () => {
    expect(divideHalfUp(100_000_000_000, 1_000_000_000)).toBe(100);
    expect(divideHalfUp(0, 10)).toBe(0);
    expect(divideHalfUp(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rounds a tie away from zero', () => {
    expect(divideHalfUp(5, 10)).toBe(1);
    expect(divideHalfUp(15, 10)).toBe(2);
    expect(divideHalfUp(-5, 10)).toBe(-1);
    expect(divideHalfUp(-15, 10)).toBe(-2);
  });

  it('rounds either side of a tie toward the nearer neighbour', () => {
    expect(divideHalfUp(4, 10)).toBe(0);
    expect(divideHalfUp(6, 10)).toBe(1);
    expect(divideHalfUp(-6, 10)).toBe(-1);
  });

  it('does not produce negative zero', () => {
    expect(Object.is(divideHalfUp(-4, 10), 0)).toBe(true);
  });

  it('stays exact at the top of the safe-integer range', () => {
    // 9_007_199_254_740_991 / 10 = 900_719_925_474_099.1 — a float division would have
    // no room left to represent the remainder, so the remainder is taken first.
    expect(divideHalfUp(Number.MAX_SAFE_INTEGER, 10)).toBe(900_719_925_474_099);
    expect(divideHalfUp(Number.MAX_SAFE_INTEGER - 4, 10)).toBe(900_719_925_474_099);
  });

  it('rejects a value above 2^53 rather than rounding it silently', () => {
    expect(() => divideHalfUp(2 ** 53, 1)).toThrow(RangeError);
    expect(() => divideHalfUp(2 ** 53, 1)).toThrow(/§2\.1/);
  });

  it('rejects a non-integer', () => {
    expect(() => divideHalfUp(1.5, 1)).toThrow(RangeError);
    expect(() => divideHalfUp(Number.NaN, 1)).toThrow(RangeError);
  });

  it('rejects a non-positive denominator', () => {
    expect(() => divideHalfUp(10, 0)).toThrow(RangeError);
    expect(() => divideHalfUp(10, -2)).toThrow(RangeError);
  });
});

describe('rescaleHalfUp', () => {
  it('is the identity when nothing is dropped', () => {
    expect(rescaleHalfUp(712_043, 0)).toBe(712_043);
  });

  it('drops decimal places half-up', () => {
    // 71.2043 -> one decimal place: 712_043 tenths-of-a-basis-point -> 712 tenths.
    expect(rescaleHalfUp(712_043, 3)).toBe(712);
    // 71.0500 -> 71.1, which is the case (71.05).toFixed(1) gets wrong ("71.0").
    expect(rescaleHalfUp(710_500, 3)).toBe(711);
  });

  it('refuses to invent decimal places', () => {
    expect(() => rescaleHalfUp(1, -1)).toThrow(RangeError);
  });
});
