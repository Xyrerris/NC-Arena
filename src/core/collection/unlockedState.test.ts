import { parseUnlockedCollectionIds, UnlockedStateError } from './unlockedState';
import { HEIMDALL_UNLOCKED_COUNT, HEIMDALL_UNLOCKED_STATE_HEX } from './unlockedState.fixture';

const hex = (text: string): string =>
  [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

describe('parseUnlockedCollectionIds', () => {
  it("reads the node's real answer", () => {
    const ids = parseUnlockedCollectionIds(HEIMDALL_UNLOCKED_STATE_HEX);
    expect(ids.size).toBe(HEIMDALL_UNLOCKED_COUNT);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(1000262)).toBe(true);
  });

  it('reads a small list and an empty one', () => {
    expect([...parseUnlockedCollectionIds(hex('lli1ei20ei300eee'))]).toEqual([1, 20, 300]);
    expect(parseUnlockedCollectionIds(hex('llee')).size).toBe(0);
  });

  it('accepts upper-case hex', () => {
    expect(parseUnlockedCollectionIds(hex('lli7eee').toUpperCase()).has(7)).toBe(true);
  });

  it.each([
    ['not hexadecimal', 'zz'],
    ['an odd number of digits', '6c6'],
    ['a list never closed', hex('lli1ei2e')],
    ['trailing bytes', hex('lli1eeex')],
    ['a byte string', hex('ll3:abcee')],
    ['a list of the wrong shape', hex('li1ei2ee')],
    ['two inner lists', hex('lli1eeli2eee')],
    ['a nested list inside the ids', hex('llli1eeee')],
    ['an integer with a leading zero', hex('lli01eee')],
    ['an integer past 2^53', hex('lli99999999999999999999eee')],
    ['an empty answer', ''],
  ])('refuses %s instead of returning a partial set', (_, input) => {
    expect(() => parseUnlockedCollectionIds(input)).toThrow(UnlockedStateError);
  });
});
