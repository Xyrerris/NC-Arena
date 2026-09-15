import { headToHeadFromDto, playerFromDto, rosterSnapshotFromDto } from './mappers';
import type { HeadToHeadDto, PlayerDto, RosterSnapshotDto } from './dto';

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
