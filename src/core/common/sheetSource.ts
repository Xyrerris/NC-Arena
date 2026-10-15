/**
 * The port behind "what are the game's collections and equipment called" (ADR-0044).
 *
 * Like `CollectionSource`, `core/network` implements it and `core/data` consumes it, so the
 * contract lives here. It hands back the sheets as **text**, unparsed: parsing is
 * `core/collection`'s, which `core/data` may not import, and a feature that may import both
 * does the parse where a malformed sheet can be reported to the user.
 *
 * **All the sheets or none.** A collection list with no names is still a list, but a list of
 * names for the wrong collections is not, so a read that got only some of them is a failure.
 */

import type { Planet } from '../model';
import type { Result } from './result';

export interface GameSheets {
  /** lib9c's `CollectionSheet.csv`: every collection and the items it asks for. */
  readonly collectionCsv: string;
  /** The chain's `EquipmentItemSheet`: `_name`, `item_sub_type`, `elemental_type` per item id. */
  readonly equipmentCsv: string;
  /** The chain's `CostumeItemSheet`, `MaterialItemSheet` and `ConsumableItemSheet`: what the rest of a collection is called. */
  readonly costumeCsv: string;
  readonly materialCsv: string;
  readonly consumableCsv: string;
  /** What answered, for the screen's "from" line. */
  readonly source: string;
}

/** Two reasons, for the same cause as `CollectionFailure`: the user has two remedies. */
export type SheetFailure = 'OFFLINE' | 'FAILED';

export interface SheetError {
  readonly reason: SheetFailure;
  readonly message: string;
}

export interface SheetSource {
  readonly name: string;
  /** `planet` picks the chain whose item sheet is read; the collection sheet is the game's own. */
  read(planet: Planet): Promise<Result<GameSheets, SheetError>>;
}
