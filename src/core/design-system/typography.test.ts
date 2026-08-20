/**
 * The type scale, in the fast Jest project. `typography.ts` imports nothing, so none of
 * this needs a renderer — which is the reason the asset `require` map was split out into
 * `fontAssets.ts`.
 */

import { fontAssetName, lineHeightFor, REQUIRED_FONT_ASSETS, typeScale } from './typography';

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

describe('font asset names', () => {
  it('derives one family per weight, which is how Android resolves custom faces', () => {
    expect(fontAssetName(typeScale.displayLarge)).toBe('Cinzel-Bold');
    expect(fontAssetName(typeScale.body)).toBe('Barlow-Regular');
    expect(fontAssetName(typeScale.numericHero)).toBe('JetBrainsMono-Medium');
  });

  it('lists exactly the eight files the type scale needs', () => {
    expect(REQUIRED_FONT_ASSETS).toEqual([
      'Barlow-Bold',
      'Barlow-Medium',
      'Barlow-Regular',
      'Barlow-SemiBold',
      'Cinzel-Bold',
      'Cinzel-Medium',
      'JetBrainsMono-Medium',
      'JetBrainsMono-Regular',
    ]);
  });
});
