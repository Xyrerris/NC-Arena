/**
 * The translation `core/data` and the rest of the app never has to know exists
 * (ARCHITECTURE.md §4: nothing above `core/network` sees a DTO).
 *
 * Both directions now. `*FromDto` is the pull side — what `GET /v1/roster` and the snapshot
 * inside a sync response become. `*ToDto` is the push side, and it is deliberately not the
 * inverse of the first: a `Player` going out loses its `rank` (the server owns the ladder's
 * order) and, when the row is new, trades its local `id` for a `clientId`. A symmetric pair of
 * mappers would have had to invent a rank to send, which is the exact inconsistency
 * `PlayerDraft` exists to prevent (core/model).
 */

import { asPlayerId, type HeadToHead, type Player, type PlayerId } from '../model';
import type {
  HeadToHeadDto,
  NewPlayerDto,
  PlayerDto,
  PlayerEditDto,
  RosterSnapshotDto,
  RosterSyncRequest,
} from './dto';
import type { RosterPush, RosterSnapshot } from '../common';

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

/**
 * A locally created row on its way out. The local `PlayerId` leaves as `clientId` — the device
 * already has a key for the row and a second one would only have to be reconciled later — and
 * `rank` does not leave at all.
 *
 * Every field is written out rather than spread from the player, so a field added to `Player`
 * has to be added here deliberately. A spread would carry it to the server the moment it
 * existed, and the server would refuse the request for an unknown field it never agreed to.
 */
export const newPlayerToDto = (player: Player): NewPlayerDto => ({
  clientId: player.id,
  name: player.name,
  level: player.level,
  gameCode: player.gameCode,
  combatPower: player.combatPower,
  score: player.score,
  hp: player.hp,
  atk: player.atk,
  def: player.def,
  critBp: player.critBp,
  hit: player.hit,
  spd: player.spd,
});

/** An edit to a row the server already owns: `id` stays, and it is a server id. */
export const playerEditToDto = (player: Player): PlayerEditDto => ({
  id: player.id,
  name: player.name,
  level: player.level,
  gameCode: player.gameCode,
  combatPower: player.combatPower,
  score: player.score,
  hp: player.hp,
  atk: player.atk,
  def: player.def,
  critBp: player.critBp,
  hit: player.hit,
  spd: player.spd,
});

export const headToHeadToDto = (record: HeadToHead): HeadToHeadDto => ({
  viewerId: record.viewerId,
  opponentId: record.opponentId,
  wins: record.wins,
  losses: record.losses,
});

export const rosterPushToDto = (push: RosterPush): RosterSyncRequest => ({
  newPlayers: push.newPlayers.map(newPlayerToDto),
  editedPlayers: push.editedPlayers.map(playerEditToDto),
  headToHead: push.headToHead.map(headToHeadToDto),
});

/**
 * The response's `clientId` -> server id object, as a map of branded ids.
 *
 * A `Map` rather than the plain object the wire uses, because the caller looks rows up by a
 * `PlayerId` it is holding, and an object index signature cannot be keyed by a branded type
 * without widening it back to `string` at every call site.
 */
export const assignedIdsFromDto = (
  assigned: Readonly<Record<string, string>>,
): ReadonlyMap<PlayerId, PlayerId> =>
  new Map(
    Object.entries(assigned).map(([clientId, serverId]) => [
      asPlayerId(clientId),
      asPlayerId(serverId),
    ]),
  );
