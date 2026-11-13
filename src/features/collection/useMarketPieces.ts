/**
 * Reads the market for the pieces of one collection, for the sheet that lists them (ADR-0044).
 *
 * The first piece is read at once; the others follow one after another in the background, so
 * their chips can show how many listings they have without the sheet asking a public service for
 * six scans together. Choosing a piece that has not had its turn starts it now. The reading
 * itself is `ArenaData.market`'s — kept for a minute, shared, stopped when nobody waits — and
 * what this hook adds is only which piece is in which state, and the end of it all when the sheet
 * closes: leaving aborts every scan this sheet started, and the library stops the ones nobody else
 * is waiting for.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { matchingListings } from '@/core/collection';
import type { MarketListing } from '@/core/common';
import { useArenaData } from '@/core/data';
import type { Planet } from '@/core/model';

import type { MarketPiece } from './marketUiState';

export type PieceState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'scanning'; readonly scanned: number }
  | {
      readonly kind: 'ready';
      /** The listings the piece accepts, cheapest first. */
      readonly listings: readonly MarketListing[];
      /** How many listings of the item were read to find them. */
      readonly scanned: number;
      readonly readAt: number;
    }
  | { readonly kind: 'failed'; readonly reason: 'OFFLINE' | 'FAILED' }
  | { readonly kind: 'not-sold' };

export interface MarketPiecesController {
  readonly states: Readonly<Record<string, PieceState>>;
  /** Starts a piece that has not had its turn, so the person is never made to wait for a queue. */
  readonly select: (key: string) => void;
  /** Reads a failed piece again. */
  readonly retry: (key: string) => void;
}

export const useMarketPieces = (
  planet: Planet,
  pieces: readonly MarketPiece[],
): MarketPiecesController => {
  const { market } = useArenaData();
  if (market === undefined) {
    throw new Error(
      'The market sheet needs `market` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }

  const [states, setStates] = useState<Record<string, PieceState>>(() =>
    Object.fromEntries(
      pieces.map((piece) => [
        piece.key,
        piece.route.kind === 'not-sold' ? { kind: 'not-sold' } : { kind: 'waiting' },
      ]),
    ),
  );
  const started = useRef(new Set<string>());
  const stop = useRef<AbortController | null>(null);

  const put = useCallback((key: string, state: PieceState): void => {
    setStates((current) => ({ ...current, [key]: state }));
  }, []);

  const start = useCallback(
    (piece: MarketPiece): Promise<void> => {
      const signal = stop.current?.signal;
      if (piece.route.kind !== 'route' || started.current.has(piece.key)) return Promise.resolve();
      if (signal === undefined || signal.aborted) return Promise.resolve();

      started.current.add(piece.key);
      put(piece.key, { kind: 'scanning', scanned: 0 });
      return market
        .scan(planet, piece.route.itemSubType, piece.requirement.itemId, {
          signal,
          onProgress: (scanned) => put(piece.key, { kind: 'scanning', scanned }),
        })
        .then((result) => {
          if (!result.ok) {
            // A stopped scan means the sheet is gone; there is nothing left to tell.
            if (result.error.reason === 'CANCELLED') return;
            put(piece.key, { kind: 'failed', reason: result.error.reason });
            return;
          }
          put(piece.key, {
            kind: 'ready',
            listings: matchingListings(piece.requirement, result.value.listings),
            scanned: result.value.listings.length,
            readAt: result.value.readAt,
          });
        });
    },
    [market, planet, put],
  );

  useEffect(() => {
    const controller = new AbortController();
    stop.current = controller;
    started.current = new Set();
    void (async () => {
      for (const piece of pieces) {
        if (controller.signal.aborted) return;
        await start(piece);
      }
    })();
    return () => controller.abort();
  }, [pieces, start]);

  const select = useCallback(
    (key: string) => {
      const piece = pieces.find((candidate) => candidate.key === key);
      if (piece !== undefined) void start(piece);
    },
    [pieces, start],
  );

  const retry = useCallback(
    (key: string) => {
      const piece = pieces.find((candidate) => candidate.key === key);
      if (piece === undefined) return;
      started.current.delete(key);
      void start(piece);
    },
    [pieces, start],
  );

  return { states, select, retry };
};
