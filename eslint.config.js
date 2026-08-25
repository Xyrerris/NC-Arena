// Flat config. Two things here are load-bearing and are not style preferences:
//   1. `boundaries/dependencies` — the ARCHITECTURE.md §4 dependency rule.
//   2. the `toFixed` ban in core/common — ARCHITECTURE.md §2.2.
// Both are `error`. A disable comment on either is a review conversation, not a shortcut.
//
// The boundaries block is written against eslint-plugin-boundaries v7. It was v5 syntax
// until ADR-0006 was closed, and v7 accepted that shape, warned about it, and enforced
// nothing — so the rule reported zero violations while looking configured. If this block
// is ever edited, re-run the check in ADR-0006 rather than trusting a green lint run.

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');
const prettier = require('eslint-config-prettier');

/** Reads as the §4 table does: what each module is allowed to reach. */
const to = (...types) => ({ to: { element: { types: { anyOf: types } } } });

// ---------------------------------------------------------------------------
// Design-token restrictions (ARCHITECTURE.md §2.4, ROADMAP.md Phase 1)
// ---------------------------------------------------------------------------
// These three are composed rather than declared in separate config blocks, because
// `no-restricted-syntax` is replaced wholesale by the last block that matches a file — so
// a second block would silently delete the first one's restrictions for every file both
// cover. That is the same failure mode as ADR-0006 and it is just as quiet.

const NO_RAW_COLOR = {
  // `rgba?[(]` rather than an escaped paren: the character class needs no backslash and so
  // survives being edited by anything that mangles them.
  selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?[(])/]',
  message:
    'ARCHITECTURE.md §2.4: raw colours belong in core/design-system/tokens.ts. Text colours ' +
    'there clear WCAG AA; a hex written into a screen does not, and cannot be audited. ' +
    'Use a `color.*` token, or `tone` on ArenaText.',
};

const NO_RAW_SPACING = {
  selector:
    'Property[key.name=/^(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|' +
    'paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|' +
    'marginHorizontal|marginVertical|gap|rowGap|columnGap|borderRadius|minHeight|minWidth)$/]' +
    ' > Literal[value>1]',
  message:
    'ROADMAP.md Phase 1: spacing and radii come from the scale in core/design-system/tokens.ts. ' +
    'Use space[n], layout.* or radius.*. 0 and 1 are allowed, for hairlines.',
};

const NO_TO_FIXED = {
  selector: "CallExpression[callee.property.name='toFixed']",
  message:
    'ARCHITECTURE.md §2.2: toFixed is not a rounding specification. ' +
    '(9.995).toFixed(2) === "9.99", which is the exact boundary the formatting ' +
    'contract is tested at. Use divideHalfUp from core/common.',
};

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
      // Test files are classified separately from the element they live in, so the one
      // exception below can be stated as "a test may reach the fakes" rather than as a
      // hole in the production graph.
      'boundaries/files': [{ category: 'test', pattern: '**/*.test.{ts,tsx}' }],
      'boundaries/elements': [
        { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
        { type: 'core-model', pattern: 'src/core/model' },
        { type: 'core-common', pattern: 'src/core/common' },
        { type: 'core-design-system', pattern: 'src/core/design-system' },
        { type: 'core-data', pattern: 'src/core/data' },
        { type: 'core-db', pattern: 'src/core/db' },
        { type: 'core-network', pattern: 'src/core/network' },
        { type: 'core-prefs', pattern: 'src/core/prefs' },
        { type: 'core-ocr', pattern: 'src/core/ocr' },
        { type: 'core-testing', pattern: 'src/core/testing' },
        { type: 'app', pattern: 'src/app' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message: 'ARCHITECTURE.md §4: {{from.type}} may not import {{to.type}}.',
          policies: [
            // npm packages are out of scope for this rule; `boundaries/external` is the
            // rule that would govern them, and it is deliberately not enabled. Without
            // this line `default: 'disallow'` would reject every `import from 'react'`.
            { allow: { to: { module: { origin: 'external' } } } },

            // core/model has no policy at all, on purpose: `default` is disallow, so it
            // depends on nothing. This is what keeps the domain testable in plain Node.

            { from: { element: { type: 'core-common' } }, allow: to('core-model') },
            {
              from: { element: { type: 'core-design-system' } },
              allow: to('core-model', 'core-common'),
            },
            { from: { element: { type: 'core-db' } }, allow: to('core-model', 'core-common') },
            {
              from: { element: { type: 'core-network' } },
              allow: to('core-model', 'core-common'),
            },
            { from: { element: { type: 'core-prefs' } }, allow: to('core-model', 'core-common') },

            // core/ocr reads a screenshot into a draft and stops there. It may not reach
            // core/data: a scan is a suggestion the user still has to accept, and a module
            // that could write would make "scanned" and "saved" the same act (ADR-0024).
            { from: { element: { type: 'core-ocr' } }, allow: to('core-model', 'core-common') },

            // core/data is the only place that knows both the database and the network
            // exist.
            {
              from: { element: { type: 'core-data' } },
              allow: to('core-model', 'core-common', 'core-db', 'core-network', 'core-prefs'),
            },

            // Features may not reach the database or the network.
            {
              from: { element: { type: 'feature' } },
              allow: to('core-model', 'core-common', 'core-design-system', 'core-data', 'core-ocr'),
            },
            // ...and may not reach *each other*. Matching the captured folder name to the
            // importer's is what makes a feature a unit rather than a flat namespace.
            {
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: { type: 'feature', captured: { feature: '{{from.captured.feature}}' } },
                },
              },
            },

            // The route layer wires things together, so it is allowed core-db —
            // migrations run once in the root _layout (ARCHITECTURE.md §7).
            // It is still not allowed core-network: nothing above core/data fetches.
            {
              from: { element: { type: 'app' } },
              allow: to(
                'app',
                'feature',
                'core-model',
                'core-common',
                'core-design-system',
                'core-data',
                'core-db',
                'core-ocr',
                'core-prefs',
              ),
            },

            // Fakes and helpers need to see everything they fake.
            { from: { element: { type: 'core-testing' } }, allow: to('*') },

            // ...and a test file may reach them, whichever element it lives in. Production
            // code still may not: core/testing opens a real better-sqlite3 handle and would
            // not survive being bundled. This edge is why test files are categorised above,
            // rather than the whole of core/data being granted access to core/testing.
            { from: { file: { categories: 'test' } }, allow: to('core-testing') },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Tokens everywhere except the module that defines them
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/design-system/**/*'],
    rules: { 'no-restricted-syntax': ['error', NO_RAW_COLOR, NO_RAW_SPACING] },
  },

  // ---------------------------------------------------------------------------
  // Rounding contract (ARCHITECTURE.md §2.2), plus the two above — see the note by
  // their definitions for why they are repeated here rather than layered.
  // ---------------------------------------------------------------------------
  {
    files: ['src/core/common/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_RAW_COLOR, NO_RAW_SPACING, NO_TO_FIXED],
    },
  },
]);
