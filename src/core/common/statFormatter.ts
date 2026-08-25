/**
 * The formatting contract (ARCHITECTURE.md §6).
 *
 * "Every huge stat shown twice" is the product's core idea, so this is a tested module
 * rather than template interpolation inside a component. The behaviour below is ported
 * from the prototype's `full()` / `short()` — including its bucketing thresholds, which
 * are part of the spec — with one deliberate change: rounding goes through `divideHalfUp`,
 * never `toFixed` (§2.2, and the ESLint rule that guards this directory).
 *
 * Every value that arrives here is a scaled integer, and the only division happens inside
 * `rescaleHalfUp`. No intermediate float is produced, so there is no representation error
 * for a rounder to inherit.
 */

import { assertSafeInteger, divideHalfUp, pow10, rescaleHalfUp } from './rounding';

/** `"B"` | `"M"` | `"e9"`. A user preference, stored in MMKV by core/prefs. */
export type ShortUnit = 'BILLIONS' | 'MILLIONS' | 'SCIENTIFIC';

/** Narrowing guard for a value read back out of persisted preferences. */
export const isShortUnit = (value: unknown): value is ShortUnit =>
  value === 'BILLIONS' || value === 'MILLIONS' || value === 'SCIENTIFIC';

export interface StatFormatter {
  /** `2418904113` -> `"2.418.904.113"` */
  exact(value: number): string;
  short(value: number, unit: ShortUnit): string;
  /** `3084221` -> `"3,08 M"` */
  combatPowerShort(cp: number): string;
  /** `712043` -> `"71,2043 %"` */
  critExact(bp: number): string;
  /** `712043` -> `"71,2%"` */
  critShort(bp: number): string;
  /** `(1184530912, 2418904113)` -> `"+104,2%"` */
  deltaPercent(mine: number, theirs: number): string;
}

/** How many implied decimal places a raw stat carries. None: it is a whole count. */
const UNIT_POW = 0;
/** `critBp` is percent x 10_000, so it carries four. */
const CRIT_BP_POW = 4;
const MILLION_POW = 6;
const BILLION_POW = 9;

const TEN_BILLION = 10 * pow10(BILLION_POW);
const ONE_HUNDRED_BILLION = 100 * pow10(BILLION_POW);

/**
 * Rendered where a percentage delta is mathematically undefined — a baseline of zero.
 * Phase 4 owns whether the Vs You row should say something more explicit; until then the
 * formatter refuses to invent a number rather than emitting `Infinity`.
 */
const UNDEFINED_DELTA = '—';

export interface Separators {
  readonly group: string;
  readonly decimal: string;
}

/**
 * The app's punctuation, matching the game's own screens: `11.724.329.467` (ADR-0025).
 *
 * Both characters are stated rather than discovered, and they are stated *together*. The
 * pair has to be coherent: `short(2_418_904_113, 'MILLIONS')` groups its thousands and
 * `short(2_418_904_113, 'BILLIONS')` prints two decimals, so a build that used one glyph
 * for both would put `2.419 M` and `2.42 B` on the same screen meaning different things.
 * One decision made here, rather than two answers read out of whatever ICU data a
 * particular Hermes build happens to carry.
 */
export const DOT_SEPARATORS: Separators = { group: '.', decimal: ',' };

const handRolledGroup = (whole: number, separator: string): string => {
  const digits = String(whole);
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += separator;
    out += digits.charAt(index);
  }
  return out;
};

/**
 * Hermes ships an `Intl` implementation, but its coverage depends on the ICU data compiled
 * into the build — so grouping is probed at construction rather than assumed (§6).
 *
 * `Intl` is used only when it both groups *and* groups with the separator this app has
 * decided on. That second condition is new with ADR-0025 and is the one that matters now:
 * a build whose ICU data is missing the requested locale does not throw, it silently
 * formats under a default one — which used to be indistinguishable from success, and would
 * now put commas on a screen the rest of the app spells with dots.
 *
 * When `Intl` is used it is because it knows the locales whose grouping is not in threes.
 * When it is not, the hand-rolled grouper takes over and the product still renders a
 * grouped number instead of a wall of digits.
 */
