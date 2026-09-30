/**
 * Stands in for `zod/v4/locales/index.js` in the app's bundle (see `metro.config.js`).
 *
 * That index re-exports about seventy translations of Zod's error messages, and every public
 * Zod entry point (`zod`, `zod/mini`, `zod/v4/core`) re-exports it as `z.locales`. Metro does
 * not tree-shake, so all of them landed in the bundle — 266 KB of a 3.8 MB JS bundle, for
 * messages nothing here shows: `core/network` reads a parse failure as a `MALFORMED_RESPONSE`
 * and never puts Zod's text in front of a user.
 *
 * English is unaffected. `zod/v4/classic/schemas.js` imports `../locales/en.js` directly, so
 * nothing needs this index at runtime. The only thing lost is `z.locales.<code>`.
 */
module.exports = {};
