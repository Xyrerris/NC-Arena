/**
 * Two projects, because ARCHITECTURE.md §10 splits the test pyramid by runtime, not by
 * folder convention:
 *
 *   node   — domain, formatting, queries, mappers. Plain Node, no RN preset, no jsdom.
 *            This is where the safe-integer and half-up-rounding rules are proven, and
 *            it must stay fast enough to run on every save.
 *   native — components, hooks and screens through jest-expo + React Native Testing
 *            Library.
 *
 * Note what is deliberately absent: snapshot testing as a visual gate. A clipped or
 * ellipsised number serialises identically to a correct one, so snapshots would give
 * false confidence exactly where the product's promise lives. The visual gate is Maestro
 * on a device (ARCHITECTURE.md §10).
 */
module.exports = {
  /**
   * Coverage is configured **here, at the root, not inside the `node` project** — and that
   * is not a style choice. Jest silently ignores `coverageThreshold` in a project config: a
   * deliberately impossible 99 % set there passed the run. That is the ADR-0006 failure
   * exactly — a gate that reports nothing looks identical to one that works — so
   * `scripts/check-test-projects.mjs` probes it rather than trusting it.
   *
   * `npm run test:coverage` runs the **node project alone**, which is what makes a root-level
   * threshold mean "what the fast suite proves by itself". Letting the native project's
   * screen tests count towards it would paper over a missing rule test with a component that
   * happens to render the same code path.
   *
   * The exclusions are not a lower bar; they are files this project structurally cannot load,
   * or that carry nothing to measure:
   *
   *  - the native-backed adapters (`client.ts`, `arenaRepository.ts`, `expoBackupFile.ts`,
   *    `expoLiveData.ts`, `mmkvPreferences.ts`, the three under `core/ocr`) import modules
   *    plain Node cannot resolve. That is *why* each is deliberately thin, and each says so
   *    in its own header;
   *  - `useViewerId.ts` is a React hook and `core/design-system` is components, so both
   *    belong to the native project;
   *  - `core/testing` is the fakes, and coverage of a fake measures nothing;
   *  - barrels and `.d.ts` carry no statements.
   */
  collectCoverageFrom: [
    'src/core/**/*.ts',
    '!src/core/**/index.ts',
    '!src/core/**/*.d.ts',
    '!src/core/testing/**',
    '!src/core/design-system/**',
    '!src/core/db/client.ts',
    '!src/core/data/arenaRepository.ts',
    '!src/core/data/expoBackupFile.ts',
    '!src/core/data/expoLiveData.ts',
    '!src/core/data/useViewerId.ts',
    '!src/core/prefs/mmkvPreferences.ts',
    '!src/core/ocr/expoImageSource.ts',
    '!src/core/ocr/mlKitTextRecogniser.ts',
    '!src/core/ocr/deviceStatScanner.ts',
  ],

  /**
   * The level the suite holds today, each figure rounded down to the integer at or below what
   * was measured (93.09 statements / 89.16 branches / 88.00 functions / 94.41 lines).
   *
   * A ratchet, not an aspiration. There was no gate at all until now, so a later phase could
   * quietly lower coverage in the layer that carries the rules and nothing would object.
   * Raise these when the suite earns it; do not lower them to make a red run green.
   */
  coverageThreshold: {
    global: { statements: 93, branches: 89, functions: 88, lines: 94 },
  },

  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      // The split is by *extension*, not by folder: `.test.ts` runs here, `.test.tsx` runs
      // under jest-expo below. That is what lets core/design-system have both — the token
      // contrast assertions are pure arithmetic and belong in the fast project, while the
      // components need a renderer. A `.test.ts` in this project may not import
      // react-native, which is the convention the extension encodes.
      testMatch: ['<rootDir>/src/core/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
    {
      displayName: 'native',
      preset: 'jest-expo',
      // The whole of `core/`, not `core/design-system` alone. A `.test.tsx` written under
      // `core/data` or `core/ocr` matched nothing before, so it never ran and nothing
      // reported that it had not — a test that silently does not exist is worse than a
      // missing one. The extension already encodes the split the two projects care about,
      // so the folder list has no second job to do.
      testMatch: [
        '<rootDir>/src/app/**/*.test.tsx',
        '<rootDir>/src/features/**/*.test.tsx',
        '<rootDir>/src/core/**/*.test.tsx',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
