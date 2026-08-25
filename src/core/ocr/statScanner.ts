/**
 * Pick an image, read it, put the screenshot away (ADR-0024, ADR-0026).
 *
 * This is the whole feature, expressed as composition over two ports and one pure
 * function — so the interesting behaviour (a cancelled picker is not a failure; a picture
 * with no stats in it is a failure the user can act on; a screenshot that failed to read is
 * a screenshot the user keeps) is provable in the Node test project with fakes, and the
 * device adapters underneath it hold no logic worth testing.
 */

import { err, ok, type Result } from '../common';
import type { ImageSource, PickedImage, TextRecogniser } from './ports';
import { parseStatSheet, type StatSheetScan } from './statSheet';

/**
 * What became of the picture, so the form can say so rather than leaving the user to open
 * their gallery and check.
 *
 * There is no `'unknown'`. Deleting somebody's photo is not something an app gets to be
 * vague about, so every path below resolves to one of these three and the note prints it.
 */
export type ScreenshotOutcome =
  /** Gone from the photo library. The working copy went with it. */
  | 'DELETED'
  /** Only the app's working copy went — the library had no id for the original. */
  | 'COPY_ONLY'
  /** Still in the photo library: permission refused, the system dialog declined, or an error. */
  | 'KEPT';

export interface StatScanResult {
  readonly sheet: StatSheetScan;
  readonly screenshot: ScreenshotOutcome;
}

export interface StatScanner {
  /**
   * Null when the user dismissed the picker without choosing anything — see
   * `ImageSource.pick`. Distinguishing that from a scan that found nothing is the reason
   * this is `Result<StatScanResult | null>` and not `Result<StatScanResult>`.
   */
  scan(): Promise<Result<StatScanResult | null>>;
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

export const createStatScanner = ({ source, recogniser }: StatScannerDeps): StatScanner => {
  /**
   * The app's own litter, on every path out of a successful pick.
   *
   * Its failure is deliberately dropped rather than reported: the file lives in the cache
   * directory, the OS reclaims it under pressure, and there is nothing the user could do
   * with the news. That is a decision, not a swallowed error — the *original* is a
   * different matter entirely and is never handled this way.
   */
  const dropCopy = async (uri: string): Promise<void> => {
    await source.discardCopy(uri);
  };

  /**
   * The irreversible half, and the only place it happens.
   *
   * It runs **after** a successful read, never before and never on a failure. A screenshot
   * that could not be read is a screenshot the user still needs — to try again, or to type
   * from — and deleting it would turn a recoverable disappointment into a lost picture.
   */
  const putAway = async (image: PickedImage): Promise<ScreenshotOutcome> => {
    await dropCopy(image.uri);
    if (image.assetId === null) return 'COPY_ONLY';
    const removed = await source.discardOriginal(image.assetId);
    return removed.ok ? 'DELETED' : 'KEPT';
  };

  return {
    scan: async (): Promise<Result<StatScanResult | null>> => {
      const picked = await source.pick();
      // Re-wrapped rather than returned as-is: `Result` is invariant in its value type, so
      // a failed `Result<PickedImage | null>` is not a failed `Result<StatScanResult |
      // null>` even though it carries only an error. Narrowed on `.ok` rather than through
      // `isOk`, whose predicate only narrows the success branch.
      if (!picked.ok) return err(picked.error);
      if (picked.value === null) return ok(null);
      const image = picked.value;

      const read = await recogniser.recognise(image.uri);
      if (!read.ok) {
        await dropCopy(image.uri);
        return err(read.error);
      }

      const sheet = parseStatSheet(read.value);
      // Zero fields is reported as a failure rather than as an empty success, because an
      // empty success would leave the form exactly as it was and the user with no idea
      // whether the scan ran at all. The picture stays: it is the evidence.
      if (sheet.found.length === 0) {
        await dropCopy(image.uri);
        return err(new Error(NOTHING_FOUND));
      }

      return ok({ sheet, screenshot: await putAway(image) });
    },
  };
};
