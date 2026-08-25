/**
 * ML Kit text recognition, for the jest projects only.
 *
 * The real module calls `requireNativeModule` at import time and throws in Node, so this
 * exists to keep `@/core/ocr`'s index importable from a feature test. It recognises
 * nothing: what a screenshot parses into is proven in `src/core/ocr/statSheet.test.ts`
 * against recorded lines, not by pretending an OCR engine ran.
 */

module.exports = {
  __esModule: true,
  recognizeText: async () => ({ text: '', blocks: [] }),
};
