import type { ExpoConfig } from 'expo/config';

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

export default config;
