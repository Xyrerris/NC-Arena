/**
 * The `Result` type from ARCHITECTURE.md §4.
 *
 * Used where a failure is an expected outcome the caller must handle — `refresh()` in
 * `RosterRepository` (§7) is the motivating case, because a sync failure offline is
 * normal operation rather than an exception.
 *
 * Programmer errors (a non-safe-integer reaching the formatter, a malformed migration)
 * still throw. `Result` is for the failures the product has a screen for.
 */

export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; value: T } =>
  result.ok;
