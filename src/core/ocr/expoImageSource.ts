/**
 * `ImageSource` over the system photo picker (ADR-0024).
 *
 * Deliberately thin: everything worth testing lives in `statSheet.ts` and `statScanner.ts`,
 * and this file exists so that neither of them has to import a native module. It is the
 * only place in the app that asks for a permission.
 *
 * `allowsEditing` is **off**. A crop dialog sounds helpful and is the opposite: the parser
 * disambiguates the two combat powers on the screen by their distance to the stat panel
 * (`statSheet.ts`), so a user who crops the header away removes the very anchor that makes
 * the right one win.
 */

import * as ImagePicker from 'expo-image-picker';

import { err, ok, type Result } from '../common';
import type { ImageSource } from './ports';

const NO_PERMISSION =
  'Arena Scout needs access to your photos to read a screenshot. Grant it in Settings, or ' +
  'type the stats in by hand.';

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const expoImageSource: ImageSource = {
  name: 'expo-image-picker',

  pick: async (): Promise<Result<string | null>> => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return err(new Error(NO_PERMISSION));

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        // No re-encode. Recognition accuracy on a screenshot's small, thin numerals falls
        // off with JPEG artefacts, and there is nothing to save: the file is read once and
        // never stored.
        quality: 1,
      });

      if (picked.canceled) return ok(null);

      const uri = picked.assets[0]?.uri;
      // Not cancelled, and yet nothing selected. Unreachable through the UI, but the type
      // permits it, and an empty URI would surface downstream as "no text found" — a
      // message about the picture rather than about the picker.
      return uri === undefined ? err(new Error('The picker returned no image.')) : ok(uri);
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
