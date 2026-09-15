/**
 * DTO -> domain, the translation `core/data` and the rest of the app never has to know exists
 * (ARCHITECTURE.md §4: nothing above `core/network` sees a DTO). One direction only — nothing
 * here maps a domain `Player` back to a `PlayerDto`, because nothing on the pull side writes
 * one; the push direction's request DTOs (`backend/openapi.yaml`'s `NewPlayer`) are the
 * remaining Phase 5 work ADR-0035 leaves open.
 */

import { asPlayerId, type HeadToHead, type Player } from '../model';
import type { HeadToHeadDto, PlayerDto, RosterSnapshotDto } from './dto';
import type { RosterSnapshot } from '../common';

export const playerFromDto = (dto: PlayerDto): Player => ({
  id: asPlayerId(dto.id),
  name: dto.name,
  level: dto.level,
  gameCode: dto.gameCode,
  rank: dto.rank,
  combatPower: dto.combatPower,
  score: dto.score,
  hp: dto.hp,
  atk: dto.atk,
  def: dto.def,
  critBp: dto.critBp,
  hit: dto.hit,
  spd: dto.spd,
});

export const headToHeadFromDto = (dto: HeadToHeadDto): HeadToHead => ({
  viewerId: asPlayerId(dto.viewerId),
  opponentId: asPlayerId(dto.opponentId),
  wins: dto.wins,
  losses: dto.losses,
});

/**
 * `RosterSnapshot.viewerId` is not optional (`core/common/rosterSource.ts`); an account with no
 * viewer chosen yet has nothing to put there. `remoteRosterSource.ts` checks `dto.viewerId`
 * before calling this, so the non-null assertion below is an invariant the caller already
 * enforced, not a cast around a real possibility.
 */
export const rosterSnapshotFromDto = (
  dto: RosterSnapshotDto & { viewerId: string },
): RosterSnapshot => ({
  season: dto.season,
  viewerId: asPlayerId(dto.viewerId),
  players: dto.players.map(playerFromDto),
  headToHead: dto.headToHead.map(headToHeadFromDto),
});
