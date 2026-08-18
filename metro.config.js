/**
 * Added in Phase 2 alongside babel.config.js: Metro has to treat `.sql` as a source file
 * before `babel-plugin-inline-import` can inline it, or the migration imports in
 * src/core/db/migrations/migrations.js fail to resolve.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
