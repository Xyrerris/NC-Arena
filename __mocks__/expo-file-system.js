/**
 * The filesystem, for the jest projects only.
 *
 * Only `File` is needed, and only to delete the picker's working copy. It reports every
 * file as absent so `delete()` is never called: what happens to that copy is asserted
 * against a fake `ImageSource` in `statScanner.test.ts`, not against a real path.
 */

module.exports = {
  __esModule: true,
  File: class {
    constructor(uri) {
      this.uri = uri;
      this.exists = false;
    }
    delete() {}
  },
};
