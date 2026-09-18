import {
  assignedIdsFromDto,
  headToHeadFromDto,
  headToHeadToDto,
  newPlayerToDto,
  playerEditToDto,
  playerFromDto,
  rosterPushToDto,
  rosterSnapshotFromDto,
} from './mappers';
import type { HeadToHeadDto, PlayerDto, RosterSnapshotDto } from './dto';
import { asPlayerId } from '../model';

const dtoPlayer: PlayerDto = {
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

const dtoHeadToHead: HeadToHeadDto = {
  viewerId: '11111111-1111-1111-1111-111111111111',
  opponentId: '22222222-2222-2222-2222-222222222222',
  wins: 3,
  losses: 1,
};

describe('playerFromDto', () => {
  it('carries every field across, branding the id', () => {
    const player = playerFromDto(dtoPlayer);
    expect(player).toMatchObject({ ...dtoPlayer, id: dtoPlayer.id });
  });
});

describe('headToHeadFromDto', () => {
  it('carries every field across, branding both ids', () => {
    expect(headToHeadFromDto(dtoHeadToHead)).toMatchObject(dtoHeadToHead);
  });
});

describe('rosterSnapshotFromDto', () => {
  it('maps every field, including nested players and records', () => {
    const dto: RosterSnapshotDto & { viewerId: string } = {
      season: 41,
      viewerId: dtoPlayer.id,
      players: [dtoPlayer],
      headToHead: [dtoHeadToHead],
    };

    const snapshot = rosterSnapshotFromDto(dto);

    expect(snapshot.season).toBe(41);
    expect(snapshot.viewerId).toBe(dtoPlayer.id);
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.headToHead).toHaveLength(1);
  });
});

describe('newPlayerToDto', () => {
  const player = playerFromDto(dtoPlayer);

  it('sends the local id as the clientId, and no id of its own', () => {
    const dto = newPlayerToDto(player);

    expect(dto.clientId).toBe(player.id);
    expect(dto).not.toHaveProperty('id');
  });

  it('does not send a rank — the server owns the ladder order', () => {
    expect(newPlayerToDto(player)).not.toHaveProperty('rank');
  });

  it('carries every stat across unchanged, crit still in basis points', () => {
    expect(newPlayerToDto(player)).toMatchObject({
      name: 'Skarn',
      level: 488,
      gameCode: 'a984',
      combatPower: 2_145_880,
      score: 1712,
      hp: 1_440_085_258,
      atk: 2_418_904_113,
      def: 1_204_551_002,
      critBp: 584_127,
      hit: 908_442_310,
      spd: 771_003_984,
    });
  });
});

describe('playerEditToDto', () => {
  const player = playerFromDto(dtoPlayer);

  it('keeps the server id and drops the rank', () => {
    const dto = playerEditToDto(player);

    expect(dto.id).toBe(dtoPlayer.id);
    expect(dto).not.toHaveProperty('rank');
    expect(dto).not.toHaveProperty('clientId');
  });
});

describe('headToHeadToDto', () => {
  it('carries the record back out unchanged', () => {
    expect(headToHeadToDto(headToHeadFromDto(dtoHeadToHead))).toEqual(dtoHeadToHead);
  });
});

describe('rosterPushToDto', () => {
  it('maps each of the three lists with its own mapper', () => {
    const player = playerFromDto(dtoPlayer);

    const request = rosterPushToDto({
      newPlayers: [player],
      editedPlayers: [player],
      headToHead: [headToHeadFromDto(dtoHeadToHead)],
    });

    // The same player on both lists leaves as two different shapes — which is the whole point
    // of the two mappers: new rows are keyed by clientId, edits by the id the server issued.
    expect(request.newPlayers[0]).toHaveProperty('clientId', player.id);
    expect(request.newPlayers[0]).not.toHaveProperty('id');
    expect(request.editedPlayers[0]).toHaveProperty('id', player.id);
    expect(request.editedPlayers[0]).not.toHaveProperty('clientId');
    expect(request.headToHead).toEqual([dtoHeadToHead]);
  });

  it('maps an empty push to three empty lists rather than to nothing', () => {
    expect(rosterPushToDto({ newPlayers: [], editedPlayers: [], headToHead: [] })).toEqual({
      newPlayers: [],
      editedPlayers: [],
      headToHead: [],
    });
  });
});

describe('assignedIdsFromDto', () => {
  it('reads the wire object as a map keyed by the local id', () => {
    const assigned = assignedIdsFromDto({ 'local-1': dtoPlayer.id });

    expect(assigned.get(asPlayerId('local-1'))).toBe(dtoPlayer.id);
    expect(assigned.size).toBe(1);
  });

  it('reads an empty object as an empty map', () => {
    expect(assignedIdsFromDto({}).size).toBe(0);
  });
});
