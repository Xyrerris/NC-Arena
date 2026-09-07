/**
 * `SCHEMA_VERSION` is the number an export writes into its file and an import checks before
 * it touches the database (ADR-0033), so a stale one is not a cosmetic mistake: it would
 * label a backup with a schema it was not written at, and that label is the only thing a
 * future build has to go on.
 *
 * The constant is hand-written because it has to exist on device, where the meta folder is
 * not bundled. This is the probe that keeps it honest — the ADR-0006 and ADR-0016
 * discipline applied to a constant rather than to a config rule.
 */

import fs from 'node:fs';
import path from 'node:path';

import { SCHEMA_VERSION } from './constants';

interface Journal {
  entries: { idx: number; tag: string }[];
}

const journal = (): Journal =>
  JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'migrations', 'meta', '_journal.json'), 'utf8'),
  ) as Journal;

describe('SCHEMA_VERSION', () => {
  it('counts every committed migration', () => {
    expect(SCHEMA_VERSION).toBe(journal().entries.length);
  });

  it('is the index of the last one, plus one — so adding a migration moves it', () => {
    const entries = journal().entries;
    const last = entries[entries.length - 1];
    expect(last).toBeDefined();
    expect(SCHEMA_VERSION).toBe((last?.idx ?? -1) + 1);
  });
});
