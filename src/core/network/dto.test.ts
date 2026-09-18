/**
 * The wire contract's §2.1 defence: a stat above `Number.MAX_SAFE_INTEGER` fails to parse
 * rather than arriving rounded — the same regression guard ARCHITECTURE.md §2 asks the
 * formatter for, restated at the network boundary (ADR-0035, decision 5).
 */

import {
  apiErrorSchema,
  newPlayerDtoSchema,
  playerDtoSchema,
  playerEditDtoSchema,
  rosterSnapshotDtoSchema,
  rosterSyncRequestSchema,
  rosterSyncResponseSchema,
} from './dto';

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

describe('newPlayerDtoSchema', () => {
  it('accepts a locally created row keyed by its clientId', () => {
    const parsed = newPlayerDtoSchema.safeParse({ ...validPlayer, clientId: 'local-1' });
    expect(parsed.success).toBe(true);
  });

  it('drops the two fields the server owns, even when a caller supplies them', () => {
    // The fixture is a whole `PlayerDto` — id and rank included — because that is what a caller
    // holding a local row actually has. Neither may reach the wire: the server assigns the id
    // and owns the ladder's order, and a client that could set either is how the rank
    // contiguity invariant gets broken from this end.
    const parsed = newPlayerDtoSchema.safeParse({ ...validPlayer, clientId: 'local-1' });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('id');
      expect(parsed.data).not.toHaveProperty('rank');
      expect(parsed.data.clientId).toBe('local-1');
    }
  });

  it('rejects a row with no clientId — nothing could map the response back to it', () => {
    expect(newPlayerDtoSchema.safeParse(validPlayer).success).toBe(false);
  });

  it('rejects a stat above Number.MAX_SAFE_INTEGER on the way out, not just on the way in', () => {
    const parsed = newPlayerDtoSchema.safeParse({
      ...validPlayer,
      clientId: 'local-1',
      hp: Number.MAX_SAFE_INTEGER + 2,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('playerEditDtoSchema', () => {
  it('keeps the server id and drops the rank', () => {
    const parsed = playerEditDtoSchema.safeParse(validPlayer);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(validPlayer.id);
      expect(parsed.data).not.toHaveProperty('rank');
    }
  });

  it('rejects an edit with no id — there is nothing for the server to overwrite', () => {
    const { id: _id, ...withoutId } = validPlayer;
    expect(playerEditDtoSchema.safeParse(withoutId).success).toBe(false);
  });
});

describe('rosterSyncRequestSchema', () => {
  const emptyPush = { newPlayers: [], editedPlayers: [], headToHead: [] };

  it('accepts a push with nothing in it', () => {
    expect(rosterSyncRequestSchema.safeParse(emptyPush).success).toBe(true);
  });

  it('rejects more new players than the server accepts, naming the cap here', () => {
    const parsed = rosterSyncRequestSchema.safeParse({
      ...emptyPush,
      newPlayers: Array.from({ length: 501 }, (_, i) => ({
        ...validPlayer,
        clientId: `local-${i}`,
      })),
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts exactly the cap', () => {
    const parsed = rosterSyncRequestSchema.safeParse({
      ...emptyPush,
      newPlayers: Array.from({ length: 500 }, (_, i) => ({
        ...validPlayer,
        clientId: `local-${i}`,
      })),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a push carrying a stat that could not survive the wire', () => {
    const parsed = rosterSyncRequestSchema.safeParse({
      ...emptyPush,
      editedPlayers: [{ ...validPlayer, combatPower: Number.MAX_SAFE_INTEGER + 2 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('rosterSyncResponseSchema', () => {
  const snapshot = { season: 41, viewerId: null, players: [validPlayer], headToHead: [] };

  it('accepts a snapshot plus the clientId -> server id map', () => {
    const parsed = rosterSyncResponseSchema.safeParse({
      snapshot,
      assignedIds: { 'local-1': validPlayer.id },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts an empty map — a push that only edited rows assigned nothing', () => {
    expect(rosterSyncResponseSchema.safeParse({ snapshot, assignedIds: {} }).success).toBe(true);
  });

  it('rejects an assigned id that is not a uuid', () => {
    const parsed = rosterSyncResponseSchema.safeParse({
      snapshot,
      assignedIds: { 'local-1': 'not-a-uuid' },
    });
    expect(parsed.success).toBe(false);
  });
});
