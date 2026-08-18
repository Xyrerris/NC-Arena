/**
 * Half-up rounding in integer arithmetic (ARCHITECTURE.md §2.2).
 *
 * `toFixed` is not a rounding specification. Verified in V8, and Hermes inherits the same
 * IEEE-754 behaviour:
 *
 *   (9.995).toFixed(2) -> "9.99"    expected half-up "10.00"
 *   (1.005).toFixed(2) -> "1.00"    expected half-up "1.01"
 *
 * The failure is not in `toFixed` itself — it is that 9.995 is *already* not 9.995 by the
 * time it is a double (it is 9.99499999999999921...). So the fix is not a better rounder
 * over the same float; it is never producing the float at all. Every value this module
 * rounds arrives as a scaled integer, and the division that would have produced the float
 * is done here, exactly, with a remainder test instead.
 *
 * "Half-up" is used in the Java `RoundingMode.HALF_UP` sense: ties round *away from zero*.
 */

/** 10^0 … 10^15. Every entry is exactly representable as a double. */
const POW10 = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15,
] as const;

export const pow10 = (exponent: number): number => {
  const value = POW10[exponent];
  if (value === undefined) {
    throw new RangeError(`pow10: exponent ${exponent} is outside the supported range 0..15.`);
  }
  return value;
};

const assertSafe = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `ARCHITECTURE.md §2.1: ${name} must be a safe integer (integral and below 2^53), ` +
        `received ${value}. Above that ceiling arithmetic and JSON.parse both lose precision ` +
        `silently, so this is rejected loudly rather than rendered as a plausible wrong number.`,
    );
  }
};

/**
 * `numerator / denominator`, rounded half-away-from-zero, computed without ever
 * materialising the inexact quotient.
 *
 * Both intermediate steps are exact for safe integers: `%` on exactly-representable
 * doubles yields the exact remainder, and `(abs - remainder) / denominator` is an exact
 * integer division whose result is representable.
 */
export const divideHalfUp = (numerator: number, denominator: number): number => {
  assertSafe(numerator, 'numerator');
  assertSafe(denominator, 'denominator');
  if (denominator <= 0) {
    throw new RangeError(`divideHalfUp: denominator must be positive, received ${denominator}.`);
  }

  const negative = numerator < 0;
  const abs = negative ? -numerator : numerator;
  const remainder = abs % denominator;
  const quotient = (abs - remainder) / denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;

  // `rounded !== 0` keeps negative zero out of the result: -0 renders as "0" but fails an
  // `Object.is` assertion, so it would only ever surface as a confusing test failure.
  return negative && rounded !== 0 ? -rounded : rounded;
};

/**
 * Rescales an integer that carries `fromDecimals` implied decimal places so that it
 * carries `toDecimals` instead, rounding half-up on the way down.
 *
 * Example — a value in whole units displayed in billions at 2 decimals is
 * `rescaleHalfUp(v, 0, 2 - 9)`, i.e. it drops 7 decimal places.
 */
export const rescaleHalfUp = (value: number, dropDecimals: number): number => {
  if (dropDecimals < 0) {
    throw new RangeError(`rescaleHalfUp: dropDecimals must be >= 0, received ${dropDecimals}.`);
  }
  return dropDecimals === 0 ? value : divideHalfUp(value, pow10(dropDecimals));
};

export { assertSafe as assertSafeInteger };
