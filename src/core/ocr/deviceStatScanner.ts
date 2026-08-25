/**
 * The scanner the app actually runs: the system photo picker, then on-device ML Kit.
 *
 * A module-level constant rather than a factory, because there is nothing to configure and
 * nothing to dispose — both adapters are stateless. Tests never reach this file; they build
 * their own `createStatScanner` over fakes, which is the entire reason the ports exist
 * (ADR-0024).
 */

import { expoImageSource } from './expoImageSource';
import { mlKitTextRecogniser } from './mlKitTextRecogniser';
import { createStatScanner, type StatScanner } from './statScanner';

export const deviceStatScanner: StatScanner = createStatScanner({
  source: expoImageSource,
  recogniser: mlKitTextRecogniser,
});
