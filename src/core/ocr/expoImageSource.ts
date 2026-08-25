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

import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import { err, ok, type Result } from '../common';
import type { ImageSource, PickedImage } from './ports';

const NO_PERMISSION =
  'Arena Scout needs access to your photos to read a screenshot. Grant it in Settings, or ' +
  'type the stats in by hand.';

const NO_DELETE_PERMISSION = 'Arena Scout was not allowed to remove the screenshot.';

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const expoImageSource: ImageSource = {
  name: 'expo-image-picker',

  pick: async (): Promise<Result<PickedImage | null>> => {
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

      const asset = picked.assets[0];
      // Not cancelled, and yet nothing selected. Unreachable through the UI, but the type
      // permits it, and an empty URI would surface downstream as "no text found" — a
      // message about the picture rather than about the picker.
      if (asset === undefined) return err(new Error('The picker returned no image.'));

      // `assetId` is the library's own id for the picture the user tapped, and it is the
      // only thing that makes deleting the original possible. It is absent when the user
      // browsed the filesystem directly or granted access to selected photos only, and
      // `??` rather than a throw is the point: a screenshot with no id is still perfectly
      // readable, it just cannot be tidied away afterwards.
      return ok({ uri: asset.uri, assetId: asset.assetId ?? null });
    } catch (cause) {
      return err(toError(cause));
    }
  },

  discardCopy: async (uri: string): Promise<Result<void>> => {
    try {
      const file = new File(uri);
      // `exists` first, because `delete()` throws on a missing file and "already gone" is
      // the outcome this function wants rather than an error to report.
      if (file.exists) file.delete();
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  },

  discardOriginal: async (assetId: string): Promise<Result<void>> => {
    try {
      // Write access is asked for **here** rather than beside the read permission at pick
      // time. Deleting only ever happens after a scan that worked, so a user whose
      // screenshot could not be read is never asked to hand over the right to delete it —
      // and a permission requested next to the act it is for is one the user can actually
      // reason about.
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) return err(new Error(NO_DELETE_PERMISSION));

      // Android shows its own confirmation for this from API 30 on, and the user may say
      // no. That rejects the promise, which becomes a `KEPT` outcome upstream — a refusal
      // the form reports, not a failure it hides.
      await new Asset(assetId).delete();
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
