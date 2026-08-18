/**
 * Cross-cutting utilities.
 *
 * `toFixed` is banned in this directory by an ESLint rule that errors with a pointer to
 * ARCHITECTURE.md §2.2. The short version: (9.995).toFixed(2) === "9.99", and 9.995 B is
 * one of the three boundaries the formatting contract is tested at.
 */

export { err, isOk, ok, type Result } from './result';
export type { RosterSnapshot, RosterSource } from './rosterSource';
export { assertSafeInteger, divideHalfUp, pow10, rescaleHalfUp } from './rounding';
export {
  createStatFormatter,
  isShortUnit,
  statFormatter,
  type ShortUnit,
  type StatFormatter,
} from './statFormatter';
