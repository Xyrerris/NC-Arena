/**
 * The formatting contract's exit criteria (ROADMAP.md Phase 2, ARCHITECTURE.md §6, §10).
 *
 * The default formatter pins both its locale and its separators (ADR-0025), so every
 * expectation below is also a check that neither the host machine's locale nor the ICU data
 * a given build happens to carry leaks into the output. Thousands are separated by a dot
 * and decimals by a comma, which is how the game's own screens spell a number.
 *
 * `toFixed` is not called anywhere in this file — it is banned in this directory by
 * ESLint. Where a `toFixed` result is quoted, it is quoted in a comment as the
 * counterexample the assertion exists to catch.
 */

import { createStatFormatter, statFormatter } from './statFormatter';

describe('exact', () => {
  it('renders the prototype largest stat in full and grouped', () => {
    expect(statFormatter.exact(2_418_904_113)).toBe('2.418.904.113');
  });

  it('survives Int32.MAX + 1 — the Kotlin plan truncation bug, kept as a regression', () => {
    expect(statFormatter.exact(2_147_483_648)).toBe('2.147.483.648');
  });

  it('renders MAX_SAFE_INTEGER, the top of the contract range (§2.1)', () => {
    expect(statFormatter.exact(Number.MAX_SAFE_INTEGER)).toBe('9.007.199.254.740.991');
  });

  it('rejects a value above 2^53 rather than rendering a plausible wrong number', () => {
    expect(() => statFormatter.exact(2 ** 53)).toThrow(RangeError);
    expect(() => statFormatter.exact(2 ** 53)).toThrow(/§2\.1/);
    // 9007199254740993 is not representable; the literal *is* 9007199254740992.
    expect(() => statFormatter.exact(9_007_199_254_740_993)).toThrow(RangeError);
  });

  it('rejects a float in an integer field', () => {
    expect(() => statFormatter.exact(1.5)).toThrow(RangeError);
  });
});

describe('short — BILLIONS bucketing and half-up rounding', () => {
  it('rounds 9,995 B up, where toFixed(2) answers "9.99"', () => {
    expect(statFormatter.short(9_995_000_000, 'BILLIONS')).toBe('10,00 B');
  });

  it('rounds 99,95 B to one decimal', () => {
    expect(statFormatter.short(99_950_000_000, 'BILLIONS')).toBe('100,0 B');
  });

  it('drops the decimals at and above 100 B', () => {
    expect(statFormatter.short(100_000_000_000, 'BILLIONS')).toBe('100 B');
    expect(statFormatter.short(2_418_904_113_000, 'BILLIONS')).toBe('2.419 B');
  });

  it('picks the bucket from the unrounded value, as the prototype does', () => {
    // 9_999_999_999 is below 10 B, so it takes the two-decimal branch and rounds to
    // "10,00 B" rather than crossing into the one-decimal branch first.
    expect(statFormatter.short(9_999_999_999, 'BILLIONS')).toBe('10,00 B');
    expect(statFormatter.short(2_418_904_113, 'BILLIONS')).toBe('2,42 B');
    expect(statFormatter.short(10_000_000_000, 'BILLIONS')).toBe('10,0 B');
  });
});

describe('short — the other two unit modes', () => {
  it('renders MILLIONS as a rounded, grouped whole number', () => {
    expect(statFormatter.short(2_418_904_113, 'MILLIONS')).toBe('2.419 M');
    expect(statFormatter.short(2_500_000, 'MILLIONS')).toBe('3 M');
  });

  it('renders SCIENTIFIC at three decimals', () => {
    expect(statFormatter.short(2_418_904_113, 'SCIENTIFIC')).toBe('2,419e9');
    expect(statFormatter.short(1_500_000, 'SCIENTIFIC')).toBe('0,002e9');
  });
});

describe('combatPowerShort', () => {
  it('always renders two decimals of millions', () => {
    expect(statFormatter.combatPowerShort(3_084_221)).toBe('3,08 M');
    expect(statFormatter.combatPowerShort(2_145_880)).toBe('2,15 M');
    expect(statFormatter.combatPowerShort(1_744_118)).toBe('1,74 M');
  });
});

