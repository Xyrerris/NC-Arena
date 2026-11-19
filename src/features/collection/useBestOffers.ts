/**
 * Reads the market for every piece the offers view asks about, a few at a time, and keeps the best
 * offer for each (`core/collection`'s `bestOffers`).
 *
 * **It reads only when asked.** A scan is one request per item, and the pieces of many collections
 * are hundreds of items: opening the view must not start that by itself, and the person chooses
 * the scope with the filters first. `start` begins, `stop` ends, `retryFailed` reads again only
 * what failed.
 *
 * **Three at a time.** Measured on 2026-10-20 against the live service: three scans together are
 * four to five times faster than one after another and none failed. The reading itself is
 * `ArenaData.market`'s — kept for a minute, shared, stopped when nobody waits — and what this adds
 * is the queue, the state of each piece and the end of it all when the view goes away.
 *
 * Answers belong to the set of pieces they were read for: another set (a filter changed) is
 * another question, and the old answers are not shown for it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { bestOffers, type BestOffers, type EnhancementCosts } from '@/core/collection';
import type { MarketListing } from '@/core/common';
import { useArenaData, useViewerAvatar } from '@/core/data';
import type { Planet } from '@/core/model';

import type { OfferTarget } from './offersUiState';

/** Scans in flight together. */
export const OFFER_SCAN_CONCURRENCY = 3;

/**
 * The answers that arrive while reading are handed to the screen at most this often. Each hand-over
 * ranks every offer read so far and redraws the list, so doing it per answer starved the JS thread
 * and made every tap wait seconds; the first answer and the last are never held back.
 */
export const OFFER_FLUSH_MS = 1000;

const NO_OFFERS: BestOffers = { offers: [], overpriced: [], withoutOffer: [] };

export type OffersPhase = 'idle' | 'running' | 'done' | 'stopped';

type Outcome =
  | { readonly kind: 'ready'; readonly listings: readonly MarketListing[] }
  | { readonly kind: 'failed' };

interface Reading {
  /** The set of pieces the outcomes were read for. */
  readonly signature: string;
  readonly phase: OffersPhase;
  readonly outcomes: Readonly<Record<string, Outcome>>;
}

export interface OffersController {
  readonly phase: OffersPhase;
  /** Pieces to read, pieces answered (ready or failed), and pieces that failed. */
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly result: BestOffers;
  readonly start: () => void;
  readonly stop: () => void;
  readonly retryFailed: () => void;
  /** A listing was bought: it is left out of every offer from now on, whatever a read still says. */
  readonly markSold: (productId: string) => void;
}

const signatureOf = (targets: readonly OfferTarget[]): string =>
  targets.map((target) => `${target.piece.key}:${target.missing.need}`).join(',');

