/**
 * Loads the bundled faces and reports when they are ready. The root layout holds the
 * splash screen on this, alongside the migrations, so no screen ever paints in a fallback
 * face and then reflows (ROADMAP.md Phase 1).
 *
 * With `FONT_ASSETS` still empty this resolves immediately, which is the intended
 * behaviour rather than a stub: the app boots and renders with platform fonts until the
 * OFL files land.
 */

import { useFonts } from 'expo-font';

import { FONT_ASSETS } from './typography';

export interface ArenaFontsState {
  loaded: boolean;
  error: Error | null;
}

export const useArenaFonts = (): ArenaFontsState => {
  const [loaded, error] = useFonts(FONT_ASSETS);
  return { loaded, error };
};
