/**
 * The device half of ADR-0012. **Device-only** — it pulls in `expo-sqlite` through
 * `drizzle-orm/expo-sqlite`, so it is not re-exported from `src/core/data/index.ts`, for
 * the same reason `arenaRepository.ts` is not.
 */

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import type { LiveData, UseLiveData } from './liveData';

/**
 * `useLiveQuery` is typed against `AnySQLiteSelect`, which does not survive the
 * repository's `LiveQuery` generic — the observer type is parameterised over the *query*
 * so the concrete Drizzle type reaches the call site (ADR-0012), and re-narrowing it here
 * would push the cast back into every screen. It is confined to this one line, and `map`
 * on the other side restores the domain type.
 *
 * One limitation worth stating rather than discovering: `useLiveQuery` subscribes to the
 * table the select is *from*, so a roster query re-runs when `players` changes but not when
 * `head_to_head` does. `replaceRoster` writes both in one transaction, so today every write
 * touches `players` too. Phase 5's incremental sync must not assume that.
 */
export const useExpoLiveData: UseLiveData = <TQuery extends { all(): unknown[] }, TResult>(
  live: {
    readonly query: TQuery;
    readonly map: (rows: ReturnType<TQuery['all']>) => TResult;
  },
  deps: readonly unknown[],
): LiveData<TResult> => {
  const { data, error, updatedAt } = useLiveQuery(live.query as any, [...deps]);
  return {
    data: live.map(data),
    error: error ?? null,
    loaded: updatedAt !== undefined,
  };
};
