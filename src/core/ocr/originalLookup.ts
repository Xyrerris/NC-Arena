/**
 * Finding the original of a picked screenshot by what it looks like, not by its id.
 *
 * Kept out of `expoImageSource.ts` because it is the one decision in that adapter worth
 * testing: which library row, if any, is the picture the user tapped. Getting that wrong
 * deletes a different photo, so the rule is deliberately narrow — the same name, the same
 * pixel size, and **exactly one** row that has both. Two rows that match (a copy of the
 * screenshot in another folder, say) is not a coin toss this function gets to make; it
 * answers "not found" and the screenshot stays.
 */

import type { OriginalPicture } from './ports';

type Fingerprint = Extract<OriginalPicture, { kind: 'FINGERPRINT' }>;

/** One row of the photo library, as much of it as the match needs. */
export interface LibraryRow {
  /** The row's `content://` URI, as `expo-media-library` reports it. */
  readonly id: string;
  readonly filename: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * Whether the row's size is the picture's, in either orientation.
 *
 * The picker measures the decoded image, and the library may record the stored one; for a
 * photo carrying an EXIF rotation those two are each other's transpose. A screenshot has no
 * rotation, but accepting the swap costs nothing and the name still has to agree.
 */
const sameSize = (row: LibraryRow, picture: Fingerprint): boolean =>
  (row.width === picture.width && row.height === picture.height) ||
  (row.width === picture.height && row.height === picture.width);

/**
 * Whether the row is the one the picker's file name refers to.
 *
 * Two dialects. A document provider reports the real name, `Screenshot_….jpg`. The system
 * Photo Picker does not: it reports its own item id with the extension, `33.jpg`, and for a
 * photo stored on the device that id is the library row's — observed on API 36, and the only
 * thing a Photo Picker result says about where the picture lives. The digits-only guard
 * keeps a real file that happens to be called `33.jpg` from matching by accident on the
 * second rule; it still matches on the first, by its name.
 */
const sameName = (row: LibraryRow, fileName: string): boolean => {
  if (row.filename === fileName) return true;
  const pickerId = /^(\d+)\.[A-Za-z0-9]+$/.exec(fileName)?.[1];
  return pickerId !== undefined && row.id.split('/').pop() === pickerId;
};

/** The id of the one row that is the picture, or null when there is not exactly one. */
export const findOriginal = (rows: readonly LibraryRow[], picture: Fingerprint): string | null => {
  const matches = rows.filter((row) => sameName(row, picture.fileName) && sameSize(row, picture));
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
};
