import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  type ConfigPlugin,
} from 'expo/config-plugins';

/**
 * Arena Scout — Expo app config.
 *
 * Android-only by decision: see ARCHITECTURE.md §9.6 (iOS is a costed open decision,
 * not an assumption). No `ios` or `web` block is declared here on purpose — adding one
 * should be a visible diff, not a default that silently drifts into scope.
 */
const config: ExpoConfig = {
  name: 'Arena Scout',
  slug: 'arena-scout',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'arenascout',
  // Without this, `expo start` still offers the web target (the `w` key, or opening
  // localhost:8081 in a browser) and the bundle fails on `react-native-web`, which ADR-0004
  // excludes on purpose. Declaring the platforms makes the refusal explicit and readable.
  platforms: ['android'],
  // The design is dark-only (Phase 6 either confirms that or adds a light theme).
  // 'automatic' would hand the system a choice the design system cannot honour yet.
  userInterfaceStyle: 'dark',
  icon: './assets/images/icon.png',
  android: {
    package: 'com.ncarena.arenascout',
    adaptiveIcon: {
      backgroundColor: '#07100d',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // Default in the template is `false`. Phase 4 requires working predictive back,
    // and turning it on now means the whole build is exercised against it from day one
    // rather than having it switched on late, next to the screen that depends on it.
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    'expo-router',
    // Back since Phase 5, beside the code that uses it (ADR-0034, decision 5): the periodic
    // sync in `src/core/data/backgroundSync.ts`. Its plugin is still `withInfoPlist` and
    // nothing else, so on Android it changes no native file — WorkManager needs no manifest
    // entry — but the app now *does* have background work, so the declaration reads true, and
    // it is what an iOS build would need (ARCHITECTURE.md §9.6).
    'expo-background-task',
    [
      // ADR-0024. The permission string is written here rather than left to the plugin's
      // default, because Android shows it verbatim and the default says "the app" — which
      // tells the user nothing about why a stat book wants their photos.
      'expo-image-picker',
      {
        photosPermission:
          'Arena Scout reads a screenshot of the game to fill in the stats of a player. ' +
          'The picture is read on this device and never leaves it.',
      },
    ],
    [
      // ADR-0026. Write access, because the app deletes the screenshot once its stats are
      // in the form. Read access comes with it on Android and is not separable; the app
      // never browses the library, it only removes the one picture the user handed over.
      'expo-media-library',
      {
        photosPermission:
          'Arena Scout needs access to your photos to read a screenshot of the game.',
        savePhotosPermission:
          'Arena Scout deletes the screenshot it just read, so a picture you no longer ' +
          'need is not left behind.',
        // The parser reads text, never where a picture was taken. Off, so the app cannot
        // ask for a location permission it has no use for.
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#07100d',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  // The EAS project the builds belong to. Written by hand because `eas init` cannot write into
  // a dynamic config, and without it `eas build` stops at linking the project. `owner` pins it
  // to one account: the login can create projects in two, and EAS will not guess between them.
  owner: 'xyrerris',
  extra: {
    eas: { projectId: 'cfaf7d02-5126-428e-bde0-6f2d478ff716' },
  },
  experiments: {
    typedRoutes: true,
    // On by default in the SDK 57 template. Kept, and recorded in ADR-0003 —
    // it changes the memoisation guidance in ARCHITECTURE.md §8.
    reactCompiler: true,
  },
};

/**
 * Configuration changes MainActivity handles itself, instead of being recreated for.
 *
 * Not a preference about redraws: `expo-image-picker` registers its `ActivityResultLauncher`
 * once, against the Activity that existed when the module was created, and
 * expo-modules-core drops that registration on the Activity's `ON_DESTROY`
 * (`AppContextActivityResultRegistry`). A configuration change destroys the Activity while
 * React Native keeps the JS host — so nothing recreates the module, nothing re-registers the
 * launcher, and every later `launchImageLibraryAsync` throws "Attempting to launch an
 * unregistered ActivityResultLauncher" until the process is killed. `Fill from screenshot` is
 * dead for the rest of the session (ADR-0030).
 *
 * The template already declares the changes it thought were about layout — orientation,
 * uiMode, screen size. These four are the ones that were left to recreate the Activity, and
 * `fontScale` is the one that bites: the app asks its users to run at 200 % (ARCHITECTURE.md
 * §10), and the visual gate itself sets the scale with `adb` while the app is running.
 *
 * Handling a change is not the same as ignoring it — React Native forwards the new
 * `Configuration` to JS, and `scripts/e2e-screenshots.mjs` at 2.0 is what proves the text
 * still grows.
 */
const SELF_HANDLED_CONFIG_CHANGES = ['fontScale', 'density', 'locale', 'layoutDirection'];

const withPickerSurvivingConfigChanges: ConfigPlugin = (expoConfig) =>
  withAndroidManifest(expoConfig, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const declared = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    activity.$['android:configChanges'] = [
      ...declared,
      ...SELF_HANDLED_CONFIG_CHANGES.filter((change) => !declared.includes(change)),
    ].join('|');
    return mod;
  });

/**
 * R8 and resource shrinking in release builds (ROADMAP.md Phase 6, "R8 verified against a
 * release build").
 *
 * The template leaves both off, so until now "release" meant an unminified build and the R8
 * question was never asked. Turning them on is what makes the build the size a user downloads —
 * and what removed a class the app needs, see `KEEP_RULES`. As gradle properties rather than
 * edits to `android/app/build.gradle` because `android/` is generated and git-ignored: this is
 * the only place a setting can live and reach an EAS build.
 */
const RELEASE_SHRINKING = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

const withShrunkenRelease: ConfigPlugin = (expoConfig) =>
  withGradleProperties(expoConfig, (mod) => {
    const keys = new Set(Object.keys(RELEASE_SHRINKING));
    const others = mod.modResults.filter((item) => item.type !== 'property' || !keys.has(item.key));
    mod.modResults = [
      ...others,
      ...Object.entries(RELEASE_SHRINKING).map(([key, value]) => ({
        type: 'property' as const,
        key,
        value,
      })),
    ];
    return mod;
  });

/**
 * What R8 must not remove.
 *
 * `RNHeadlessAppLoader` is named only in `expo-modules-core`'s manifest, as a meta-data string,
 * and instantiated by reflection when WorkManager wakes the app with no UI. Nothing in the
 * code graph points at it, so R8 removed it, and the periodic sync (ADR-0040) would have died
 * on the one path it exists for: `ClassNotFoundException` in logcat, no sync, no error on
 * screen. Found by listing every class the merged manifest names against R8's `usage.txt` —
 * this was the only one of 89.
 */
const KEEP_RULES = ['-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { *; }'];

const withKeepRules: ConfigPlugin = (expoConfig) =>
  withDangerousMod(expoConfig, [
    'android',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const missing = KEEP_RULES.filter((rule) => !current.includes(rule));
      if (missing.length > 0) {
        const separator = current === '' || current.endsWith('\n') ? '' : '\n';
        fs.writeFileSync(file, `${current}${separator}\n# Phase 6\n${missing.join('\n')}\n`);
      }
      return mod;
    },
  ]);

export default withKeepRules(withShrunkenRelease(withPickerSurvivingConfigChanges(config)));
