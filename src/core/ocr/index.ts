/**
 * Reading a player's stats off a screenshot (ADR-0024).
 *
 * A `core/*` module of its own rather than a folder inside `features/playerForm`, for the
 * reason ARCHITECTURE.md §4 gives everywhere else: the parser is pure domain logic that has
 * to run in the Node test project, and it would be unreachable from there if it lived
 * behind a feature that imports React. It may import `core/model` and `core/common` and
 * nothing else — enforced in eslint.config.js.
 *
 * Unlike `core/db`, this index **does** re-export its native-backed member
 * (`deviceStatScanner`), because a feature that could not reach it would have no scanner at
 * all. The two adapters underneath are mocked in the test run — see
 * `__mocks__/expo-image-picker.js` and its ML Kit sibling — which is what keeps the feature
 * tests running without a device.
 */

export { deviceStatScanner } from './deviceStatScanner';
export type { ImageSource, TextRecogniser } from './ports';
export { createStatScanner, type StatScanner, type StatScannerDeps } from './statScanner';
export {
  SCANNED_FIELDS,
  parseStatSheet,
  toWholeNumber,
  type ScanFrame,
  type ScannedField,
  type ScannedLine,
  type StatSheetScan,
} from './statSheet';
