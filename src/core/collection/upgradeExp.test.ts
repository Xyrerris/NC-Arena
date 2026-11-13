/**
 * Rows are the ones the Heimdall node answered with on 2026-10-27 (ADR-0047).
 */

import { materialExp, parseBaseExp, parseEnhancementExp } from './upgradeExp';

const EQUIPMENT = [
  'id,_name,item_sub_type,grade,elemental_type,set_id,stat_type,stat_value,attack_range,spine_resource_path,exp',
  '10181000,Transcendent Sword,Weapon,8,Fire,12,ATK,2387604,2,10171000,1200000000',
  '10191000,Ultimate Sword,Weapon,9,Fire,12,ATK,3000000,2,10171000,9600000000',
  '10690000,Ymir Aura,Aura,9,Normal,0,ATK,1,0,x,6240000',
  'not a number,Broken,Weapon,9,Fire,12,ATK,1,2,x,5',
].join('\r\n');

const ENHANCEMENT = [
  'id,item_sub_type,grade,level,cost,exp,required_block',
  '1,Weapon,8,1,0,1280000000,20',
  '2,Weapon,8,2,0,2560000000,40',
  '3,Weapon,8,10,140,38400000000,200',
  '4,Weapon,9,1,0,10240000000,20',
  '5,Weapon,9,2,0,20480000000,40',
  '6,EquipmentMaterial,8,0,0,500000000,0',
  '7,Weapon,9,3,x,35840000000,60',
].join('\r\n');

describe('parseBaseExp', () => {
  it('reads each item by id with its slot, grade and +0 experience, skipping rows that are not numbers', () => {
    const base = parseBaseExp(EQUIPMENT);

    expect(base.get(10191000)).toEqual({ slot: 'Weapon', grade: 9, exp: 9_600_000_000 });
    expect(base.get(10181000)).toEqual({ slot: 'Weapon', grade: 8, exp: 1_200_000_000 });
    expect(base.get(10690000)).toEqual({ slot: 'Aura', grade: 9, exp: 6_240_000 });
    expect(base.size).toBe(3);
  });

  it('refuses a sheet without the column it needs, and an empty one', () => {
    expect(() => parseBaseExp('id,_name\r\n1,x')).toThrow('no "item_sub_type" column');
    expect(() => parseBaseExp('')).toThrow('empty');
  });
});

describe('parseEnhancementExp', () => {
  it('is cumulative per slot and grade, indexed by level, and skips level 0', () => {
    const levels = parseEnhancementExp(ENHANCEMENT);

    expect(levels.get('Weapon|8')?.[1]).toBe(1_280_000_000);
    expect(levels.get('Weapon|8')?.[10]).toBe(38_400_000_000);
    expect(levels.get('Weapon|9')?.[2]).toBe(20_480_000_000);
    // The row whose cost is not a number still has a usable exp: only level, grade and exp matter.
    expect(levels.get('Weapon|9')?.[3]).toBe(35_840_000_000);
    expect(levels.has('EquipmentMaterial|8')).toBe(false);
  });
});

describe('materialExp', () => {
  const base = parseBaseExp(EQUIPMENT);
  const levels = parseEnhancementExp(ENHANCEMENT);

  it("gives the item's own base at +0 and the level's cumulative experience above it", () => {
    expect(materialExp(base, levels, 10191000, 0)).toBe(9_600_000_000);
    expect(materialExp(base, levels, 10181000, 10)).toBe(38_400_000_000);
  });

  it('is null for an item or a level the sheets do not have, never a guess', () => {
    expect(materialExp(base, levels, 99999999, 0)).toBeNull();
    expect(materialExp(base, levels, 10181000, 11)).toBeNull();
    // An aura has no enhancement rows in this extract.
    expect(materialExp(base, levels, 10690000, 3)).toBeNull();
  });

  it('a +1 grade 8 piece is worth only about 7% more than a +0 one: the gain is at the high levels', () => {
    const plain = materialExp(base, levels, 10181000, 0) as number;
    const raised = materialExp(base, levels, 10181000, 1) as number;

    expect(raised / plain).toBeCloseTo(1.0667, 3);
  });
});
