/**
 * Loads the game's sheets for the collection screen and parses them (ADR-0044).
 *
 * The fetch is `ArenaData.sheets`' (memoised per run, a failure not kept); the parse is here,
 * because `core/data` may not import `core/collection` and a feature may. A sheet that downloads
 * but does not parse is a failure of its own, `MALFORMED`, so the screen does not show a list
 * built from a file it could not read. `parseCollectionSheet` throws on a row it cannot read for
 * exactly that reason.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  parseCollectionSheet,
  parseEquipmentCatalog,
  type Collection,
  type EquipmentCatalog,
} from '@/core/collection';
import { useArenaData } from '@/core/data';
import type { Planet } from '@/core/model';

export type GameSheetsState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly reason: 'OFFLINE' | 'FAILED' | 'MALFORMED' }
  | {
      readonly status: 'ready';
      readonly sheet: readonly Collection[];
      readonly catalog: EquipmentCatalog;
    };

export const useGameSheets = (planet: Planet): GameSheetsState & { retry: () => void } => {
  const { sheets } = useArenaData();
  if (sheets === undefined) {
    throw new Error(
      'The collection screen needs `sheets` on ArenaData, or a `sheet` prop. The route layer ' +
        'supplies it in src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }

  const [state, setState] = useState<GameSheetsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void sheets.load(planet).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.error.reason });
        return;
      }
      try {
        setState({
          status: 'ready',
          sheet: parseCollectionSheet(result.value.collectionCsv),
          catalog: parseEquipmentCatalog(result.value.equipmentCsv),
        });
      } catch {
        setState({ status: 'failed', reason: 'MALFORMED' });
      }
    });
    return () => {
      current = false;
    };
  }, [sheets, planet, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
};
