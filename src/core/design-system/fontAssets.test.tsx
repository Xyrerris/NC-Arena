/**
 * The asset map, in the jest-expo project — an asset `require` only resolves under a
 * bundler that knows what a `.ttf` is.
 */

import { FONTS_BUNDLED, FONT_ASSETS } from './fontAssets';
import { REQUIRED_FONT_ASSETS } from './typography';

describe('FONT_ASSETS', () => {
  it('registers every face the type scale asks for, and no others', () => {
    // Not "contains all of" — exactly equal. A stray entry means a file is being bundled
    // that nothing renders, and a missing one means a fallback face nobody notices until
    // it is on a device.
    expect(Object.keys(FONT_ASSETS).sort()).toEqual([...REQUIRED_FONT_ASSETS].sort());
  });

  it('resolves each face to an asset handle rather than undefined', () => {
    for (const [name, handle] of Object.entries(FONT_ASSETS)) {
      expect(handle).toBeDefined();
      expect(name).toMatch(/^(Cinzel|Barlow|JetBrainsMono)-/);
    }
  });

  it('reports the faces as bundled, which is what makes ArenaText name a family', () => {
    expect(FONTS_BUNDLED).toBe(true);
  });
});
