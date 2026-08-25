/**
 * The photo picker, for the jest projects only.
 *
 * A root `__mocks__` module beside node_modules is picked up automatically for a
 * node_modules package, with no `jest.mock` call in any test — the same mechanism
 * `react-native-reanimated.js` next door relies on.
 *
 * It resolves to **cancelled**, which is the one outcome that needs no fixture and no
 * permission: a test that cares what a scan produces builds its own `createStatScanner`
 * over the `ImageSource` and `TextRecogniser` ports (ADR-0024), so nothing worth asserting
 * ever comes through this file.
 */

module.exports = {
  __esModule: true,
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
};
