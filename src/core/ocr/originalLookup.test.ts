/**
 * Which photo gets deleted when the picker did not say (ADR-0026). A wrong answer here
 * removes somebody's unrelated picture, so most of these cases are about saying no.
 */

import { findOriginal, type LibraryRow } from './originalLookup';

const PICTURE = {
  kind: 'FINGERPRINT',
  fileName: 'Screenshot_20260811_150622_Nine Chronicles M.jpg',
  width: 3088,
  height: 1440,
} as const;

const row = (id: string, overrides: Partial<LibraryRow> = {}): LibraryRow => ({
  id,
  filename: PICTURE.fileName,
  width: PICTURE.width,
  height: PICTURE.height,
  ...overrides,
});

describe('findOriginal', () => {
  it('finds the one row with the same name and size', () => {
    const rows = [row('a', { filename: 'other.jpg' }), row('b'), row('c', { width: 1080 })];
    expect(findOriginal(rows, PICTURE)).toBe('b');
  });

  it('accepts the size recorded the other way round', () => {
    expect(findOriginal([row('a', { width: 1440, height: 3088 })], PICTURE)).toBe('a');
  });

  it('finds nothing in an empty library', () => {
    expect(findOriginal([], PICTURE)).toBeNull();
  });

  it('refuses a row whose name matches but whose size does not', () => {
    expect(findOriginal([row('a', { width: 1080, height: 2400 })], PICTURE)).toBeNull();
  });

  it('refuses a row whose size matches but whose name does not', () => {
    expect(findOriginal([row('a', { filename: 'Screenshot_other.jpg' })], PICTURE)).toBeNull();
  });

  it('refuses a row the library could not name', () => {
    expect(findOriginal([row('a', { filename: null })], PICTURE)).toBeNull();
  });

  describe('a Photo Picker result, named after its item id', () => {
    // What API 36 actually hands back: `33.jpg` for the library row `…/media/33`.
    const FROM_PHOTO_PICKER = { ...PICTURE, fileName: '33.jpg' } as const;
    const libraryRow = (n: number, overrides: Partial<LibraryRow> = {}): LibraryRow =>
      row(`content://media/external/images/media/${n}`, overrides);

    it('finds the row the id names, when the size agrees', () => {
      const rows = [libraryRow(32), libraryRow(33), libraryRow(333)];
      expect(findOriginal(rows, FROM_PHOTO_PICKER)).toBe(
        'content://media/external/images/media/33',
      );
    });

    it('refuses the row the id names when the size does not agree', () => {
      // The id alone is not trusted: a picker whose ids stopped being the library's would
      // otherwise delete whatever photo happened to share the number.
      const rows = [libraryRow(33, { width: 1080, height: 2400 })];
      expect(findOriginal(rows, FROM_PHOTO_PICKER)).toBeNull();
    });

    it('does not read a name with anything but digits as an id', () => {
      const rows = [libraryRow(33)];
      expect(findOriginal(rows, { ...PICTURE, fileName: 'IMG_33.jpg' })).toBeNull();
    });
  });

  it('refuses to choose between two rows that both match', () => {
    // A copy of the screenshot in a second folder. Either could be "the" original, and
    // deleting the wrong one is worse than deleting neither.
    expect(findOriginal([row('a'), row('b')], PICTURE)).toBeNull();
  });
});
