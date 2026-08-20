#!/usr/bin/env node
/**
 * Proves the ARCHITECTURE.md §4 boundary rule actually rejects what it claims to.
 *
 * ROADMAP.md Phase 0 does not ask for "the rule is configured"; it asks that "a
 * deliberately-added illegal import from features/roster to core/db fails CI". That
 * distinction earned its own ADR: for two phases the rule was configured, warned about,
 * and enforced nothing, because eslint-plugin-boundaries classifies elements by *folder*
 * and the patterns were written as file globs — so every file came back `isUnknown` and
 * no policy ever applied. A green lint run was evidence of nothing (ADR-0006).
 *
 * So the check is executable and runs on every PR. Each case writes a throwaway file,
 * lints it, and asserts the outcome. Everything is deleted again, including on failure.
 */

import { ESLint } from 'eslint';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ name: string, file: string, source: string, expect: 'reject' | 'allow' }[]} */
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
      "import { statFormatter } from '@/core/common';\n" +
      "import { localSeedRosterSource } from '@/core/data';\n" +
      'export const probe = [statFormatter, localSeedRosterSource];\n',
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

const RULE = 'boundaries/dependencies';

// ESLint's Node API rather than a child process: one config load instead of eight, and
// no shell quoting to get wrong on either platform.
const eslint = new ESLint({ cwd: ROOT });

const lint = async (file) => {
  const [report] = await eslint.lintFiles([file]);
  return (report?.messages ?? []).filter((message) => message.ruleId === RULE);
};

let failures = 0;
const written = new Set();

try {
  for (const testCase of CASES) {
    const absolute = join(ROOT, testCase.file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, testCase.source, 'utf8');
    written.add(absolute);

    const violations = await lint(testCase.file);
    const rejected = violations.length > 0;
    const passed = rejected === (testCase.expect === 'reject');

    console.log(`${passed ? 'ok  ' : 'FAIL'}  ${testCase.name}`);
    if (!passed) {
      failures += 1;
      console.log(
        testCase.expect === 'reject'
          ? '        expected a boundary error, got none'
          : `        unexpected boundary error: ${violations[0]?.message}`,
      );
    }

    rmSync(absolute, { force: true });
    written.delete(absolute);
  }
} finally {
  for (const absolute of written) rmSync(absolute, { force: true });
}

if (failures > 0) {
  console.error(`\n${failures} boundary check(s) failed. See ARCHITECTURE.md §4 and ADR-0006.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} boundary checks behaved as specified.`);
