/**
 * Pick an image, read it, and turn it into a stat sheet (ADR-0024).
 *
 * This is the whole feature, expressed as composition over two ports and one pure
 * function — so the interesting behaviour (a cancelled picker is not a failure; a picture
 * with no stats in it is a failure the user can act on) is provable in the Node test
 * project with fakes, and the device adapters underneath it hold no logic worth testing.
 */

import { err, ok, type Result } from '../common';
import type { ImageSource, TextRecogniser } from './ports';
import { parseStatSheet, type StatSheetScan } from './statSheet';

export interface StatScanner {
  /**
   * Null when the user dismissed the picker without choosing anything — see
   * `ImageSource.pick`. Distinguishing that from a scan that found nothing is the reason
   * this is `Result<StatSheetScan | null>` and not `Result<StatSheetScan>`.
   */
  scan(): Promise<Result<StatSheetScan | null>>;
}

export interface StatScannerDeps {
  source: ImageSource;
  recogniser: TextRecogniser;
}

/**
 * A picture with words in it but no stat sheet — a photo, the wrong screen of the game, a
 * meme. Named rather than inlined because it is the failure the user is by far most likely
 * to hit, and it is the one that has to say what to do next.
 */
const NOTHING_FOUND =
  'No stats were found in that picture. Use the profile screen that shows CP and the stat ' +
  'list, uncropped.';

export const createStatScanner = ({ source, recogniser }: StatScannerDeps): StatScanner => ({
  scan: async (): Promise<Result<StatSheetScan | null>> => {
    const picked = await source.pick();
    // Re-wrapped rather than returned as-is: `Result` is invariant in its value type, so a
    // failed `Result<string | null>` is not a failed `Result<StatSheetScan | null>` even
    // though it carries only an error. Narrowed on `.ok` rather than through `isOk`, whose
    // predicate only narrows the success branch.
    if (!picked.ok) return err(picked.error);
    if (picked.value === null) return ok(null);

    const read = await recogniser.recognise(picked.value);
    if (!read.ok) return err(read.error);

    const scan = parseStatSheet(read.value);
    // Zero fields is reported as a failure rather than as an empty success, because an
    // empty success would leave the form exactly as it was and the user with no idea
    // whether the scan ran at all.
    if (scan.found.length === 0) return err(new Error(NOTHING_FOUND));
    return ok(scan);
  },
});
