/**
 * Loads the equipment and enhancement sheets for the Upgrade screen and parses them (ADR-0047).
 *
 * The fetch is `ArenaData.sheets`' (the node first, lib9c and Mimir as the fallback); the parse is
 * here, because `core/data` may not import `core/collection` and a feature may. Without the
 * experience sheet nothing can be valued, so that is a failure of its own, not an empty list.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  parseBaseExp,
  parseEnhancementCosts,
  parseEnhancementExp,
  parseEquipmentCatalog,
  type BaseExpByItem,
  type EnhancementCosts,
  type EnhancementExp,
  type EquipmentCatalog,
} from '@/core/collection';
import { useArenaData } from '@/core/data';
import type { Planet } from '@/core/model';

export type UpgradeSheetsState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'failed';
      readonly reason: 'OFFLINE' | 'FAILED' | 'MALFORMED' | 'NO_EXP';
    }
  | {
      readonly status: 'ready';
      readonly base: BaseExpByItem;
      readonly levels: EnhancementExp;
      readonly catalog: EquipmentCatalog;
      /** What raising a piece costs in NCG, for the planner. */
      readonly costs: EnhancementCosts;
      /** False when the node could not be read: no grade 9 gear and older experience values. */
      readonly onChain: boolean;
    };

export const useUpgradeSheets = (planet: Planet): UpgradeSheetsState & { retry: () => void } => {
  const { sheets } = useArenaData();
  if (sheets === undefined) {
    throw new Error(
      'The Upgrade screen needs `sheets` on ArenaData. The route layer supplies it in ' +
        'src/app/_layout.tsx, and in a test it is part of the provider value.',
    );
  }

  const [state, setState] = useState<UpgradeSheetsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void sheets.load(planet).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.error.reason });
        return;
      }
      if (result.value.enhancementCsv === undefined) {
        setState({ status: 'failed', reason: 'NO_EXP' });
        return;
      }
      try {
        setState({
          status: 'ready',
          base: parseBaseExp(result.value.equipmentCsv),
          levels: parseEnhancementExp(result.value.enhancementCsv),
          catalog: parseEquipmentCatalog(result.value.equipmentCsv),
          costs: parseEnhancementCosts(result.value.enhancementCsv),
          onChain: result.value.onChain === true,
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
