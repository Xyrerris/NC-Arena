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
import { Platform } from 'react-native';

import { err, ok, type Result } from '../common';
import type { ImageSource, PickedImage } from './ports';

const NO_PERMISSION =
  'Arena Scout needs access to your photos to read a screenshot. Grant it in Settings, or ' +
  'type the stats in by hand.';

const NO_DELETE_PERMISSION = 'Arena Scout was not allowed to remove the screenshot.';

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * The picker's id, in the dialect `expo-media-library`'s `Asset` speaks.
 *
 * The two libraries disagree, quietly and without a type error, about what an "asset id"
 * is. `expo-image-picker` hands back the bare MediaStore row id on Android (`"56"`) and the
 * bare `PHAsset` localIdentifier on iOS; `new Asset(id)` wants a full `content://` URI on
 * Android and a `ph://`-prefixed one on iOS — and its iOS constructor drops the first five
 * characters unconditionally, so an unprefixed id arrives mangled rather than rejected.
 * Feeding one to the other looks perfectly reasonable and simply never deletes anything.
 *
 * Already-qualified ids pass through: if a future picker version starts returning URIs, the
 * right behaviour is to use them, not to prefix them twice.
 */
const toMediaLibraryId = (pickerAssetId: string): string => {
  if (pickerAssetId.includes('://')) return pickerAssetId;
  return Platform.OS === 'android'
    ? `content://media/external/images/media/${pickerAssetId}`
    : `ph://${pickerAssetId}`;
};

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
        // Android's modern Photo Picker (the default) hands back a `content://media/picker/…`
        // URI that carries no MediaStore id, so `discardOriginal` below would never have
        // anything to delete. `legacy` routes through the document provider instead, whose
        // URI does resolve to an id — the reason `requestMediaLibraryPermissionsAsync` above
        // exists at all, since the modern picker needs no permission.
        legacy: true,
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

  /**
   * KNOWN BROKEN on device, 2026-08-26 — the screenshot survives every time (ADR-0026).
   *
   * Two causes were found and fixed and the outcome did not change, so a third is still out
   * there and this is parked rather than solved. Do not read the code below as working: the
   * last thing confirmed about it is that it does not.
   *
   * The note the form prints says where to resume. `COPY_ONLY` means `assetId` was null and
   * this function was never called — suspect a stale JS bundle, since both fixes are JS-only
   * and an installed release APK carries its own. `KEPT` means the delete really was
   * attempted, and the question moves to the permission or to what `delete()` threw.
   */
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
      await new Asset(toMediaLibraryId(assetId)).delete();
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