export const useBestOffers = (
  planet: Planet,
  targets: readonly OfferTarget[],
  costs: EnhancementCosts | null = null,
): OffersController => {
  const { market, avatarSource } = useArenaData();
  if (market === undefined) {
    throw new Error(
      'The offers view needs `market` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }
  const avatar = useViewerAvatar();
  const signature = signatureOf(targets);

  const [reading, setReading] = useState<Reading>({ signature, phase: 'idle', outcomes: {} });
  const [agent, setAgent] = useState<string | null>(null);
  // Kept for as long as the view lives: the market's own copy can be up to a minute old, and a
  // listing that was bought must not come back with it.
  const [sold, setSold] = useState<ReadonlySet<string>>(new Set());
  const markSold = useCallback((productId: string) => {
    setSold((now) => (now.has(productId) ? now : new Set(now).add(productId)));
  }, []);
  // The offers last ranked: shown while a read is running, since ranking waits for its end.
  const [shown, setShown] = useState<BestOffers>(NO_OFFERS);
  const run = useRef<AbortController | null>(null);
  // Hands over what the running read has gathered but not yet shown (see `OFFER_FLUSH_MS`).
  const flushNow = useRef<(() => void) | null>(null);

  // The answers of another set of pieces are not this set's.
  const current: Reading =
    reading.signature === signature ? reading : { signature, phase: 'idle', outcomes: {} };

  // Leaving, or asking about other pieces, stops whatever is still being read.
  useEffect(
    () => () => {
      run.current?.abort();
      flushNow.current = null;
    },
    [signature],
  );

  const read = useCallback(
    (wanted: readonly OfferTarget[], kept: Readonly<Record<string, Outcome>>) => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      setReading({ signature, phase: wanted.length === 0 ? 'done' : 'running', outcomes: kept });

      // Answers wait here and reach the state in batches: the first at once, then one a second.
      let waiting: Record<string, Outcome> = {};
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastFlush = 0;
      const flush = (): void => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        const batch = waiting;
        if (Object.keys(batch).length === 0) return;
        waiting = {};
        lastFlush = Date.now();
        setReading((now) =>
          now.signature === signature ? { ...now, outcomes: { ...now.outcomes, ...batch } } : now,
        );
      };
      flushNow.current = flush;

      const put = (key: string, outcome: Outcome): void => {
        waiting[key] = outcome;
        if (timer !== null) return;
        const wait = Math.max(0, lastFlush + OFFER_FLUSH_MS - Date.now());
        if (wait === 0) flush();
        else timer = setTimeout(flush, wait);
      };

      let next = 0;
      const worker = async (): Promise<void> => {
        while (!controller.signal.aborted) {
          const target = wanted[next++];
          if (target === undefined || target.piece.route.kind !== 'route') return;
          const result = await market.scan(
            planet,
            target.piece.route.itemSubType,
            target.missing.requirement.itemId,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          if (!result.ok) {
            // A stopped scan means this read was ended; there is nothing left to tell.
            if (result.error.reason === 'CANCELLED') return;
            put(target.piece.key, { kind: 'failed' });
            continue;
          }
          // Every level is kept: `bestOffers` decides which are the piece and which can be raised.
          put(target.piece.key, { kind: 'ready', listings: result.value.listings });
        }
      };

      void Promise.all(
        Array.from({ length: Math.min(OFFER_SCAN_CONCURRENCY, wanted.length) }, worker),
      ).then(() => {
        if (controller.signal.aborted) {
          if (timer !== null) clearTimeout(timer);
          return;
        }
        flush();
        setReading((now) => (now.signature === signature ? { ...now, phase: 'done' } : now));
      });
    },
    [market, planet, signature],
  );

  const start = useCallback(() => {
    // Whose listings to leave out: the account behind the avatar cannot buy from itself.
    if (avatar !== null && avatarSource !== undefined) {
      void avatarSource.readAvatar(avatar).then((identity) => {
        if (identity.ok && identity.value !== null) setAgent(identity.value.agentAddress);
      });
    }
    // A new read starts from nothing: the earlier offers are not shown while it runs.
    setShown(NO_OFFERS);
    read(targets, {});
  }, [avatar, avatarSource, read, targets]);

  const retryFailed = useCallback(() => {
    const kept = Object.fromEntries(
      Object.entries(current.outcomes).filter(([, outcome]) => outcome.kind === 'ready'),
    );
    read(
      targets.filter((target) => current.outcomes[target.piece.key]?.kind === 'failed'),
      kept,
    );
  }, [current.outcomes, read, targets]);

  const stop = useCallback(() => {
    // What was read before STOP is kept and shown.
    flushNow.current?.();
    run.current?.abort();
    setReading((now) =>
      now.signature === signature && now.phase === 'running' ? { ...now, phase: 'stopped' } : now,
    );
  }, [signature]);

  // Ranking every offer read so far is the heavy part, and it grows with the list: while the market
  // is being read it is not done at all, only at the end or on STOP. A read that adds to a previous
  // one (retrying what failed) keeps showing the earlier result meanwhile.
  const running = current.phase === 'running';
  const ranked = useMemo(
    () =>
      running
        ? null
        : bestOffers(
            targets.flatMap((target) => {
              const outcome = current.outcomes[target.piece.key];
              return outcome?.kind === 'ready'
                ? [
                    {
                      ...target.missing,
                      ...(target.raisedFrom === undefined ? {} : { raisedFrom: target.raisedFrom }),
                      listings:
                        sold.size === 0
                          ? outcome.listings
                          : outcome.listings.filter((listing) => !sold.has(listing.productId)),
                    },
                  ]
                : [];
            }),
            {
              ...(agent === null ? {} : { excludeSeller: agent }),
              ...(costs === null ? {} : { costs }),
            },
          ),
    [running, targets, current.outcomes, agent, costs, sold],
  );
  if (ranked !== null && ranked !== shown) setShown(ranked);
  const result = ranked ?? shown;

  const outcomes = Object.values(current.outcomes);
  return {
    phase: current.phase,
    total: targets.length,
    done: outcomes.length,
    failed: outcomes.filter((outcome) => outcome.kind === 'failed').length,
    result,
    start,
    stop,
    retryFailed,
    markSold,
  };
};
