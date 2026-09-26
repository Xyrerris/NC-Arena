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
import { Asset, AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

import { err, ok, type Result } from '../common';
import { findOriginal } from './originalLookup';
import type { ImageSource, OriginalPicture, PickedImage } from './ports';

const NO_PERMISSION =
  'Arena Scout needs access to your photos to read a screenshot. Grant it in Settings, or ' +
  'type the stats in by hand.';

const NO_DELETE_PERMISSION = 'Arena Scout was not allowed to remove the screenshot.';

const NOT_FOUND = 'Arena Scout could not find the screenshot in your photos.';

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

/**
 * How `discardOriginal` will find the picture the user tapped.
 *
 * The library's id when the picker reported one. Otherwise the file name and pixel size the
 * picker read from the source — the case on every current Android device, whatever `legacy`
 * asks for, because the system Photo Picker answers and its URIs name no library row. (Its
 * file name is not the real one either: see `findOriginal`.) Null only when neither survived,
 * and `null` rather than a throw is the point: a screenshot nobody can name is still perfectly
 * readable, it just cannot be tidied away.
 */
const originalOf = (asset: ImagePicker.ImagePickerAsset): OriginalPicture | null => {
  if (asset.assetId) return { kind: 'ASSET', assetId: asset.assetId };
  if (!asset.fileName || asset.width <= 0 || asset.height <= 0) return null;
  return {
    kind: 'FINGERPRINT',
    fileName: asset.fileName,
    width: asset.width,
    height: asset.height,
  };
};

/**
 * The library's id for a fingerprinted picture, or null when it cannot be told apart.
 *
 * Only rows near the picture's size are fetched, which on a phone full of photos is a handful
 * rather than thousands; which of them is the picture, if any, is `findOriginal`'s call.
 */
const lookUp = async (
  picture: Extract<OriginalPicture, { kind: 'FINGERPRINT' }>,
): Promise<string | null> => {
  // A range rather than `within([w, h])`: on Android `within` rejects plain numbers — its
  // list-of-either argument does not convert — while the single-value comparisons do. The
  // range admits both orientations, and `findOriginal` checks the exact pair.
  const short = Math.min(picture.width, picture.height);
  const long = Math.max(picture.width, picture.height);
  const rows = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .gte(AssetField.WIDTH, short)
    .lte(AssetField.WIDTH, long)
    .gte(AssetField.HEIGHT, short)
    .lte(AssetField.HEIGHT, long)
    .exeForMetadata();
  return findOriginal(rows, picture);
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
        // Asks for the document provider, whose URI resolves to a library id. It is a request,
        // not a guarantee: on current Android the system Photo Picker answers this intent
        // too, and its URIs name no library row — which is why `pick` also records a
        // fingerprint for `discardOriginal` to search by (see `originalOf`).
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

      return ok({ uri: asset.uri, original: originalOf(asset) });
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
   * On device this was broken until 2026-09-26: the picker came back from the system Photo
   * Picker with no `assetId`, so the scan reported `COPY_ONLY` and the screenshot stayed.
   * A fingerprinted picture is now looked up in the library first (ADR-0026, amended).
   */
  discardOriginal: async (original: OriginalPicture): Promise<Result<void>> => {
    try {
      // Asked for **here** rather than beside the picker, for ADR-0026's reason: deleting
      // only ever happens after a scan that worked, so a user whose screenshot could not be
      // read is never asked for anything — and a permission requested next to the act it is
      // for is one the user can reason about.
      //
      // An id needs no read access: from API 30 the system's own delete dialog is the gate.
      // A fingerprint does, because finding the row means reading the library; "Select
      // photos" is enough if the user selects the screenshot.
      const permission =
        original.kind === 'ASSET'
          ? await requestPermissionsAsync(true)
          : await requestPermissionsAsync(false, ['photo']);
      if (!permission.granted) return err(new Error(NO_DELETE_PERMISSION));

      const id = original.kind === 'ASSET' ? original.assetId : await lookUp(original);
      if (id === null) return err(new Error(NOT_FOUND));

      // Android shows its own confirmation for this from API 30 on, and the user may say
      // no. That rejects the promise, which becomes a `KEPT` outcome upstream — a refusal
      // the form reports, not a failure it hides.
      await new Asset(toMediaLibraryId(id)).delete();
      return ok(undefined);
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
