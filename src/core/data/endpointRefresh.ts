/**
 * Keeps the endpoint book current (ADR-0045). `core/data` owns this because it is the one layer
 * that knows both the network and the preferences (§4): `core/network` can fetch the registry
 * and rank nodes, but cannot keep what it learned.
 *
 * Two steps, and the second never waits for the first to be useful:
 *
 * 1. `loadCached()` — synchronous, run at start-up. The last good registry is applied before any
 *    screen reads anything, so the first request of a session already goes where the last
 *    session learned to go.
 * 2. `refresh()` — run once after boot, never awaited by a screen. It reads the registry again if
 *    the cached one is older than `maxAgeMs` (or there is none), then orders each planet's nodes
 *    and Mimir services by how fast they answer *now*. The ranking is not cached: latency is a
 *    fact about this network at this moment.
 *
 * Nothing here throws. A registry that cannot be read leaves the cached or built-in list in place,
 * and a probe that fails is a node that sorts last.
 */

import {
  SERVED_PLANETS,
  decodeRegistryCache,
  encodeRegistryCache,
  rankByLatency,
  type EndpointBook,
  type EndpointKind,
  type LatencyProbe,
  type RegistryReader,
} from '../network';

export interface EndpointCache {
  get(): string | null;
  set(json: string): void;
}

export interface EndpointRefreshDeps {
  readonly book: EndpointBook;
  readonly reader: RegistryReader;
  readonly probe: LatencyProbe;
  readonly cache: EndpointCache;
  readonly now?: () => number;
  /** How long a registry answer is trusted without asking again. A day by default. */
  readonly maxAgeMs?: number;
}

/** Where the registry in use came from this time. */
export type RefreshOutcome = 'FETCHED' | 'CACHED' | 'BUILT_IN';

export const REGISTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Kinds whose order latency decides. The market is one host per planet, so there is nothing to rank. */
const RANKED_KINDS: readonly EndpointKind[] = ['nodes', 'mimir'];

export function createEndpointRefresh(deps: EndpointRefreshDeps) {
  const now = deps.now ?? Date.now;
  const maxAgeMs = deps.maxAgeMs ?? REGISTRY_MAX_AGE_MS;

  const loadCached = (): boolean => {
    const cached = decodeRegistryCache(deps.cache.get());
    if (cached === null) return false;
    deps.book.apply(cached.registry);
    return true;
  };

  const rankAll = async (): Promise<void> => {
    await Promise.all(
      SERVED_PLANETS.flatMap((planet) =>
        RANKED_KINDS.map(async (kind) => {
          const candidates = deps.book.candidates(kind, planet);
          if (candidates.length < 2) return;
          deps.book.rank(kind, planet, await rankByLatency(candidates, deps.probe));
        }),
      ),
    );
  };

  const refresh = async (): Promise<RefreshOutcome> => {
    let outcome: RefreshOutcome = 'BUILT_IN';
    try {
      const cached = decodeRegistryCache(deps.cache.get());
      if (cached !== null) outcome = 'CACHED';

      // A `readAt` in the future is a clock that was set back: it cannot be trusted to be fresh.
      const age = cached === null ? Infinity : now() - cached.readAt;
      if (age < 0 || age > maxAgeMs) {
        const read = await deps.reader.read();
        if (read.ok) {
          deps.book.apply(read.value);
          deps.cache.set(encodeRegistryCache(read.value, now()));
          outcome = 'FETCHED';
        }
      }

      await rankAll();
    } catch {
      // A failed refresh is a list that stays as it was.
    }
    return outcome;
  };

  return { loadCached, refresh };
}