const createGrouper = (locale: string, separators: Separators): ((whole: number) => string) => {
  try {
    const intl = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 });
    const probe = intl.format(1234567);
    // The Phase 0 device check expressed in code, now with the separator checked too: no
    // grouping at all comes back as the bare digits, and the wrong grouping comes back
    // grouped by a character this app did not choose.
    if (probe !== '1234567' && probe === handRolledGroup(1234567, separators.group)) {
      return (whole) => intl.format(whole);
    }
  } catch {
    // Fall through to the hand-rolled grouper.
  }
  return (whole) => handRolledGroup(whole, separators.group);
};

export const createStatFormatter = (
  locale = 'it-IT',
  separators: Separators = DOT_SEPARATORS,
): StatFormatter => {
  const group = createGrouper(locale, separators);

  /** Renders a scaled integer as a fixed-point decimal string. Exact by construction. */
  const render = (units: number, decimals: number): string => {
    const negative = units < 0;
    const abs = negative ? -units : units;
    const scale = pow10(decimals);
    const fraction = abs % scale;
    const whole = (abs - fraction) / scale;
    const body =
      decimals === 0
        ? group(whole)
        : `${group(whole)}${separators.decimal}${String(fraction).padStart(decimals, '0')}`;
    return negative ? `-${body}` : body;
  };

  /**
   * `value` carries `valuePow` implied decimal places; render it with `decimals` of them,
   * rounding half-up. `valuePow - decimals` places are dropped, and that subtraction is
   * the only place a scale change happens in this module.
   */
  const fixed = (value: number, valuePow: number, decimals: number): string =>
    render(rescaleHalfUp(value, valuePow - decimals), decimals);

  const exact: StatFormatter['exact'] = (value) => {
    assertSafeInteger(value, 'stat value');
    return fixed(value, UNIT_POW, 0);
  };

  const short: StatFormatter['short'] = (value, unit) => {
    assertSafeInteger(value, 'stat value');
    switch (unit) {
      case 'SCIENTIFIC':
        return `${fixed(value, BILLION_POW, 3)}e9`;
      case 'MILLIONS':
        return `${fixed(value, MILLION_POW, 0)} M`;
      case 'BILLIONS': {
        // Thresholds are applied to the *unrounded* value, exactly as the prototype does.
        // That is what makes 9_995_000_000 a two-decimal case, and therefore "10,00 B" —
        // the boundary at which toFixed answers "9.99".
        const magnitude = value < 0 ? -value : value;
        const decimals = magnitude >= ONE_HUNDRED_BILLION ? 0 : magnitude >= TEN_BILLION ? 1 : 2;
        return `${fixed(value, BILLION_POW, decimals)} B`;
      }
    }
  };

  const combatPowerShort: StatFormatter['combatPowerShort'] = (cp) => {
    assertSafeInteger(cp, 'combat power');
    return `${fixed(cp, MILLION_POW, 2)} M`;
  };

  const critExact: StatFormatter['critExact'] = (bp) => {
    assertSafeInteger(bp, 'critBp');
    return `${fixed(bp, CRIT_BP_POW, 4)} %`;
  };

  const critShort: StatFormatter['critShort'] = (bp) => {
    assertSafeInteger(bp, 'critBp');
    return `${fixed(bp, CRIT_BP_POW, 1)}%`;
  };

  const deltaPercent: StatFormatter['deltaPercent'] = (mine, theirs) => {
    assertSafeInteger(mine, 'your stat value');
    assertSafeInteger(theirs, 'their stat value');
    if (mine <= 0) return UNDEFINED_DELTA;

    // Tenths of a percent: (theirs - mine) / mine * 100, scaled by 10 and kept integral.
    // The multiply is asserted rather than assumed — it is the one place in this module
    // where a legitimate stat pair could leave the safe-integer range (§2.1).
    const numerator = (theirs - mine) * 1000;
    assertSafeInteger(numerator, 'delta numerator');
    const tenths = divideHalfUp(numerator, mine);

    // The sign follows the *rounded* value, so a delta that rounds to zero renders "+0.0"
    // rather than the prototype's "-0.0". Deliberate divergence — see docs/DECISIONS.md.
    return `${tenths >= 0 ? '+' : ''}${render(tenths, 1)}%`;
  };

  return { exact, short, combatPowerShort, critExact, critShort, deltaPercent };
};

/**
 * The default formatter. Locale and separators are both pinned, so the output is the same
 * on CI, on a device with full ICU data and on one without (§6, ADR-0025).
 */
export const statFormatter = createStatFormatter();
