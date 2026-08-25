/**
 * Row -> domain. The only place database column names appear alongside domain field
 * names, which is what keeps Drizzle row types out of components (ARCHITECTURE.md §4).
 */

import { asPlayerId, type HeadToHead, type Player } from '../model';
import type { HeadToHeadRow, PlayerRow } from './schema';

export const toPlayer = (row: PlayerRow): Player => ({
  id: asPlayerId(row.id),
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

export const toHeadToHead = (row: HeadToHeadRow): HeadToHead => ({
  viewerId: asPlayerId(row.viewerId),
  opponentId: asPlayerId(row.opponentId),
  wins: row.wins,
  losses: row.losses,
});
