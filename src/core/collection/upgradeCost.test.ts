import { parseEnhancementCosts, standardPrice, upgradeNcg, verdictFor } from './upgradeCost';

// Legend (grade 5) weapons: the figures the owner quoted, +9 at 640 NCG from +0.
const CSV = [
  'id,item_sub_type,grade,level,cost,exp',
  '1,Weapon,5,1,0,4000000',
  '2,Weapon,5,2,0,4000000',
  '3,Weapon,5,3,0,8000000',
  '4,Weapon,5,4,20,16000000',
  '5,Weapon,5,5,40,32000000',
  '6,Weapon,5,6,80,64000000',
  '7,Weapon,5,7,160,128000000',
  '8,Weapon,5,8,320,256000000',
  '9,Weapon,5,9,640,512000000',
  'x,Weapon,5,10,bad,0',
].join('\r\n');

const costs = parseEnhancementCosts(CSV);

describe('parseEnhancementCosts', () => {
  it('reads the cumulative cost by slot, grade and level, skipping rows that are not numeric', () => {
    expect(standardPrice(costs, 6, 5, 9)).toBe(640);
    expect(standardPrice(costs, 6, 5, 3)).toBe(0);
    expect(standardPrice(costs, 6, 5, 10)).toBeNull();
  });

  it('knows no cost for a slot, a grade or a sub type the sheet does not have', () => {
    expect(standardPrice(costs, 7, 5, 9)).toBeNull();
    expect(standardPrice(costs, 6, 4, 9)).toBeNull();
    expect(standardPrice(costs, 99, 5, 9)).toBeNull();
  });

  it('fails on a sheet without its columns, or an empty one', () => {
    expect(() => parseEnhancementCosts('id,grade')).toThrow('item_sub_type');
    expect(() => parseEnhancementCosts('')).toThrow('empty');
  });
});

describe('upgradeNcg', () => {
  it('is the difference of the cumulative costs', () => {
    expect(upgradeNcg(costs, 6, 5, 8, 9)).toBe(320);
    expect(upgradeNcg(costs, 6, 5, 6, 9)).toBe(560);
    expect(upgradeNcg(costs, 6, 5, 0, 9)).toBe(640);
    expect(upgradeNcg(costs, 6, 5, 2, 3)).toBe(0);
  });

  it('is null going down, or when a level is not in the sheet', () => {
    expect(upgradeNcg(costs, 6, 5, 9, 8)).toBeNull();
    expect(upgradeNcg(costs, 6, 5, 9, 10)).toBeNull();
  });
});

describe('verdictFor', () => {
  it('judges a Legend +9 against 640: 600 is good, 800 fair, 900 dear', () => {
    expect(verdictFor(600, 640)).toBe('good');
    expect(verdictFor(640, 640)).toBe('good');
    expect(verdictFor(800, 640)).toBe('fair');
    expect(verdictFor(900, 640)).toBe('dear');
  });

  it('has no verdict where the standard price is nothing', () => {
    expect(verdictFor(50, 0)).toBeNull();
  });

  it('puts the line at 130% exactly', () => {
    expect(verdictFor(130, 100)).toBe('fair');
    expect(verdictFor(130.01, 100)).toBe('dear');
  });
});
