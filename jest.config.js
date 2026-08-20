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
      testMatch: [
        '<rootDir>/src/app/**/*.test.tsx',
        '<rootDir>/src/features/**/*.test.tsx',
        '<rootDir>/src/core/design-system/**/*.test.tsx',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
