#!/usr/bin/env node
/**
 * Proves the Jest configuration actually runs the tests it claims to, and actually enforces
 * the coverage it claims to.
 *
 * Both halves have already been wrong once. The native project's `testMatch` listed
 * `core/design-system` alone, so a `.test.tsx` written anywhere else under `core/` matched
 * nothing, never ran, and nothing reported that it had not. And `coverageThreshold` placed
 * inside a project config is **silently ignored** by Jest — a deliberately impossible 99 %
 * set there passed the run.
 *
 * Both are the ADR-0006 failure: a gate that reports nothing looks exactly like a gate
 * nothing violates. A test that does not exist is worse than a missing one, because the
 * suite reports success either way.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { report } from './lint-probe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JEST = join(ROOT, 'node_modules', '.bin', 'jest');
const config = createRequire(import.meta.url)(join(ROOT, 'jest.config.js'));

const FAILING_TEST =
  "it('fails on purpose, to prove this file is picked up', () => {\n" +
  '  expect(1).toBe(2);\n' +
  '});\n';

/** Runs Jest over one throwaway test file and reports whether the run failed. */
const runsAndFails = (relativePath, source, project) => {
  const absolute = join(ROOT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, source, 'utf8');
  try {
    const run = spawnSync(
      JEST,
      ['--selectProjects', project, '--ci', '--silent', relativePath.replace(/\\/g, '/')],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    // A non-zero exit is not enough on its own: "no tests found" also exits non-zero, and
    // that is precisely the outcome a too-narrow `testMatch` produces. The run has to have
    // found the file *and* failed on its assertion.
    return {
      ran: /1 total/.test(output) && !/No tests found/.test(output),
      failed: run.status !== 0,
      output,
    };
  } finally {
    rmSync(absolute, { force: true });
  }
};

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!passed && detail) console.log(`        ${detail}`);
};

console.log('\nTest projects and the coverage gate (ROADMAP.md 4.10.4)');

// 1 & 2 — the widened testMatch. `core/data` because it is the directory the old pattern
// missed, and the one 4.10.3 put new code in.
for (const [project, file] of [
  ['native', 'src/core/data/__project_probe.test.tsx'],
  ['node', 'src/core/data/__project_probe.test.ts'],
]) {
  const probe = runsAndFails(file, FAILING_TEST, project);
  check(
    `a deliberately failing ${file.endsWith('tsx') ? '.test.tsx' : '.test.ts'} in core/data fails the ${project} run`,
    probe.ran && probe.failed,
    probe.ran ? 'the file ran but the run passed' : 'the file matched no project and never ran',
  );
}

// 3 — where the threshold has to live. This is the structural half: the mechanism can work
// perfectly and still gate nothing if the option sits where Jest does not read it.
check(
  'the coverage threshold is declared at the root, where Jest reads it',
  config.coverageThreshold !== undefined && config.collectCoverageFrom !== undefined,
  'jest.config.js has no root-level coverageThreshold/collectCoverageFrom',
);
check(
  'no project declares one of its own, because Jest would ignore it',
  (config.projects ?? []).every(
    (project) =>
      project.coverageThreshold === undefined && project.collectCoverageFrom === undefined,
  ),
  'a project config carries coverage options; Jest ignores them there, silently',
);

// 4 — the mechanism itself: an unmet threshold has to fail the run.
const impossible = spawnSync(
  JEST,
  [
    '--selectProjects',
    'node',
    '--ci',
    '--silent',
    '--coverage',
    '--coverageThreshold',
    JSON.stringify({ global: { statements: 100, branches: 100, functions: 100, lines: 100 } }),
  ],
  { cwd: ROOT, encoding: 'utf8' },
);
check(
  'an unmet coverage threshold fails the run',
  impossible.status !== 0 &&
    /coverage threshold/i.test(`${impossible.stdout ?? ''}${impossible.stderr ?? ''}`),
  'a 100 % threshold did not fail the run',
);

report(
  results.filter((result) => !result.passed).length,
  results.length,
  'jest.config.js and ROADMAP.md 4.10.4',
);
