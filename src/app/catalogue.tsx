import { Redirect } from 'expo-router';

import { Catalogue } from '@/core/design-system/Catalogue';

/**
 * The component catalogue, debug builds only (ROADMAP.md Phase 1).
 *
 * `__DEV__` is false in release builds, so the route redirects rather than rendering — and
 * because the import is static, the catalogue is still in the bundle. That is the right
 * trade for now: Maestro runs against a build that has it, and the Phase 6 bundle-size
 * review is where a `.development.tsx` split earns its complexity, if it earns it at all.
 */
export default function CatalogueRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Catalogue />;
}
