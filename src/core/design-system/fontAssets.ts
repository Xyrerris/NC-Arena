/**
 * The eight faces `useFonts` registers at boot.
 *
 * Split out of `typography.ts` so the type scale stays importable in the fast Jest project:
 * an asset `require` only resolves under Metro, and this file is therefore native-only
 * while the scale beside it is plain data.
 *
 * Keys are the family names Android resolves by, derived from the type scale by
 * `fontAssetName`. `REQUIRED_FONT_ASSETS` is the generated list and a test asserts this
 * object matches it exactly — a partial drop renders one real face next to seven fallbacks
 * and gets triaged as a design bug rather than a build one.
 *
 * `require` rather than `import`: Metro resolves an asset require to a numeric handle, and
 * the point is that these are files on disk rather than modules.
 */

export const FONT_ASSETS: Record<string, number> = {
  'Cinzel-Bold': require('../../../assets/fonts/Cinzel-Bold.ttf'),
  'Cinzel-Medium': require('../../../assets/fonts/Cinzel-Medium.ttf'),
  'Barlow-Regular': require('../../../assets/fonts/Barlow-Regular.ttf'),
  'Barlow-Medium': require('../../../assets/fonts/Barlow-Medium.ttf'),
  'Barlow-SemiBold': require('../../../assets/fonts/Barlow-SemiBold.ttf'),
  'Barlow-Bold': require('../../../assets/fonts/Barlow-Bold.ttf'),
  'JetBrainsMono-Regular': require('../../../assets/fonts/JetBrainsMono-Regular.ttf'),
  'JetBrainsMono-Medium': require('../../../assets/fonts/JetBrainsMono-Medium.ttf'),
};

/** Read by `ArenaText` to decide whether to name a family at all. */
export const FONTS_BUNDLED = Object.keys(FONT_ASSETS).length > 0;
