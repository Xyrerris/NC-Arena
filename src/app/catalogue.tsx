import { Redirect } from 'expo-router';

import { Catalogue } from '@/core/design-system/Catalogue';

/**
 * The component catalogue, debug builds and the visual gate's build only (ROADMAP.md Phase 1).
 *
 * `__DEV__` is false in release builds, so the route redirects rather than rendering — and
 * because the import is static, the catalogue is still in the bundle. That is the right
 * trade for now: the Phase 6 bundle-size review is where a `.development.tsx` split earns
 * its complexity, if it earns it at all.
 *
 * The `__DEV__` test alone was not enough, and the first real run of the Maestro gate is what
 * proved it: `arenascout://catalogue` redirected to the roster, so the flow photographing
 * every component photographed nothing. The gate needs a build with no Metro behind it —
 * otherwise the screenshots are of a dev launcher — and that build is a release build, where
 * `__DEV__` is false. Hence the second door: an `EXPO_PUBLIC_` flag Metro inlines at bundle
 * time, so the catalogue is reachable in the build `npm run e2e` runs against and stays
 * unreachable in the one that ships, which sets nothing.
 */
const CATALOGUE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_CATALOGUE === '1';

export default function CatalogueRoute() {
  if (!CATALOGUE_ENABLED) return <Redirect href="/" />;
  return <Catalogue />;
}
