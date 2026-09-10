/**
 * The filesystem, for the jest projects only.
 *
 * Two things need it and neither is asserted here. `core/ocr` deletes the picker's working
 * copy — every file reports as absent, so `delete()` is never called, and what happens to
 * that copy is asserted against a fake `ImageSource` in `statScanner.test.ts`. `core/data`
 * writes and picks a backup file — both are asserted against a fake `BackupFile` in
 * `RosterBackupControls.test.tsx`, for the same reason: a port exists so the test does not
 * have to own a filesystem (ADR-0024, ADR-0033).
 *
 * The picker reports a cancel. A test that wanted a file would be testing this mock.
 */

class Directory {
  constructor(...uris) {
    this.uri = uris.join('/');
    this.exists = false;
  }
  create() {}
}

class File {
  constructor(...uris) {
    this.uri = uris.map((part) => (part && part.uri) || part).join('/');
    this.exists = false;
  }
  create() {}
  write() {}
  delete() {}
  async text() {
    return '';
  }
  static async pickFileAsync() {
    return { result: null, canceled: true };
  }
}

module.exports = {
  __esModule: true,
  Directory,
  File,
  Paths: { cache: new Directory('file:///cache'), document: new Directory('file:///documents') },
};
