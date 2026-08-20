/**
 * Leading and font assets. A `.tsx` test rather than `.ts` because `typography.ts` reads
 * `PixelRatio`, which is the convention jest.config.js encodes: the node project may not
 * touch react-native.
 */

import {
  FONT_ASSETS,
  REQUIRED_FONT_ASSETS,
  fontAssetName,
  lineHeightFor,
  typeScale,
} from './typography';

describe('lineHeightFor', () => {
  it('grows with the OS font scale — the reason leading is unitless (§2.5)', () => {
    const atOne = lineHeightFor(typeScale.body, 1);
    const atTwo = lineHeightFor(typeScale.body, 2);
    expect(atOne).toBe(22);
    expect(atTwo).toBe(45);
    // A fixed pixel line height would have clipped here instead: React Native scales
    // fontSize with the OS setting and leaves lineHeight exactly where it was.
    expect(atTwo).toBeGreaterThan((atOne ?? 0) * 1.9);
  });

  it('returns nothing where the scale sets no leading, leaving font metrics in charge', () => {
    expect(lineHeightFor(typeScale.titleSmall, 1)).toBeUndefined();
    expect(lineHeightFor(typeScale.numericHero, 2)).toBeUndefined();
  });
});

describe('font assets', () => {
  it('derives one family per weight, which is how Android resolves custom faces', () => {
    expect(fontAssetName(typeScale.displayLarge)).toBe('Cinzel-Bold');
    expect(fontAssetName(typeScale.body)).toBe('Barlow-Regular');
    expect(fontAssetName(typeScale.numericHero)).toBe('JetBrainsMono-Medium');
  });

  it('lists every file the type scale needs', () => {
    expect(REQUIRED_FONT_ASSETS).toContain('Cinzel-Bold');
    expect(REQUIRED_FONT_ASSETS).toContain('Barlow-SemiBold');
    expect(REQUIRED_FONT_ASSETS).toContain('JetBrainsMono-Regular');
    expect(new Set(REQUIRED_FONT_ASSETS).size).toBe(REQUIRED_FONT_ASSETS.length);
  });

  it('is either empty or complete, never half-dropped', () => {
    // The OFL files are not in the repository yet, so this passes on the empty branch. The
    // moment someone adds three of the eight, it fails — which is the point: a partial drop
    // renders one real face next to a fallback and looks like a design bug, not a build one.
    const present = Object.keys(FONT_ASSETS);
    if (present.length === 0) return;
    expect(present.sort()).toEqual([...REQUIRED_FONT_ASSETS].sort());
  });
});
