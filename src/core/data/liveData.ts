/**
 * The seam between an observer and the thing that runs it (ADR-0012).
 *
 * `rosterRepository` hands back `{ query, map }` and deliberately does not know how the
 * query is executed — that is what keeps React and `expo-sqlite` out of the one layer
 * that has to stay runnable in Node. This file names the missing half as a type, so the
 * device implementation (`useExpoLiveData`) and the test implementation are two values of
 * one contract rather than two unrelated functions a screen has to choose between.
 */

import type { LiveQuery } from './rosterRepository';

export interface LiveData<TResult> {
  readonly data: TResult;
  readonly error: Error | null;
  /**
   * False until the first read has come back. `useLiveQuery` seeds its state with `[]` and
   * fills it in an effect, so "no rows yet" and "no rows" are the same array — this flag is
   * the only thing that separates a loading roster from an empty one.
   */
  readonly loaded: boolean;
}

/**
 * `deps` is the subscription identity, not a performance hint: `useLiveQuery` captures the
 * query in an effect, so a query rebuilt with a new sort or a new search term is ignored
 * until the deps say otherwise.
 */
export type UseLiveData = <TQuery extends { all(): unknown[] }, TResult>(
  live: LiveQuery<TQuery, TResult>,
  deps: readonly unknown[],
) => LiveData<TResult>;
