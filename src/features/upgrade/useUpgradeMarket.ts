/**
 * Reads the market for every candidate material, a few at a time, and keeps the listings (the plan,
 * phase 2's queue in `core/collection`, wrapped for React).
 *
 * **It reads only when asked.** The full read is up to 75 items and the commonest grade 7 item alone
 * is five pages: opening the screen must not start it. `start` begins, `stop` ends, `retryFailed`
 * reads again only what failed. The reading itself is `ArenaData.market`'s — kept for a minute,
 * shared, stopped when nobody waits.
 *
 * Answers belong to the set of candidates they were read for: another set (grade 7 switched on or
 * off) is another question, and the old answers are not shown for it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  readMaterialMarket,
  type MaterialCandidate,
  type MaterialOutcome,
} from '@/core/collection';
import { ok, type MarketListing } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet } from '@/core/model';

export type MarketPhase = 'idle' | 'running' | 'done' | 'stopped';

interface Reading {
  readonly signature: string;
  readonly phase: MarketPhase;
  readonly outcomes: Readonly<Record<number, MaterialOutcome>>;
}

export interface UpgradeMarket {
  readonly phase: MarketPhase;
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  /** Every listing read so far, without the ones already bought. */
  readonly listings: readonly MarketListing[];
  /** The buyer's own agent, whose listings a purchase would refuse; null until known. */
  readonly ownAgent: string | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly retryFailed: () => void;
  readonly markSold: (productId: string) => void;
}

export const useUpgradeMarket = (
  planet: Planet,
  candidates: readonly MaterialCandidate[],
): UpgradeMarket => {
  const { market, avatarSource } = useArenaData();
  if (market === undefined) {
    throw new Error(
      'The Upgrade screen needs `market` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }
  const avatar = useViewerAvatar();
  const signature = candidates.map((candidate) => candidate.itemId).join(',');

  const [reading, setReading] = useState<Reading>({ signature, phase: 'idle', outcomes: {} });
  const [ownAgent, setOwnAgent] = useState<string | null>(null);
  const [sold, setSold] = useState<ReadonlySet<string>>(new Set());
  const markSold = useCallback((productId: string) => {
    setSold((now) => (now.has(productId) ? now : new Set(now).add(productId)));
  }, []);
  const run = useRef<AbortController | null>(null);

  const current: Reading =
    reading.signature === signature ? reading : { signature, phase: 'idle', outcomes: {} };

  // Leaving, or asking about other candidates, stops whatever is still being read.
  useEffect(
    () => () => {
      run.current?.abort();
    },
    [signature],
  );

  const read = useCallback(
    (wanted: readonly MaterialCandidate[], kept: Readonly<Record<number, MaterialOutcome>>) => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      setReading({ signature, phase: wanted.length === 0 ? 'done' : 'running', outcomes: kept });

      void readMaterialMarket(
        wanted,
        async (candidate, signal) => {
          const result = await market.scan(planet, candidate.itemSubType, candidate.itemId, {
            signal,
          });
          return result.ok ? ok(result.value.listings) : result;
        },
        {
          signal: controller.signal,
          onSettled: (candidate, outcome) => {
            setReading((now) =>
              now.signature === signature
                ? { ...now, outcomes: { ...now.outcomes, [candidate.itemId]: outcome } }
                : now,
            );
          },
        },
      ).then(() => {
        if (controller.signal.aborted) return;
        setReading((now) => (now.signature === signature ? { ...now, phase: 'done' } : now));
      });
    },
    [market, planet, signature],
  );

  const start = useCallback(() => {
    if (avatar !== null && avatarSource !== undefined) {
      void avatarSource.readAvatar(avatar).then((identity) => {
        if (identity.ok && identity.value !== null) setOwnAgent(identity.value.agentAddress);
      });
    }
    read(candidates, {});
  }, [avatar, avatarSource, read, candidates]);

  const retryFailed = useCallback(() => {
    const kept = Object.fromEntries(
      Object.entries(current.outcomes).filter(([, outcome]) => outcome.kind === 'ready'),
    );
    read(
      candidates.filter((candidate) => current.outcomes[candidate.itemId]?.kind === 'failed'),
      kept,
    );
  }, [current.outcomes, read, candidates]);

  const stop = useCallback(() => {
    run.current?.abort();
    setReading((now) =>
      now.signature === signature && now.phase === 'running' ? { ...now, phase: 'stopped' } : now,
    );
  }, [signature]);

  const listings = useMemo(
    () =>
      Object.values(current.outcomes).flatMap((outcome) =>
        outcome.kind === 'ready'
          ? outcome.listings.filter((listing) => !sold.has(listing.productId))
          : [],
      ),
    [current.outcomes, sold],
  );

  const outcomes = Object.values(current.outcomes);
  return {
    phase: current.phase,
    total: candidates.length,
    done: outcomes.length,
    failed: outcomes.filter((outcome) => outcome.kind === 'failed').length,
    listings,
    ownAgent,
    start,
    stop,
    retryFailed,
    markSold,
  };
};
