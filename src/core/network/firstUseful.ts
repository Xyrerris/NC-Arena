/**
 * Reading several sources in order and keeping the first useful answer — the one rule
 * `FallbackCollectionSource` and `FallbackAvatarSource` share (ADR-0044).
 *
 * "Useful" is a read with a value. A **failure falls through**, and so does `ok(null)`: Mimir can
 * lag the chain, so "nothing there" from it may only mean the thing is newer than its index, and a
 * node is the one that can say otherwise.
 *
 * The ending is deliberately conservative. `ok(null)` comes out only when **every** source
 * answered it. If one answered null and another failed, the result is that failure: "nothing
 * there" would be a claim resting on a source that could not be checked against the other.
 */

import { err, ok, type Result } from '../common';

export async function firstUseful<TSource, TValue, TError>(
  sources: readonly TSource[],
  read: (source: TSource) => Promise<Result<TValue | null, TError>>,
): Promise<Result<TValue | null, TError>> {
  let failure: { readonly error: TError } | undefined;
  for (const source of sources) {
    const result = await read(source);
    if (result.ok && result.value !== null) return result;
    if (!result.ok) failure = { error: result.error };
  }
  return failure === undefined ? ok(null) : err(failure.error);
}
