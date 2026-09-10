/**
 * The system share sheet, for the jest projects only.
 *
 * The real module calls `requireNativeModule` at import time and throws in Node, so this
 * exists to keep `@/core/data/expoBackupFile` importable. It reports the share sheet as
 * available and shares nothing: what the export writes is asserted against a fake
 * `BackupFile` in `RosterBackupControls.test.tsx`, not by pretending a sheet opened
 * (ADR-0033).
 */

module.exports = {
  __esModule: true,
  isAvailableAsync: async () => true,
  shareAsync: async () => undefined,
};
