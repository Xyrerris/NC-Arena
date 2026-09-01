import type { ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

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
  // Senza questo, `expo start` offre comunque il target web (tasto `w`, o l'apertura di
  // localhost:8081 nel browser) e il bundle fallisce su `react-native-web`, che ADR-0004
  // esclude di proposito. Dichiarare le piattaforme rende il rifiuto esplicito e leggibile.
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

export default withPickerSurvivingConfigChanges(config);
