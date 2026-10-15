/**
 * Added in Phase 2 alongside babel.config.js: Metro has to treat `.sql` as a source file
 * before `babel-plugin-inline-import` can inline it, or the migration imports in
 * src/core/db/migrations/migrations.js fail to resolve.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

/**
 * Phase 6 bundle review: Zod ships about seventy translations of its error messages and every
 * entry point re-exports them, so Metro — which does not tree-shake — bundled all of them.
 * 266 KB, none of it reachable from the app. Inside Zod only, that one import resolves to an
 * empty module (see the stub for what is and is not lost). Every other request goes through
 * the resolver Expo already configured.
 */
const EMPTY_ZOD_LOCALES = path.join(__dirname, 'metro', 'empty-zod-locales.js');
const NODE_MODULES_ZOD = `${path.sep}node_modules${path.sep}zod${path.sep}`;
const resolveUpstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../locales/index.js' && context.originModulePath.includes(NODE_MODULES_ZOD)) {
    return { type: 'sourceFile', filePath: EMPTY_ZOD_LOCALES };
  }
  return (resolveUpstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
