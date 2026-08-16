// Flat config. Two things here are load-bearing and are not style preferences:
//   1. `boundaries/element-types` — the ARCHITECTURE.md §4 dependency rule.
//   2. the `toFixed` ban in core/common — ARCHITECTURE.md §2.2.
// Both are `error`. A disable comment on either is a review conversation, not a shortcut.

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'design/*', 'android/*', 'ios/*'],
  },

  // ---------------------------------------------------------------------------
  // Module boundaries (ARCHITECTURE.md §4)
  // ---------------------------------------------------------------------------
  {
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**/*' },
        { type: 'feature', pattern: 'src/features/*/**/*', capture: ['feature'] },
        { type: 'core-model', pattern: 'src/core/model/**/*' },
        { type: 'core-common', pattern: 'src/core/common/**/*' },
        { type: 'core-design-system', pattern: 'src/core/design-system/**/*' },
        { type: 'core-data', pattern: 'src/core/data/**/*' },
        { type: 'core-db', pattern: 'src/core/db/**/*' },
        { type: 'core-network', pattern: 'src/core/network/**/*' },
        { type: 'core-prefs', pattern: 'src/core/prefs/**/*' },
        { type: 'core-testing', pattern: 'src/core/testing/**/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: 'ARCHITECTURE.md §4: ${file.type} may not import ${dependency.type}.',
          rules: [
            // core/model depends on nothing. This is the rule that keeps the domain
            // model testable in plain Node.
            { from: ['core-model'], allow: [] },

            { from: ['core-common'], allow: ['core-model'] },
            { from: ['core-design-system'], allow: ['core-model', 'core-common'] },
            { from: ['core-db'], allow: ['core-model', 'core-common'] },
            { from: ['core-network'], allow: ['core-model', 'core-common'] },
            { from: ['core-prefs'], allow: ['core-model', 'core-common'] },

            // core/data is the only place that knows both the database and the
            // network exist.
            {
              from: ['core-data'],
              allow: ['core-model', 'core-common', 'core-db', 'core-network', 'core-prefs'],
            },

            // Features may not reach the database or the network, and may not reach
            // each other. The same-feature allowance is what makes a feature a unit
            // rather than a flat namespace.
            {
              from: ['feature'],
              allow: [
                'core-model',
                'core-common',
                'core-design-system',
                'core-data',
                ['feature', { feature: '${from.feature}' }],
              ],
            },

            // The route layer wires things together, so it is allowed core-db —
            // migrations run once in the root _layout (ARCHITECTURE.md §7).
            // It is still not allowed core-network: nothing above core/data fetches.
            {
              from: ['app'],
              allow: [
                'app',
                'feature',
                'core-model',
                'core-common',
                'core-design-system',
                'core-data',
                'core-db',
                'core-prefs',
              ],
            },

            // Fakes and helpers need to see everything they fake.
            { from: ['core-testing'], allow: ['*'] },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Rounding contract (ARCHITECTURE.md §2.2)
  // ---------------------------------------------------------------------------
  {
    files: ['src/core/common/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message:
            'ARCHITECTURE.md §2.2: toFixed is not a rounding specification. ' +
            '(9.995).toFixed(2) === "9.99", which is the exact boundary the formatting ' +
            'contract is tested at. Use roundHalfUp from core/common.',
        },
      ],
    },
  },
]);
