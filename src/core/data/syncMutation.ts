/**
 * The one sync, as TanStack Query sees it — shared by the two callers that fire it.
 *
 * `useRoster` fires it from a gesture; the periodic task in `backgroundSync.ts` fires it with
 * nobody watching (ADR-0035, the owner's decision 1). They are the same operation, so they are
 * the same mutation: one key, one scope, one `mutationFn`. What differs is only the policy a
 * caller layers on top — `retry` above all — and that is each caller's to state.
 *
 * Sharing the key is what makes a background sync visible. `useRoster` reads "is a sync in
 * flight" off the key rather than off its own observer, so a sync the task started while the
 * app is open lights the same badge a pull-to-refresh does, with no new UI.
 *
 * Sharing the **scope** is what keeps them from overlapping. TanStack runs mutations of one
 * scope strictly one after another, so a pull that lands while the task is mid-sync waits for
 * it rather than pushing the same `LOCAL` rows in parallel. The endpoint is idempotent
 * (a63c4bd), so an overlap would not duplicate anything — but two writers racing to
 * `replaceRoster` over the same rows is a question nobody should have to answer.
 *
 * No `useQuery` data comes out of here, for the reason ARCHITECTURE.md §7 gives: `mutationFn`
 * returns `void`, and what a screen shows is what the sync wrote to SQLite.
 */

import { MutationObserver, type QueryClient } from '@tanstack/react-query';

import type { RosterRepository } from './rosterRepository';

export const SYNC_MUTATION_KEY = ['roster', 'sync'] as const;

const SYNC_SCOPE = { id: 'roster-sync' } as const;

export const syncMutation = (repository: Pick<RosterRepository, 'syncRoster'>) => ({
  mutationKey: SYNC_MUTATION_KEY,
  scope: SYNC_SCOPE,
  mutationFn: async (): Promise<void> => {
    const result = await repository.syncRoster();
    // Two failure conventions meet here, and only here. `Result` is what this codebase uses
    // for a failure the product has a screen for; a rejected promise is what React Query
    // understands. Nothing else would set `error`, so the unwrap has to throw.
    if (!result.ok) throw result.error;
  },
});

/**
 * How hard the background caller tries. `useRoster` sets `retry: 0` because somebody is
 * watching a pull-to-refresh and the remedy — pull again — is in their hands; this caller has
 * nobody, and the next attempt the OS grants may be hours away. Two retries with TanStack's
 * exponential backoff (1 s, then 2 s) cover a dropped connection or a cold VPS without keeping
 * the worker alive for long. Safe only because `POST /v1/roster/sync` answers a replayed push
 * with the ids it assigned the first time.
 *
 * The retry is not selective. The network layer folds the error taxonomy into the message
 * (`RemoteRosterSource.failure`), so an `UNAUTHORIZED` and an `OFFLINE` look alike from here;
 * retrying the first costs two requests an interval, which is cheaper than re-parsing it.
 */
export interface BackgroundSyncPolicy {
  retry: number;
  retryDelay?: number;
}

export const BACKGROUND_SYNC_POLICY: BackgroundSyncPolicy = { retry: 2 };

export type BackgroundSyncOutcome = 'synced' | 'skipped' | 'failed';

/**
 * One background run: what the task body does, without anything native in it, so the Node
 * project can prove it.
 *
 * It skips — rather than fails — in two cases, because neither is something a retry fixes:
 * - **No key yet.** With a backend configured and the setup gate still up, every request would
 *   go out unauthenticated. The gate is what pairs this device; the task waits for it.
 * - **A sync already in flight.** The scope would queue this one behind it, and a second sync
 *   moments after the first has nothing new to carry.
 */
export const runBackgroundSync = async (
  repository: Pick<RosterRepository, 'syncRoster' | 'needsAccount'>,
  client: QueryClient,
  policy: BackgroundSyncPolicy = BACKGROUND_SYNC_POLICY,
): Promise<BackgroundSyncOutcome> => {
  if (repository.needsAccount()) return 'skipped';
  if (client.isMutating({ mutationKey: SYNC_MUTATION_KEY }) > 0) return 'skipped';

  const observer = new MutationObserver(client, { ...syncMutation(repository), ...policy });
  try {
    await observer.mutate();
    return 'synced';
  } catch {
    // Nothing to surface: the user did not ask for this sync, so a banner for it would be a
    // failure reported to somebody who was not waiting on it. The ladder on screen is still
    // the last one that landed, and "updated N ago" already says how old that is.
    return 'failed';
  }
};