describe('crit — scaled integer basis points (§2.2)', () => {
  it('renders four decimals straight out of the integer, with no division', () => {
    expect(statFormatter.critExact(712_043)).toBe('71,2043 %');
    expect(statFormatter.critExact(584_127)).toBe('58,4127 %');
    expect(statFormatter.critExact(514_402)).toBe('51,4402 %');
  });

  it('keeps trailing zeros that a float would drop', () => {
    expect(statFormatter.critExact(584_100)).toBe('58,4100 %');
    expect(statFormatter.critExact(500_000)).toBe('50,0000 %');
  });

  it('rounds the short form half-up', () => {
    expect(statFormatter.critShort(712_043)).toBe('71,2%');
    expect(statFormatter.critShort(584_127)).toBe('58,4%');
    // 71,05 % is the crit-scale twin of the 9,995 B case: (71.05).toFixed(1) is "71.0",
    // because the double nearest 71.05 sits just below it.
    expect(statFormatter.critShort(710_500)).toBe('71,1%');
    expect(statFormatter.critShort(703_500)).toBe('70,4%');
  });
});

describe('deltaPercent', () => {
  it('signs the delta from your values', () => {
    expect(statFormatter.deltaPercent(1_184_530_912, 2_418_904_113)).toBe('+104,2%');
    expect(statFormatter.deltaPercent(2_418_904_113, 1_184_530_912)).toBe('-51,0%');
  });

  it('renders an exact tie as +0,0%', () => {
    expect(statFormatter.deltaPercent(1_000, 1_000)).toBe('+0,0%');
  });

  it('signs from the rounded value, so a hairline deficit is not "-0,0%"', () => {
    expect(statFormatter.deltaPercent(1_000_000, 999_999)).toBe('+0,0%');
  });

  it('refuses to divide by a zero baseline', () => {
    expect(statFormatter.deltaPercent(0, 5_000)).toBe('—');
  });

  it('rejects a pair whose scaled difference leaves the safe range', () => {
    expect(() => statFormatter.deltaPercent(1, Number.MAX_SAFE_INTEGER)).toThrow(/§2\.1/);
  });
});

describe('separators belong to the app, not to the platform (§6, ADR-0025)', () => {
  const withIntlReplacedBy = <T>(replacement: unknown, body: () => T): T => {
    const globals = globalThis as { Intl?: unknown };
    const original = globals.Intl;
    try {
      globals.Intl = replacement;
      return body();
    } finally {
      globals.Intl = original;
    }
  };

  it('still groups when Intl is missing entirely', () => {
    withIntlReplacedBy(undefined, () => {
      const withoutIntl = createStatFormatter();
      expect(withoutIntl.exact(2_418_904_113)).toBe('2.418.904.113');
      expect(withoutIntl.short(9_995_000_000, 'BILLIONS')).toBe('10,00 B');
      expect(withoutIntl.critExact(712_043)).toBe('71,2043 %');
    });
  });

  it('ignores an Intl that groups with the wrong character', () => {
    // The failure this guards is quiet, not loud: a Hermes build without the requested
    // locale's data does not throw, it formats under a default one. Before ADR-0025 that
    // was indistinguishable from success; now it would put commas on a screen the rest of
    // the app spells with dots, so Intl has to agree before it is used.
    const commaGrouping = {
      NumberFormat: class {
        format(value: number): string {
          return value === 1234567 ? '1,234,567' : String(value);
        }
      },
    };

    withIntlReplacedBy(commaGrouping, () => {
      expect(createStatFormatter().exact(2_418_904_113)).toBe('2.418.904.113');
    });
  });

  it('takes the separators from the caller, not from the locale name', () => {
    // The locale still selects *where* the groups fall — the argument that keeps Intl in
    // this module at all — but it does not get to choose the punctuation.
    const commas = createStatFormatter('it-IT', { group: ',', decimal: '.' });
    expect(commas.exact(2_418_904_113)).toBe('2,418,904,113');
    expect(commas.critExact(712_043)).toBe('71.2043 %');
  });
});
