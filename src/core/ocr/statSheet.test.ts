/**
 * The screenshot parser (ADR-0024), in the fast Node project — no RN preset, no emulator,
 * no ML Kit.
 *
 * The fixture is the profile screenshot this feature was built from, transcribed as the
 * lines a recogniser returns. Its frames are the real layout's proportions rather than
 * exact pixels: what the parser reads off them is which fragments share a row and which
 * cluster is the dialog, and both survive a resolution change — which is the property the
 * geometry exists to have.
 *
 * The fixture deliberately keeps its distractors. Behind the profile dialog sit the
 * viewer's *own* CP and a build stamp containing `#10850983`, and those two are the reason
 * the parser has an anchor and a header-row rule at all. A fixture cropped to the dialog
 * would pass without either.
 */

import { gameCodeLabel } from '../model';
import { parseStatSheet, toWholeNumber, type ScannedLine } from './statSheet';

const line = (text: string, left: number, top: number, right: number, bottom = top + 34) => ({
  text,
  frame: { left, top, right, bottom },
});

/** The dialog: header, the CP panel on the right, and the six stat rows under it. */
const DIALOG: ScannedLine[] = [
  line('Lv.488', 700, 60, 782),
  line('Deus', 790, 58, 856),
  // Through `gameCodeLabel` rather than as a literal: '#a984' is indistinguishable from a
  // hex colour to the ARCHITECTURE.md §2.4 token rule, which rejects one on sight.
  line(gameCodeLabel('a984'), 862, 62, 922),
  line('Mythic Warrior', 722, 165, 902),
  line('CP 11.724.329.467', 1378, 265, 1632),
  line('HP', 1398, 366, 1436),
  line('1440085258', 1465, 366, 1610),
  line('ATK', 1398, 404, 1448),
  line('476993540', 1478, 404, 1610),
  line('DEF', 1398, 442, 1448),
  line('146695690', 1478, 442, 1610),
  line('CRI', 1398, 480, 1440),
  line('149%', 1546, 480, 1610),
  line('HIT', 1398, 518, 1440),
  line('417532877', 1478, 518, 1610),
  line('SPD', 1398, 556, 1450),
  line('1014675713', 1465, 556, 1610),
];

/** The roster underneath it, half-covered — including a second, wrong, CP. */
const BACKDROP: ScannedLine[] = [
  line('ARENA', 185, 40, 280),
  line('Xyrer', 246, 310, 330),
  line('CP 13.14', 210, 355, 320),
  line('W 78 | L', 220, 585, 330),
  line('Refresh 2,0 NCG', 1760, 872, 1950),
  line('APV: 200460 / #10850983 / Hash: ee4f / Ver: 450.0.0', 96, 905, 830, 930),
];

const SHEET = [...BACKDROP, ...DIALOG];

describe('parseStatSheet — the stat panel', () => {
  it('reads every stat off the screenshot the feature was built from', () => {
    expect(parseStatSheet(SHEET).values).toMatchObject({
      hp: 1_440_085_258,
      atk: 476_993_540,
      def: 146_695_690,
      critPercent: 149,
      hit: 417_532_877,
      spd: 1_014_675_713,
    });
  });

  it('pairs a label with the number beside it when the recogniser splits the row', () => {
    // Every stat in the fixture arrives as two fragments — which is the common case, not
    // the exotic one, because the game puts a wide gap between label and value.
    expect(parseStatSheet(DIALOG).values.spd).toBe(1_014_675_713);
  });

  it('reads a stat that arrives on one line as well', () => {
    const inline = [line('ATK', 0, 0, 1), line('DEF 146695690', 1398, 442, 1610)];
    expect(parseStatSheet(inline).values.def).toBe(146_695_690);
  });

  it('does not pair a label with a number on a different row', () => {
    const stray = [line('SPD', 1398, 556, 1450), line('1014675713', 1465, 900, 1610)];
    expect(parseStatSheet(stray).values.spd).toBeUndefined();
  });

  it('takes CRI as a whole percentage, so the draft and the form agree on the unit', () => {
    expect(parseStatSheet(SHEET).values.critPercent).toBe(149);
  });
});

