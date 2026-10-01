import { isPlanet, normaliseAvatarAddress, parseStoredAvatar, sameAvatar } from './index';

const LOWER = '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f';

describe('normaliseAvatarAddress', () => {
  it('lower-cases and trims a pasted checksum address', () => {
    expect(normaliseAvatarAddress('  0x1023D8F22c6F5A8701E56A95E18Fb2DBE436B41f \n')).toBe(LOWER);
  });

  it.each([
    ['too short', '0x1023'],
    ['too long', `${LOWER}0`],
    ['no 0x prefix', LOWER.slice(2)],
    ['a non-hex digit', `0x${'z'.repeat(40)}`],
    ['empty', ''],
  ])('refuses %s', (_, raw) => {
    expect(normaliseAvatarAddress(raw)).toBeNull();
  });
});

describe('parseStoredAvatar', () => {
  it('reads what the preference layer writes', () => {
    const stored = JSON.stringify({ planet: 'odin', address: LOWER });
    expect(parseStoredAvatar(stored)).toEqual({ planet: 'odin', address: LOWER });
  });

  it('re-normalises an address written in another case', () => {
    const stored = JSON.stringify({
      planet: 'odin',
      address: LOWER.toUpperCase().replace('0X', '0x'),
    });
    expect(parseStoredAvatar(stored)?.address).toBe(LOWER);
  });

  it.each([
    ['absent', undefined],
    ['not JSON', '{'],
    ['not an object', '"x"'],
    ['null', 'null'],
    ['an unknown planet', JSON.stringify({ planet: 'asgard', address: LOWER })],
    ['a bad address', JSON.stringify({ planet: 'odin', address: '0x12' })],
    ['a missing field', JSON.stringify({ planet: 'odin' })],
  ])('reads %s as no avatar', (_, raw) => {
    expect(parseStoredAvatar(raw)).toBeNull();
  });
});

describe('isPlanet and sameAvatar', () => {
  it('knows the three planets and nothing else', () => {
    expect(['odin', 'heimdall', 'thor'].every(isPlanet)).toBe(true);
    expect(isPlanet('Odin')).toBe(false);
    expect(isPlanet(undefined)).toBe(false);
  });

  it('compares by value, with null equal only to null', () => {
    const a = { planet: 'odin', address: LOWER } as const;
    expect(sameAvatar(a, { ...a })).toBe(true);
    expect(sameAvatar(a, { ...a, planet: 'heimdall' })).toBe(false);
    expect(sameAvatar(a, null)).toBe(false);
    expect(sameAvatar(null, null)).toBe(true);
  });
});
