/**
 * The wire contract's §2.1 defence: a stat above `Number.MAX_SAFE_INTEGER` fails to parse
 * rather than arriving rounded — the same regression guard ARCHITECTURE.md §2 asks the
 * formatter for, restated at the network boundary (ADR-0035, decision 5).
 */

import { apiErrorSchema, playerDtoSchema, rosterSnapshotDtoSchema } from './dto';

const validPlayer = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  name: 'Skarn',
  level: 488,
  gameCode: 'a984',
  rank: 1,
  combatPower: 2_145_880,
  score: 1712,
  hp: 1_440_085_258,
  atk: 2_418_904_113,
  def: 1_204_551_002,
  critBp: 584_127,
  hit: 908_442_310,
  spd: 771_003_984,
};

describe('playerDtoSchema', () => {
  it('accepts a well-formed player', () => {
    expect(playerDtoSchema.safeParse(validPlayer).success).toBe(true);
  });

  it('rejects a stat above Number.MAX_SAFE_INTEGER', () => {
    const parsed = playerDtoSchema.safeParse({
      ...validPlayer,
      combatPower: Number.MAX_SAFE_INTEGER + 2,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-integer stat', () => {
    const parsed = playerDtoSchema.safeParse({ ...validPlayer, atk: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it('rejects an id that is not a uuid', () => {
    const parsed = playerDtoSchema.safeParse({ ...validPlayer, id: 'not-a-uuid' });
    expect(parsed.success).toBe(false);
  });
});

describe('rosterSnapshotDtoSchema', () => {
  it('accepts a snapshot with a null viewerId — an account with none chosen yet', () => {
    const parsed = rosterSnapshotDtoSchema.safeParse({
      season: 41,
      viewerId: null,
      players: [validPlayer],
      headToHead: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a snapshot whose player fails the contract', () => {
    const parsed = rosterSnapshotDtoSchema.safeParse({
      season: 41,
      viewerId: null,
      players: [{ ...validPlayer, atk: -1 }],
      headToHead: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts every taxonomy code (ADR-0035, decision 4)', () => {
    for (const code of [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'INTERNAL',
    ]) {
      expect(apiErrorSchema.safeParse({ error: { code, message: 'x' } }).success).toBe(true);
    }
  });

  it('rejects a code outside the taxonomy', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(
      false,
    );
  });
});
