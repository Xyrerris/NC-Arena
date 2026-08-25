/**
 * Reads a player's stat sheet out of the text a screenshot recognises into (ADR-0024).
 *
 * This file is **pure**: strings and rectangles in, a partial `PlayerDraft` out. It knows
 * nothing about ML Kit, about image pickers or about React, which is what lets the hard
 * part — deciding which "CP" on a busy screen is the one the user meant — be proven in the
 * Node test project against the real recognised text rather than on a device.
 *
 * Two rules govern everything below, and both exist because a wrong number that looks
 * right is worse than a missing one:
 *
 * 1. **Nothing is repaired.** A token becomes a stat only when, after group separators and
 *    a trailing `%` are removed, every remaining character is a digit. There is no `O`->0
 *    or `l`->1 rescue: those turn an unreadable value into a plausible wrong one, and the
 *    user cannot tell the difference by looking at the form.
 * 2. **Nothing is saved.** The result of a scan is a *suggestion* that lands in the form's
 *    inputs. The user still reads it and still presses Save, and the same
 *    `validatePlayerDraft` that guards a hand-typed player guards a scanned one.
 */

import type { PlayerDraft } from '../model';

/** A rectangle in source-image pixels — ML Kit's `frame`, passed through unchanged. */
export interface ScanFrame {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One recognised line of text and where it sat on the screenshot. */
export interface ScannedLine {
  text: string;
  frame: ScanFrame;
}

/**
 * What a screenshot can supply. `score` is absent on purpose: the game's profile panel
 * does not show it, and a scanner that guessed would be inventing the one number the user
 * has no way to check against the picture in front of them.
 */
export type ScannedField = Exclude<keyof PlayerDraft, 'score'>;

export const SCANNED_FIELDS: readonly ScannedField[] = [
  'name',
  'level',
  'gameCode',
  'combatPower',
  'hp',
  'atk',
  'def',
  'critPercent',
  'hit',
  'spd',
] as const;

export interface StatSheetScan {
  /** Only the fields actually read. A field the sheet did not yield is absent, not zero. */
  readonly values: Readonly<Partial<Pick<PlayerDraft, ScannedField>>>;
  readonly found: readonly ScannedField[];
  /** Everything `SCANNED_FIELDS` promises and this sheet did not give up. */
  readonly missing: readonly ScannedField[];
}

/**
 * The stat rows of the game's profile panel, keyed by the label it paints. `CRI` is the
 * game's spelling and `CRIT` is the app's, so both are accepted — the label is data read
 * off a screen, and being strict about it would only fail on a future skin.
 *
 * `CRIT` is listed before `CRI` because the patterns are tried in order and `CRI` would
 * otherwise match the first three letters of the longer word.
 */
type NumericScannedField = Exclude<ScannedField, 'name' | 'gameCode'>;

const STAT_LABELS: readonly (readonly [pattern: string, field: NumericScannedField])[] = [
  ['HP', 'hp'],
  ['ATK', 'atk'],
  ['DEF', 'def'],
  ['CRIT', 'critPercent'],
  ['CRI', 'critPercent'],
  ['HIT', 'hit'],
  ['SPD', 'spd'],
] as const;

/** The label above the number the whole app is organised around. */
const COMBAT_POWER_LABEL = 'CP';

/**
 * `Lv.488`, `LV 488`, `Lv488`. The dot and the space are both optional because which of
 * them a recogniser emits depends on the font's letter spacing, not on the game.
 */
const LEVEL_PATTERN = /\bLv\.?\s*(\d{1,5})\b/i;

/** `#a984`. The `#` is required: without it every number on the screen is a candidate. */
const GAME_CODE_PATTERN = /#\s*([0-9a-z]{2,12})\b/i;

/**
 * Group separators, in every convention the game might be rendered under. Stripping all of
 * them from a digit run is unambiguous *because every stat is a whole number* — there is
 * no fractional stat for a "decimal point" to belong to, so `11.724.329.467` and
 * `11,724,329,467` can only mean the same integer.
 */
const GROUP_SEPARATORS = /[.,'\u00a0\u2009\s]/g;

/** Punctuation the recogniser leaves around a name once the level and code are removed. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();

const height = (frame: ScanFrame): number => Math.abs(frame.bottom - frame.top);

const centreY = (frame: ScanFrame): number => (frame.top + frame.bottom) / 2;

const centreX = (frame: ScanFrame): number => (frame.left + frame.right) / 2;

/**
 * Are these two fragments the same row of the panel?
 *
 * Vertical overlap rather than "centres within N pixels", because N would be a resolution
 * the app does not control: the same screenshot at 1080p and at 1440p has every gap scaled.
 * Overlap is measured against the shorter of the two boxes, so a tall label beside a short
 * number still pairs.
 */
const sameRow = (a: ScanFrame, b: ScanFrame): boolean => {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const shorter = Math.min(height(a), height(b));
  return shorter > 0 && overlap > shorter / 2;
};

/**
 * A digit run as a safe integer, or null.
 *
 * `Number.isSafeInteger` is the same 2^53 ceiling `validatePlayerDraft` enforces
 * (ARCHITECTURE.md §2.1). Refusing here as well means an unreadably long run never reaches
 * a form field that would then reject it with a message about something the user did not
 * type.
 */
export const toWholeNumber = (token: string): number | null => {
  const digits = normalise(token).replace(/%$/, '').replace(GROUP_SEPARATORS, '');
  if (digits === '' || !/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
};

interface Candidate {
  readonly value: number;
  /** Where the *label* sat, which is what the anchor below is measured against. */
  readonly frame: ScanFrame;
}

/**
 * Every place on the sheet where `label` is followed by a number — on the same line, or on
 * a fragment the recogniser split off to the right of it.
 *
 * The split case is not an edge case. ML Kit groups by baseline *and* by proximity, and the
 * game puts a wide gap between a stat's label and its value, so `HP` and `1440085258` come
 * back as two lines about as often as one.
 */
const candidatesFor = (lines: readonly ScannedLine[], label: string): Candidate[] => {
  const head = new RegExp(`^${label}\\b[:.]?\\s*(.*)$`, 'i');
  const out: Candidate[] = [];

  for (const line of lines) {
    const match = head.exec(normalise(line.text));
    if (match === null) continue;

    const rest = normalise(match[1] ?? '');
    const inline = toWholeNumber(rest);
    if (inline !== null) {
      out.push({ value: inline, frame: line.frame });
      continue;
    }
    // Anything else on the line means this is not a stat row: `HIT RATE UP` starts with
    // HIT and is not the HIT stat.
    if (rest !== '') continue;

    // A bare label. Its value is the nearest number to the right on the same row —
    // "nearest" rather than "any", so a three-column layout cannot pair across a gutter.
    const partner = lines
      .filter((other) => other !== line && other.frame.left >= line.frame.left)
      .filter((other) => sameRow(line.frame, other.frame))
      .filter((other) => toWholeNumber(other.text) !== null)
      .sort((a, b) => a.frame.left - b.frame.left)[0];

    if (partner !== undefined) {
      const value = toWholeNumber(partner.text);
      if (value !== null) out.push({ value, frame: line.frame });
    }
  }

  return out;
};

const boundsOf = (frames: readonly ScanFrame[]): ScanFrame | null => {
  const first = frames[0];
  if (first === undefined) return null;
  return frames.reduce(
    (box, frame) => ({
      left: Math.min(box.left, frame.left),
      top: Math.min(box.top, frame.top),
      right: Math.max(box.right, frame.right),
      bottom: Math.max(box.bottom, frame.bottom),
    }),
    first,
  );
};

const distanceTo = (anchor: ScanFrame, frame: ScanFrame): number =>
  Math.hypot(centreX(anchor) - centreX(frame), centreY(anchor) - centreY(frame));

/**
 * The candidate the user meant.
 *
 * The screenshot this was written against has **two** combat powers on it: the profile
 * dialog's, and the viewer's own on the roster behind it, half-covered. Reading order picks
 * the wrong one depending on how the recogniser walks the image, so the stat panel is used
 * as an anchor and the nearest candidate to it wins. With no anchor — a crop containing
 * only the header — reading order is all there is, and it is honest to say so rather than
 * to refuse.
 */
const nearest = (candidates: readonly Candidate[], anchor: ScanFrame | null): Candidate | null => {
  if (anchor === null) return candidates[0] ?? null;
  return (
    [...candidates].sort((a, b) => distanceTo(anchor, a.frame) - distanceTo(anchor, b.frame))[0] ??
    null
  );
};

/** The lines that share a row with `frame`, left to right, joined as one string. */
const rowText = (lines: readonly ScannedLine[], frame: ScanFrame): string =>
  normalise(
    lines
      .filter((line) => sameRow(frame, line.frame))
      .sort((a, b) => a.frame.left - b.frame.left)
      .map((line) => line.text)
      .join(' '),
  );

/**
 * The name, from the header row the level was found on.
 *
 * Taken as "whatever is left" rather than matched by a pattern, because a player name is
 * the one field on this screen with no shape at all — it may hold digits, punctuation or a
 * script the app has never seen. Removing the two things that *do* have a shape and keeping
 * the rest is the only rule that does not quietly exclude somebody's name.
 */
const nameFrom = (row: string): string =>
  normalise(row.replace(LEVEL_PATTERN, ' ').replace(GAME_CODE_PATTERN, ' ')).replace(
    EDGE_PUNCTUATION,
    '',
  );

export const parseStatSheet = (lines: readonly ScannedLine[]): StatSheetScan => {
  // Numbers and text are accumulated apart, and merged at the end. One `Partial<Pick<…>>`
  // would be a heterogeneous record, and assigning through a union key into one of those
  // narrows the target to `never` — the type system being right that `values[field] = 4`
  // is unsound when `field` might be `name`.
  const numbers: Partial<Record<NumericScannedField, number>> = {};
  const text: Partial<Pick<PlayerDraft, 'name' | 'gameCode'>> = {};

  // Pass one: the stat panel. Its labels appear nowhere else on the screen, so the first
  // reading of each is the right one — and together they locate the dialog for pass two.
  const statFrames: ScanFrame[] = [];
  for (const [label, field] of STAT_LABELS) {
    if (numbers[field] !== undefined) continue;
    const hit = candidatesFor(lines, label)[0];
    if (hit === undefined) continue;
    numbers[field] = hit.value;
    statFrames.push(hit.frame);
  }
  const anchor = boundsOf(statFrames);

  // Pass two: the header, disambiguated against that anchor.
  const power = nearest(candidatesFor(lines, COMBAT_POWER_LABEL), anchor);
  if (power !== null) numbers.combatPower = power.value;

  const levelLine = nearest(
    lines
      .filter((line) => LEVEL_PATTERN.test(normalise(line.text)))
      .map((line) => ({ value: 0, frame: line.frame })),
    anchor,
  );

  if (levelLine !== null) {
    const row = rowText(lines, levelLine.frame);

    const level = toWholeNumber(LEVEL_PATTERN.exec(row)?.[1] ?? '');
    if (level !== null) numbers.level = level;

    // The code is read from the header row only. Elsewhere on this screen `#` prefixes a
    // build number (`#10850983`), and a scan that adopted one as a player's code would be
    // wrong in a field nobody thinks to check.
    const code = GAME_CODE_PATTERN.exec(row)?.[1];
    if (code !== undefined) text.gameCode = code.toLowerCase();

    const name = nameFrom(row);
    if (name !== '') text.name = name;
  }

  const values: Readonly<Partial<Pick<PlayerDraft, ScannedField>>> = { ...numbers, ...text };
  const found = SCANNED_FIELDS.filter((field) => values[field] !== undefined);
  const missing = SCANNED_FIELDS.filter((field) => values[field] === undefined);
  return { values, found, missing };
};
