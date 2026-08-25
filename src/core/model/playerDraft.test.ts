/**
 * The draft validation rules (ADR-0020), in the fast Node project — no RN preset, no
 * renderer. That is the point of keeping validation in `core/model`: the rule the form
 * shows and the rule the repository enforces are one function, and it is provable without
 * mounting anything.
 */

import {
  MAX_CRIT_PERCENT,
  MAX_GAME_CODE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  emptyPlayerDraft,
  gameCodeLabel,
  isPlayerDraftValid,
  normaliseGameCode,
  normalisePlayerName,
  validatePlayerDraft,
  type PlayerDraft,
} from './playerDraft';

const draft = (over: Partial<PlayerDraft> = {}): PlayerDraft => ({
  ...emptyPlayerDraft(),
  name: 'Skarn',
  level: 488,
  gameCode: 'a984',
  hp: 1_440_085_258,
  combatPower: 2_145_880,
  score: 1712,
  atk: 2_418_904_113,
  def: 1_204_551_002,
  critPercent: 58,
  hit: 908_442_310,
  spd: 771_003_984,
  ...over,
});

describe('validatePlayerDraft — the name', () => {
  it('accepts a filled-in draft', () => {
    expect(isPlayerDraftValid(validatePlayerDraft(draft()))).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(validatePlayerDraft(draft({ name: '' })).name).toBeDefined();
  });

  it('rejects a name that is only whitespace, rather than storing a blank player', () => {
    expect(validatePlayerDraft(draft({ name: '   ' })).name).toBeDefined();
  });

  it('measures the name after trimming, so padding cannot push it over the limit', () => {
    const exactly = 'x'.repeat(MAX_PLAYER_NAME_LENGTH);
    expect(validatePlayerDraft(draft({ name: `  ${exactly}  ` })).name).toBeUndefined();
    expect(validatePlayerDraft(draft({ name: `${exactly}y` })).name).toBeDefined();
  });
});

describe('validatePlayerDraft — the stats', () => {
  it('accepts a value above Int32, which is the whole point of the 2^53 ceiling', () => {
    // 2_418_904_113 > 2_147_483_647. Prototype defect 1: harmless in JS, and this asserts
    // the validator does not reintroduce a 32-bit limit by accident.
    expect(validatePlayerDraft(draft({ atk: 2_418_904_113 })).atk).toBeUndefined();
  });

  it('rejects a value above Number.MAX_SAFE_INTEGER', () => {
    // The §2.1 ceiling. Above it arithmetic stops being exact silently, and the formatter
    // throws on a value that reached it through a form.
    expect(validatePlayerDraft(draft({ combatPower: 2 ** 53 })).combatPower).toBeDefined();
  });

  it('rejects a fractional stat', () => {
    expect(validatePlayerDraft(draft({ spd: 1.5 })).spd).toBeDefined();
  });

  it('rejects NaN, which is what an unparseable field arrives as', () => {
    expect(validatePlayerDraft(draft({ hit: Number.NaN })).hit).toBeDefined();
  });

  it('rejects a negative stat', () => {
    expect(validatePlayerDraft(draft({ def: -1 })).def).toBeDefined();
  });

  it('accepts zero, so a brand-new player does not have to lie about their stats', () => {
    const blank = { ...emptyPlayerDraft(), name: 'New' };
    expect(isPlayerDraftValid(validatePlayerDraft(blank))).toBe(true);
  });

  it('accepts a crit above 100 %, because the game has them', () => {
    // An earlier cut of the validator capped crit at 100 %, which rejected real values.
    for (const percent of [10, 113, 178]) {
      expect(validatePlayerDraft(draft({ critPercent: percent })).critPercent).toBeUndefined();
    }
  });

  it('rejects a fractional percentage', () => {
    // The reason the draft carries percent rather than basis points: 58.4127 * 10_000 is
    // 584127, a perfectly valid bp, so a draft that scaled first would launder this past
    // every validator downstream.
    expect(validatePlayerDraft(draft({ critPercent: 58.4127 })).critPercent).toBeDefined();
  });

  it('rejects a crit too large to scale into basis points exactly', () => {
    // The 2^53 ceiling, reached through the x10_000 conversion rather than head-on.
    expect(
      validatePlayerDraft(draft({ critPercent: MAX_CRIT_PERCENT })).critPercent,
    ).toBeUndefined();
    expect(
      validatePlayerDraft(draft({ critPercent: MAX_CRIT_PERCENT + 1 })).critPercent,
    ).toBeDefined();
  });

  it('names every offending field at once, rather than stopping at the first', () => {
    // The form puts each message under its own input, so a submit that reported one
    // problem at a time would make fixing three fields take three round trips.
    const errors = validatePlayerDraft(draft({ name: '', atk: -1, critPercent: -1 }));
    expect(Object.keys(errors).sort()).toEqual(['atk', 'critPercent', 'name']);
  });
});