describe('parseStatSheet — combat power', () => {
  it('reads the dotted group separators as one integer', () => {
    expect(parseStatSheet(SHEET).values.combatPower).toBe(11_724_329_467);
  });

  it('prefers the CP inside the dialog over the one on the roster behind it', () => {
    // The backdrop's CP comes first in reading order and is the wrong answer. Nothing but
    // the distance to the stat panel separates them.
    expect(parseStatSheet(SHEET).values.combatPower).not.toBe(1314);
  });

  it('falls back to reading order when there is no stat panel to anchor against', () => {
    const headerOnly = [line('CP 11.724.329.467', 1378, 265, 1632)];
    expect(parseStatSheet(headerOnly).values.combatPower).toBe(11_724_329_467);
  });
});

describe('parseStatSheet — the header', () => {
  it('reads the level, the name and the game code from one row', () => {
    expect(parseStatSheet(SHEET).values).toMatchObject({
      level: 488,
      name: 'Deus',
      gameCode: 'a984',
    });
  });

  it('reads them when the recogniser returns the whole header as one line', () => {
    const joined = [...DIALOG.slice(3), line('Lv.488 Deus #a984', 700, 58, 922)];
    expect(parseStatSheet(joined).values).toMatchObject({
      level: 488,
      name: 'Deus',
      gameCode: 'a984',
    });
  });

  it('ignores a # elsewhere on the screen, so a build stamp is not a player code', () => {
    expect(parseStatSheet(SHEET).values.gameCode).toBe('a984');
  });

  it('lower-cases the code, so #A984 and #a984 are one player', () => {
    const shouty = [line('Lv.488 Deus #A984', 700, 58, 922)];
    expect(parseStatSheet(shouty).values.gameCode).toBe('a984');
  });

  it('keeps a name that contains digits, because a name has no shape to check', () => {
    const numbered = [line('Lv.12 R2D2 #ff01', 700, 58, 940)];
    expect(parseStatSheet(numbered).values.name).toBe('R2D2');
  });

  it('reports no name when the header holds nothing but a level and a code', () => {
    expect(parseStatSheet([line('Lv.12 #ff01', 700, 58, 900)]).values.name).toBeUndefined();
  });
});

describe('parseStatSheet — what it refuses to invent', () => {
  it('never reports a score: the profile screen does not show one', () => {
    expect(Object.keys(parseStatSheet(SHEET).values)).not.toContain('score');
    expect(parseStatSheet(SHEET).missing).toEqual([]);
  });

  it('lists the fields it could not read rather than defaulting them to zero', () => {
    const partial = parseStatSheet([
      line('ATK', 1398, 404, 1448),
      line('476993540', 1478, 404, 1610),
    ]);
    expect(partial.values.atk).toBe(476_993_540);
    expect(partial.values.hp).toBeUndefined();
    expect(partial.missing).toContain('hp');
    expect(partial.found).toEqual(['atk']);
  });

  it('finds nothing in a picture with no stat sheet in it', () => {
    const holiday = [line('Sunset over the harbour', 10, 10, 400)];
    expect(parseStatSheet(holiday).found).toEqual([]);
  });
});

describe('toWholeNumber', () => {
  it.each([
    ['11.724.329.467', 11_724_329_467],
    ['11,724,329,467', 11_724_329_467],
    ['1 440 085 258', 1_440_085_258],
    ['149%', 149],
    ['0', 0],
  ])('reads %s as %d', (token, expected) => {
    expect(toWholeNumber(token as string)).toBe(expected);
  });

  it.each([
    // No character repair, on purpose: `O` is not 0 and `l` is not 1. A rescue would turn
    // an unreadable value into a plausible wrong one the user cannot spot in the form.
    ['1O5'],
    ['l49'],
    ['-5'],
    ['2.5x'],
    [''],
    ['Deus'],
  ])('refuses %s rather than guessing', (token) => {
    expect(toWholeNumber(token)).toBeNull();
  });

  it('refuses a run of digits past the 2^53 ceiling', () => {
    expect(toWholeNumber('9007199254740993')).toBeNull();
  });
});
