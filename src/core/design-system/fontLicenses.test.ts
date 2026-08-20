/**
 * OFL compliance, checked against the fonts themselves.
 *
 * The SIL Open Font License requires the copyright notice and licence to travel with the
 * font. That is not automatic and it is not visible: the three licence files were first
 * committed as three byte-identical copies of Barlow's, which attributed Cinzel and
 * JetBrains Mono to the wrong authors. Nothing failed, nothing looked wrong, and the repo
 * was out of compliance.
 *
 * So the expected copyright is read from each font's own `name` table rather than written
 * down here. The font vendor is the authority on their own notice; this test only checks
 * that the file beside the font says what the font says.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REQUIRED_FONT_ASSETS } from './typography';

const FONT_DIR = join(__dirname, '..', '..', '..', 'assets', 'fonts');
const LICENSE_DIR = join(FONT_DIR, 'licenses');

/**
 * TrueType `name` table record ids. 16 is the "typographic family" and 1 is the legacy
 * family — they differ exactly where it matters here: `Barlow-Medium.ttf` reports family
 * "Barlow Medium" under 1 and "Barlow" under 16, and only the latter names a licence file.
 */
const NAME_ID = { copyright: 0, legacyFamily: 1, typographicFamily: 16 } as const;

/**
 * Minimal TrueType parser: offset table -> `name` table -> records. Enough to read two
 * strings, and deliberately not a font library — the alternative is trusting a filename.
 */
const readNames = (file: string): Map<number, string> => {
  const data = readFileSync(join(FONT_DIR, file));
  const tableCount = data.readUInt16BE(4);

  let nameOffset: number | undefined;
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    if (data.toString('latin1', record, record + 4) === 'name') {
      nameOffset = data.readUInt32BE(record + 8);
      break;
    }
  }
  if (nameOffset === undefined) throw new Error(`${file} has no name table`);

  const count = data.readUInt16BE(nameOffset + 2);
  const stringOffset = data.readUInt16BE(nameOffset + 4);
  const names = new Map<number, string>();

  for (let i = 0; i < count; i += 1) {
    const record = nameOffset + 6 + i * 12;
    const platform = data.readUInt16BE(record);
    const nameId = data.readUInt16BE(record + 6);
    const length = data.readUInt16BE(record + 8);
    const offset = data.readUInt16BE(record + 10);
    const start = nameOffset + stringOffset + offset;
    const raw = data.subarray(start, start + length);
    // Platform 3 is Windows and stores UTF-16BE. `swap16` is destructive, so it runs on a
    // copy — mutating the subarray would corrupt every record read after this one.
    const text =
      platform === 3 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
    // Prefer the Windows record where a font carries several encodings of the same id.
    if (!names.has(nameId) || platform === 3) names.set(nameId, text.trim());
  }
  return names;
};

const familyOf = (names: Map<number, string>): string =>
  names.get(NAME_ID.typographicFamily) ?? names.get(NAME_ID.legacyFamily) ?? '';

const firstLineOf = (licenseFile: string): string =>
  readFileSync(join(LICENSE_DIR, licenseFile), 'utf8').split(/\r?\n/)[0]?.trim() ?? '';

const bundledFiles = REQUIRED_FONT_ASSETS.map((name) => `${name}.ttf`);

describe('the bundled fonts', () => {
  it('are exactly the eight the type scale names', () => {
    const present = readdirSync(FONT_DIR)
      .filter((entry) => entry.endsWith('.ttf'))
      .sort();
    // Every file here ships inside the APK. The other thirty-two weights Google Fonts
    // hands over are three megabytes of faces nothing renders.
    expect(present).toEqual([...bundledFiles].sort());
  });

  it('are real TrueType files, not a rename or a failed download', () => {
    for (const file of bundledFiles) {
      const magic = readFileSync(join(FONT_DIR, file)).readUInt32BE(0);
      expect(magic).toBe(0x00010000);
    }
  });
});

describe('OFL compliance', () => {
  it('ships a licence whose copyright matches the one inside each font', () => {
    const seen = new Set<string>();
    for (const file of bundledFiles) {
      const names = readNames(file);
      const family = familyOf(names);
      const copyright = names.get(NAME_ID.copyright);
      expect(family).toBeTruthy();
      expect(copyright).toBeTruthy();

      const licenseFile = `OFL-${family.replace(/\s+/g, '')}.txt`;
      seen.add(licenseFile);
      expect(firstLineOf(licenseFile)).toBe(copyright);
    }
    // And no orphan licences for fonts that are no longer bundled.
    expect(readdirSync(LICENSE_DIR).sort()).toEqual([...seen].sort());
  });

  it('carries the OFL 1.1 body in every licence', () => {
    for (const file of readdirSync(LICENSE_DIR)) {
      const text = readFileSync(join(LICENSE_DIR, file), 'utf8');
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(text).toContain('PERMISSION & CONDITIONS');
    }
  });
});
