import {
  parseBaseExp,
  parseEnhancementExp,
  parseEquipmentCatalog,
  type UpgradePlan,
} from '@/core/collection';
import type { HeldEquipment } from '@/core/common';

import { clampTarget, pieceLine, planLines, plannablePieces } from './plannerUiState';

const EQUIPMENT = [
  'id,_name,item_sub_type,grade,elemental_type,exp',
  '10171000,Valkyrie Sword,Weapon,7,Normal,120000000',
  '10181000,Transcendent Sword,Weapon,8,Fire,1200000000',
  '10191000,Ultimate Sword,Weapon,9,Fire,9600000000',
  '10691000,Ultimate Aura,Aura,9,Normal,6240000',
  '10161000,Mythic Sword,Weapon,6,Normal,100000000',
].join('\r\n');
const BASE = parseBaseExp(EQUIPMENT);
const CATALOG = parseEquipmentCatalog(EQUIPMENT);
const LEVELS = parseEnhancementExp(
  [
    'id,item_sub_type,grade,level,cost,exp',
    '1,Weapon,7,1,0,128000000',
    '2,Weapon,8,1,0,1280000000',
    '3,Weapon,8,2,50,2560000000',
    '4,Weapon,9,1,0,10240000000',
    '5,Aura,9,1,0,6656000',
    '6,Weapon,6,1,0,106000000',
  ].join('\r\n'),
);

const held = (tradableId: string, itemId: number, level: number, exp: number): HeldEquipment => ({
  itemId,
  level,
  hasSkill: false,
  exp,
  tradableId,
  equipped: false,
});

describe('plannablePieces', () => {
  it('keeps raisable pieces of grade 7 and up, highest grade then most raised first', () => {
    const pieces = plannablePieces(
      [
        held('a', 10171000, 0, 120_000_000),
        held('b', 10181000, 1, 1_280_000_000),
        held('c', 10191000, 0, 9_600_000_000),
        held('d', 10181000, 0, 1_200_000_000),
      ],
      BASE,
      LEVELS,
      CATALOG,
    );

    expect(pieces.map((p) => p.piece.tradableId)).toEqual(['c', 'b', 'd', 'a']);
    expect(pieces[0]?.label).toBe('Ultimate Sword +0 · Fire');
    expect(pieces[0]?.max).toBe(1);
  });

  it('leaves out Aura, lower grades, unknown items and pieces already at the last level', () => {
    const ids = plannablePieces(
      [
        held('aura', 10691000, 0, 6_240_000),
        held('low', 10161000, 0, 100_000_000),
        held('unknown', 999, 0, 1),
        held('top', 10181000, 2, 2_560_000_000),
      ],
      BASE,
      LEVELS,
      CATALOG,
    ).map((p) => p.piece.tradableId);

    expect(ids).toEqual([]);
  });
});

describe('pieceLine and clampTarget', () => {
  it('says what the piece holds and whether it is worn', () => {
    const [piece] = plannablePieces(
      [{ ...held('x', 10181000, 0, 1_200_000_000), equipped: true }],
      BASE,
      LEVELS,
      CATALOG,
    );

    expect(pieceLine(piece!)).toBe('Transcendent Sword +0 · Fire · 1,2 Gexp · worn');
  });

  it('keeps the target above the piece and inside the sheet', () => {
    expect(clampTarget(0, 3, 10)).toBe(4);
    expect(clampTarget(7, 3, 10)).toBe(7);
    expect(clampTarget(40, 3, 10)).toBe(10);
  });
});

describe('planLines', () => {
  const base: UpgradePlan = {
    itemId: 10181000,
    from: 0,
    to: 2,
    neededExp: 1_360_000_000,
    picks: [],
    materialExp: 0,
    surplus: 0,
    shortfall: 0,
    materialNcg: 0,
    upgradeNcg: 50,
    total: 50,
    actions: 0,
  };

  it('words a plan that buys nothing', () => {
    expect(planLines({ ...base, neededExp: 0 })).toEqual([
      'The piece already holds enough experience: no material is needed.',
      'The upgrade itself costs 50 NCG.',
      'About 50 NCG in all.',
    ]);
  });

  it('words what to buy, the actions and the surplus', () => {
    const picks = [{}, {}] as unknown as UpgradePlan['picks'];
    const lines = planLines({
      ...base,
      picks,
      materialNcg: 23,
      materialExp: 2_480_000_000,
      surplus: 1_120_000_000,
      total: 73,
      actions: 1,
    });

    expect(lines).toEqual([
      '+0 to +2 takes 1,36 Gexp more.',
      '2 pieces of material for 23 NCG.',
      'The upgrade itself costs 50 NCG.',
      'About 73 NCG in all.',
      '1 upgrade action (50 pieces at most each).',
      '1,12 Gexp would be left over.',
    ]);
  });

  it('says when the offers fall short, and when the upgrade cost is not known', () => {
    const lines = planLines({ ...base, shortfall: 5_000_000_000, upgradeNcg: null, total: null });

    expect(lines).toContain('The cost of the upgrade itself is not in the sheet.');
    expect(lines.at(-1)).toBe(
      'The offers in range fall 5 Gexp short of this level: raise a ceiling or read grade 7.',
    );
  });
});
