/**
 * Shared runner for the "prove the rule fires" checks.
 *
 * ROADMAP.md never asks that a lint rule be *configured*; it asks that a deliberate
 * violation fail CI. The difference is not pedantry — for two phases the boundary rule was
 * configured, warned about, and enforced nothing, and a clean `eslint .` looked exactly the
 * same as a compliant codebase (ADR-0006). Every architectural rule therefore gets probes.
 *
 * Each case writes a throwaway file, lints it, and asserts the outcome. Everything is
 * deleted again, including on failure.
 */

import { ESLint } from 'eslint';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// One ESLint instance for every case: one config load instead of a dozen, and no shell
// quoting to get wrong on either platform.
const eslint = new ESLint({ cwd: ROOT });

/**
 * @param {string} title
 * @param {string[]} ruleIds  which rules count as a rejection
 * @param {{ name: string, file: string, source: string, expect: 'reject' | 'allow' }[]} cases
 * @returns {Promise<number>} number of failures
 */
export async function runProbes(title, ruleIds, cases) {
  console.log(`\n${title}`);
  let failures = 0;
  const written = new Set();

  try {
    for (const testCase of cases) {
      const absolute = join(ROOT, testCase.file);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, testCase.source, 'utf8');
      written.add(absolute);

      const [report] = await eslint.lintFiles([testCase.file]);
      const violations = (report?.messages ?? []).filter((message) =>
        ruleIds.includes(message.ruleId),
      );
      const rejected = violations.length > 0;
      const passed = rejected === (testCase.expect === 'reject');

      console.log(`${passed ? 'ok  ' : 'FAIL'}  ${testCase.name}`);
      if (!passed) {
        failures += 1;
        console.log(
          testCase.expect === 'reject'
            ? '        expected a violation, got none'
            : `        unexpected violation: ${violations[0]?.message}`,
        );
      }

      rmSync(absolute, { force: true });
      written.delete(absolute);
    }
  } finally {
    for (const absolute of written) rmSync(absolute, { force: true });
  }

  return failures;
}

/** @param {number} failures @param {string} pointer */
export function report(failures, total, pointer) {
  if (failures > 0) {
    console.error(`\n${failures} of ${total} check(s) failed. See ${pointer}.`);
    process.exit(1);
  }
  console.log(`\nAll ${total} checks behaved as specified.`);
}
