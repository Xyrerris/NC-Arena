import type { HeadToHeadDto, PlayerDto } from '../schemas/player.js';
import type { HeadToHeadRow, PlayerRow } from '../db/schema.js';

export const toPlayerDto = (row: PlayerRow): PlayerDto => ({
  id: row.id,
  name: row.name,
  level: row.level,
  gameCode: row.gameCode,
  rank: row.rank,
  combatPower: row.combatPower,
  score: row.score,
  hp: row.hp,
  atk: row.atk,
  def: row.def,
  critBp: row.critBp,
  hit: row.hit,
  spd: row.spd,
});

export const toHeadToHeadDto = (row: HeadToHeadRow): HeadToHeadDto => ({
  viewerId: row.viewerId,
  opponentId: row.opponentId,
  wins: row.wins,
  losses: row.losses,
});
