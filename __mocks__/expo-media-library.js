/**
 * The photo library, for the jest projects only.
 *
 * A root `__mocks__` module beside node_modules is picked up automatically, with no
 * `jest.mock` call in any test — the same mechanism `react-native-reanimated.js` next door
 * relies on.
 *
 * `Asset.delete` **throws**. Nothing in the suite should reach it: deleting somebody's
 * photo is the one thing this codebase will not exercise through a mock that shrugs, so a
 * test that wires up the real adapter by accident fails loudly instead of silently
 * appearing to have removed a picture (ADR-0026).
 */

module.exports = {
  __esModule: true,
  requestPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  Asset: class {
    constructor(id) {
      this.id = id;
    }
    async delete() {
      throw new Error(
        'expo-media-library is mocked: a test must not delete a photo. Build a fake ' +
          'ImageSource instead — see src/core/ocr/ports.ts.',
      );
    }
  },
};
