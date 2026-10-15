/**
 * The game's sheets, fetched once per run (ADR-0044).
 *
 * `load` is memoised on success and on a read still in flight, so opening the collection tab
 * twice, or two screens asking at once, make one pair of requests. A **failure is not kept**:
 * the next call tries again, which is what a retry button needs and what a transient network
 * error deserves.
 *
 * In memory only. A cold start offline therefore has no sheet and the screen says so; persisting
 * the text is the follow-up this leaves open (ADR-0044, "Next step").
 */

import type { GameSheets, Result, SheetError, SheetSource } from '../common';
import type { Planet } from '../model';

export interface SheetLibrary {
  load(planet: Planet): Promise<Result<GameSheets, SheetError>>;
}

export function createSheetLibrary({ source }: { source: SheetSource }): SheetLibrary {
  const reads = new Map<Planet, Promise<Result<GameSheets, SheetError>>>();

  return {
    load(planet) {
      const existing = reads.get(planet);
      if (existing !== undefined) return existing;

      const read = source.read(planet).then((result) => {
        if (!result.ok && reads.get(planet) === read) reads.delete(planet);
        return result;
      });
      reads.set(planet, read);
      return read;
    },
  };
}
