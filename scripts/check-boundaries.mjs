#!/usr/bin/env node
/**
 * Proves the ARCHITECTURE.md §4 module boundaries actually reject what they claim to.
 *
 * The rule was inert for two phases: `boundaries/elements` classifies by *folder* and the
 * patterns were written as file globs, so every file came back `isUnknown` and no policy
 * ever applied (ADR-0006). These probes are what would have caught that on the first PR.
 */

import { report, runProbes } from './lint-probe.mjs';

const CASES = [
  {
    name: 'features/roster may not reach the database',
    file: 'src/features/roster/__boundary_probe.ts',
    source: "import { DATABASE_NAME } from '@/core/db';\nexport const probe = DATABASE_NAME;\n",
    expect: 'reject',
  },
  {
    name: 'features/roster may not reach the network',
    file: 'src/features/roster/__boundary_probe.ts',
    source: "import * as net from '@/core/network';\nexport const probe = net;\n",
    expect: 'reject',
  },
  {
    name: 'one feature may not reach another',
    file: 'src/features/roster/__boundary_probe.ts',
    source: "import * as player from '@/features/player';\nexport const probe = player;\n",
    expect: 'reject',
  },
  {
    name: 'core/model depends on nothing',
    file: 'src/core/model/__boundary_probe.ts',
    source: "import { ok } from '../common';\nexport const probe = ok;\n",
    expect: 'reject',
  },
  {
    name: 'the route layer may not fetch',
    file: 'src/app/__boundary_probe.ts',
    source: "import * as net from '@/core/network';\nexport const probe = net;\n",
    expect: 'reject',
  },
  {
    name: 'production code may not reach the test fakes',
    file: 'src/features/roster/__boundary_probe.ts',
    source:
      "import { createTestDatabase } from '@/core/testing';\nexport const probe = createTestDatabase;\n",
    expect: 'reject',
  },
  {
    name: 'features/roster may reach the design system and the repository',
    file: 'src/features/roster/__boundary_probe.ts',
    source:
      "import { ArenaText } from '@/core/design-system';\n" +
      "import { createRosterRepository } from '@/core/data';\n" +
      'export const probe = [ArenaText, createRosterRepository];\n',
    expect: 'allow',
  },
  {
    name: 'core/ocr may not reach the repository',
    file: 'src/core/ocr/__boundary_probe.ts',
    source: "import * as data from '@/core/data';\nexport const probe = data;\n",
    expect: 'reject',
  },
  {
    name: 'features/playerForm may reach the screenshot scanner',
    file: 'src/features/playerForm/__boundary_probe.ts',
    source: "import { parseStatSheet } from '@/core/ocr';\nexport const probe = parseStatSheet;\n",
    expect: 'allow',
  },
  {
    name: 'a test file may reach the test fakes',
    file: 'src/features/roster/__boundary_probe.test.ts',
    source:
      "import { createTestDatabase } from '@/core/testing';\n" +
      "it('probe', () => expect(createTestDatabase).toBeDefined());\n",
    expect: 'allow',
  },
];

const failures = await runProbes(
  'Module boundaries (ARCHITECTURE.md §4)',
  ['boundaries/dependencies'],
  CASES,
);
report(failures, CASES.length, 'ARCHITECTURE.md §4 and ADR-0006');
