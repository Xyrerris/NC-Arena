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

/** Where a picture comes from. Today the gallery; a camera would be a second implementation. */
export interface ImageSource {
  /** Identifies the source in the failure the user is shown. */
  readonly name: string;
  /**
   * A local URI, or **null when the user backed out of the picker**.
   *
   * Cancelling is not a failure — it is the most common thing that happens after opening a
   * picker by accident — so it is a value rather than an error. A port that reported it as
   * one would put "Could not read the image" on screen every time somebody changed their
   * mind.
   */
  pick(): Promise<Result<string | null>>;
}

/** Turns an image into lines of text with their positions. */
export interface TextRecogniser {
  readonly name: string;
  recognise(uri: string): Promise<Result<readonly ScannedLine[]>>;
}
