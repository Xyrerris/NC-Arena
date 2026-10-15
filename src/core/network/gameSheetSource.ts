/**
 * `SheetSource` over lib9c on GitHub and Mimir (ADR-0044).
 *
 * - **The collection sheet comes from lib9c, not from Mimir.** Measured on 2026-10-01 and again on
 *   2026-10-14 against the test avatar: Mimir's `CollectionSheet` has 822 rows and lacks collections
 *   the avatar has unlocked; lib9c's has 942 and has them all. A stale list would read as "you are
 *   further along than you are".
 * - **The item sheets come from Mimir.** The chain's own `EquipmentItemSheet`, with the English
 *   `_name` and `elemental_type` the collection sheet does not carry, and the costume, material
 *   and consumable sheets for the rest of what a collection asks for.
 *
 * It is fetched when the screen opens, not bundled: lib9c is GPL-3.0 and shipping a copy in the
 * app is a licence decision that is still the owner's (ADR-0044, "Where item names are").
 *
 * The two requests go out together and either failing fails the read; so does any one item sheet
 * missing from Mimir's answer.
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

const csvSchema = z.object({ csv: z.string().min(1) }).nullish();

/**
 * The four item sheets in one request, by alias: Mimir serves them all the same way, and four
 * requests for sheets that are only useful together would be four chances to fail.
 */
const ITEM_SHEETS_QUERY =
  '{ equipment: sheet(sheetName: "EquipmentItemSheet") { csv } ' +
  'costume: sheet(sheetName: "CostumeItemSheet") { csv } ' +
  'material: sheet(sheetName: "MaterialItemSheet") { csv } ' +
  'consumable: sheet(sheetName: "ConsumableItemSheet") { csv } }';

const itemSheetsSchema = z.object({
  equipment: csvSchema,
  costume: csvSchema,
  material: csvSchema,
  consumable: csvSchema,
});

interface ItemSheets {
  readonly equipmentCsv: string;
  readonly costumeCsv: string;
  readonly materialCsv: string;
  readonly consumableCsv: string;
}

export class GameSheetSource implements SheetSource {
  readonly name = 'lib9c+mimir';

  constructor(
    private readonly collectionSheetUrl: string = LIB9C_COLLECTION_SHEET_URL,
    private readonly endpoints: Partial<Record<Planet, string>> = MIMIR_ENDPOINTS,
  ) {}

  async read(planet: Planet): Promise<Result<GameSheets, SheetError>> {
    const [collection, items] = await Promise.all([
      new HttpClient(this.collectionSheetUrl, null).requestText(''),
      this.readItemSheets(planet),
    ]);
    if (!collection.ok) return err(this.failure(collection.error));
    if (!items.ok) return err(items.error);
    if (collection.value.trim() === '') return err(this.failed('the collection sheet was empty.'));

    return ok({
      collectionCsv: collection.value,
      ...items.value,
      source: this.name,
    });
  }

  private async readItemSheets(planet: Planet): Promise<Result<ItemSheets, SheetError>> {
    const endpoint = this.endpoints[planet] ?? this.endpoints[FALLBACK_PLANET];
    if (endpoint === undefined) return err(this.failed('there is no endpoint for the item sheet.'));

    const response = await postGraphql(endpoint, ITEM_SHEETS_QUERY);
    if (!response.ok) return err(this.failure(response.error));

    const parsed = itemSheetsSchema.safeParse(response.value.data ?? {});
    const sheets = parsed.success ? parsed.data : undefined;
    if (
      sheets?.equipment == null ||
      sheets.costume == null ||
      sheets.material == null ||
      sheets.consumable == null
    ) {
      return err(
        this.failed(response.value.errors[0]?.message ?? 'the item sheets did not come back.'),
      );
    }
    return ok({
      equipmentCsv: sheets.equipment.csv,
      costumeCsv: sheets.costume.csv,
      materialCsv: sheets.material.csv,
      consumableCsv: sheets.consumable.csv,
    });
  }

  private failed(message: string): SheetError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }

  private failure(error: NetworkError): SheetError {
    return networkFailure(this.name, error);
  }
}
