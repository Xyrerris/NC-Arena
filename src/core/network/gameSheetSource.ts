/**
 * `SheetSource` over lib9c on GitHub and Mimir (ADR-0044).
 *
 * - **The collection sheet comes from lib9c, not from Mimir.** Measured on 2026-10-01 and again on
 *   2026-10-14 against the test avatar: Mimir's `CollectionSheet` has 822 rows and lacks collections
 *   the avatar has unlocked; lib9c's has 942 and has them all. A stale list would read as "you are
 *   further along than you are".
 * - **The equipment sheet comes from Mimir.** It is the chain's own `EquipmentItemSheet`, with the
 *   English `_name` and `elemental_type` the collection sheet does not carry.
 *
 * It is fetched when the screen opens, not bundled: lib9c is GPL-3.0 and shipping a copy in the
 * app is a licence decision that is still the owner's (ADR-0044, "Where item names are").
 *
 * The two requests go out together and either failing fails the read.
 */

import { z } from 'zod';

import {
  err,
  ok,
  type GameSheets,
  type Result,
  type SheetError,
  type SheetSource,
} from '../common';
import type { Planet } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import type { NetworkError } from './errors';
import { HttpClient } from './httpClient';
import { MIMIR_ENDPOINTS } from './mimirCollectionSource';

export const LIB9C_COLLECTION_SHEET_URL =
  'https://raw.githubusercontent.com/planetarium/lib9c/development/Lib9c/TableCSV/CollectionSheet.csv';

/** Thor has no Mimir endpoint, and the item sheet is the same on every planet that has one. */
const FALLBACK_PLANET: Planet = 'heimdall';

const sheetSchema = z.object({ sheet: z.object({ csv: z.string().min(1) }).nullish() });

export class GameSheetSource implements SheetSource {
  readonly name = 'lib9c+mimir';

  constructor(
    private readonly collectionSheetUrl: string = LIB9C_COLLECTION_SHEET_URL,
    private readonly endpoints: Partial<Record<Planet, string>> = MIMIR_ENDPOINTS,
  ) {}

  async read(planet: Planet): Promise<Result<GameSheets, SheetError>> {
    const [collection, equipment] = await Promise.all([
      new HttpClient(this.collectionSheetUrl, null).requestText(''),
      this.readEquipmentSheet(planet),
    ]);
    if (!collection.ok) return err(this.failure(collection.error));
    if (!equipment.ok) return err(equipment.error);
    if (collection.value.trim() === '') return err(this.failed('the collection sheet was empty.'));

    return ok({
      collectionCsv: collection.value,
      equipmentCsv: equipment.value,
      source: this.name,
    });
  }

  private async readEquipmentSheet(planet: Planet): Promise<Result<string, SheetError>> {
    const endpoint = this.endpoints[planet] ?? this.endpoints[FALLBACK_PLANET];
    if (endpoint === undefined) return err(this.failed('there is no endpoint for the item sheet.'));

    const response = await postGraphql(
      endpoint,
      '{ sheet(sheetName: "EquipmentItemSheet") { csv } }',
    );
    if (!response.ok) return err(this.failure(response.error));

    const parsed = sheetSchema.safeParse(response.value.data ?? {});
    const csv = parsed.success ? parsed.data.sheet?.csv : undefined;
    if (csv === undefined) {
      return err(
        this.failed(response.value.errors[0]?.message ?? 'the item sheet did not come back.'),
      );
    }
    return ok(csv);
  }

  private failed(message: string): SheetError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }

  private failure(error: NetworkError): SheetError {
    return networkFailure(this.name, error);
  }
}
