/**
 * The two device capabilities a screenshot import needs, as ports (ADR-0024).
 *
 * They are separate rather than one `scanImage(): Promise<Draft>` because they fail for
 * genuinely different reasons and the user has to be told which: "you did not grant access
 * to your photos" and "there was no readable text in that picture" are two different
 * messages, and a single port would have flattened them into one shrug.
 *
 * Both return `Result` rather than throwing, for the reason `core/common/result.ts` gives:
 * a denied permission and an unreadable image are expected outcomes the product has a
 * message for, not programmer errors.
 */

import type { Result } from '../common';
import type { ScannedLine } from './statSheet';

/**
 * A screenshot the user chose, in the two forms it exists in.
 *
 * The distinction is the whole reason deleting is not one call. The picker does not hand
 * over the photo in the library; it hands over a **copy** it made in the app's cache, and
 * those two files have completely different standing. The copy is the app's litter. The
 * original is the user's picture, and removing it is irreversible.
 */
export interface PickedImage {
  /** The working copy, in the app's cache. This is what gets read. */
  readonly uri: string;
  /**
   * The library's id for the original, or null when there is no original this app can
   * name — the user browsed the filesystem directly, or granted access to selected photos
   * only. Null is a normal outcome, not a failure, and it means the screenshot stays.
   */
  readonly assetId: string | null;
}

/**
 * The user's photo library: where a picture comes from, and what happens to it once it has
 * been read (ADR-0026).
 */
export interface ImageSource {
  /** Identifies the source in the failure the user is shown. */
  readonly name: string;
  /**
   * A picked screenshot, or **null when the user backed out of the picker**.
   *
   * Cancelling is not a failure — it is the most common thing that happens after opening a
   * picker by accident — so it is a value rather than an error. A port that reported it as
   * one would put "Could not read the image" on screen every time somebody changed their
   * mind.
   */
  pick(): Promise<Result<PickedImage | null>>;
  /**
   * Deletes the working copy. Always safe: the app made that file and nothing else refers
   * to it, so this runs whether the read succeeded or not rather than leaving screenshots
   * accumulating in the cache.
   */
  discardCopy(uri: string): Promise<Result<void>>;
  /**
   * Deletes the screenshot **from the user's photo library**. Irreversible, and called only
   * after a read that actually produced stats — see `createStatScanner`.
   *
   * A refusal is an `err`, not a throw: the system asks its own confirmation on Android and
   * the user is allowed to say no, which is an outcome the form reports rather than an
   * exception.
   */
  discardOriginal(assetId: string): Promise<Result<void>>;
}

/** Turns an image into lines of text with their positions. */
export interface TextRecogniser {
  readonly name: string;
  recognise(uri: string): Promise<Result<readonly ScannedLine[]>>;
}
