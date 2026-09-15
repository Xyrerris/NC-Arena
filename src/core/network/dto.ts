/**
 * Wire schemas for the backend's contract (`backend/openapi.yaml`, ADR-0035). Mirrored, not
 * shared: `backend/src/schemas/player.ts` describes the same shapes for the server side of the
 * same wire, and no module may cross the `backend/` <-> `src/` boundary in either direction.
 *
 * Every stat field is `.int().safe()` — Zod's `safe()` is `Number.isSafeInteger`, which is the
 * whole §2.1 defence stated as a schema. A value the server sends above 2^53 fails to parse
 * rather than arriving silently rounded; `remoteRosterSource.ts` turns that parse failure into
 * the same `Result` failure a network error produces, so a caller sees one failure shape either
 * way.
 */

import { z } from 'zod';

const safeStat = z.number().int().safe().nonnegative();

export const playerDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(64),
  level: z.number().int().nonnegative(),
  gameCode: z.string().max(16),
  rank: z.number().int().positive(),
  combatPower: safeStat,
  score: safeStat,
  hp: safeStat,
  atk: safeStat,
  def: safeStat,
  critBp: safeStat,
  hit: safeStat,
  spd: safeStat,
});
export type PlayerDto = z.infer<typeof playerDtoSchema>;

export const headToHeadDtoSchema = z.object({
  viewerId: z.uuid(),
  opponentId: z.uuid(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});
export type HeadToHeadDto = z.infer<typeof headToHeadDtoSchema>;

/** `GET /v1/roster`'s response body. */
export const rosterSnapshotDtoSchema = z.object({
  season: z.number().int().positive(),
  viewerId: z.uuid().nullable(),
  players: z.array(playerDtoSchema),
  headToHead: z.array(headToHeadDtoSchema),
});
export type RosterSnapshotDto = z.infer<typeof rosterSnapshotDtoSchema>;

/** The closed error taxonomy every failed response carries (ADR-0035, decision 4). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'INTERNAL',
    ]),
    message: z.string(),
  }),
});
export type ApiErrorDto = z.infer<typeof apiErrorSchema>;