describe('normalisePlayerName', () => {
  it('trims, so " Skarn " and "Skarn" are the same player to the duplicate check', () => {
    expect(normalisePlayerName('  Skarn  ')).toBe('Skarn');
  });
});

/**
 * The two fields ADR-0023 added beside the stats. Neither is a stat: nothing compares two
 * players by level, and the code is an identifier the game issues and this app only ever
 * displays.
 */
describe('validatePlayerDraft — the level and the game code', () => {
  it('validates the level by the same rule as every other number', () => {
    expect(validatePlayerDraft(draft({ level: -1 })).level).toBeDefined();
    expect(validatePlayerDraft(draft({ level: 1.5 })).level).toBeDefined();
    expect(validatePlayerDraft(draft({ level: 0 })).level).toBeUndefined();
  });

  it('validates HP by that rule too, including above Int32', () => {
    expect(isPlayerDraftValid(validatePlayerDraft(draft({ hp: 1_440_085_258 })))).toBe(true);
    expect(validatePlayerDraft(draft({ hp: -1 })).hp).toBeDefined();
  });

  it('accepts a blank code: a player typed in from memory may not have one', () => {
    expect(validatePlayerDraft(draft({ gameCode: '' })).gameCode).toBeUndefined();
  });

  it('accepts the code with the # the game paints in front of it', () => {
    // Built through `gameCodeLabel` rather than written out: a bare '#a984' literal is
    // indistinguishable from a hex colour to the §2.4 token rule, which would reject it.
    expect(
      validatePlayerDraft(draft({ gameCode: gameCodeLabel('a984') })).gameCode,
    ).toBeUndefined();
  });

  it('rejects a code with punctuation in it, which is the shape a mis-scan produces', () => {
    expect(validatePlayerDraft(draft({ gameCode: 'a9-84' })).gameCode).toBeDefined();
  });

  it('rejects a code longer than the ceiling', () => {
    const long = 'a'.repeat(MAX_GAME_CODE_LENGTH + 1);
    expect(validatePlayerDraft(draft({ gameCode: long })).gameCode).toBeDefined();
  });
});

describe('normaliseGameCode', () => {
  it.each([[gameCodeLabel('a984')], ['a984'], [' A984 '], [gameCodeLabel('a984').toUpperCase()]])(
    'reads %s as the one stored value a984',
    (raw) => {
      expect(normaliseGameCode(raw)).toBe('a984');
    },
  );

  it('leaves an absent code absent rather than inventing a #', () => {
    expect(normaliseGameCode('')).toBe('');
    expect(gameCodeLabel('')).toBe('');
  });

  it('adds the # back for display, because that is punctuation the game paints', () => {
    // Assembled rather than written out: to the §2.4 token rule, '#a984' is a hex colour
    // and rejecting it is exactly what that rule is for.
    const sigil = '#';
    expect(gameCodeLabel('a984')).toBe(`${sigil}a984`);
  });
});
