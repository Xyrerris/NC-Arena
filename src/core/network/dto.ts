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

/**
 * `POST /v1/accounts`'s response — the first call a device ever makes (ADR-0035, decision 2).
 *
 * Neither secret is given a shape beyond "a non-empty string". They are opaque to this
 * client: the server mints them as 256 bits of base64url (`backend/src/auth/token.ts`) and
 * may change how, and a client that pinned the format would start rejecting valid keys the
 * day it did. What is worth asserting is that they are *there*, because a response missing
 * one would otherwise be stored as `undefined` and every later request would go out
 * unauthenticated with nothing saying why.
 */
export const createAccountResponseSchema = z.object({
  accountId: z.uuid(),
  apiKey: z.string().min(1),
  recoveryCode: z.string().min(1),
});
export type CreateAccountResponseDto = z.infer<typeof createAccountResponseSchema>;

/** `POST /v1/accounts/link`'s request body. */
export const linkAccountRequestSchema = z.object({
  recoveryCode: z.string().min(1),
});
export type LinkAccountRequestDto = z.infer<typeof linkAccountRequestSchema>;

/** `POST /v1/accounts/link`'s response. No recovery code: linking does not mint a second one. */
export const linkAccountResponseSchema = z.object({
  accountId: z.uuid(),
  apiKey: z.string().min(1),
});
export type LinkAccountResponseDto = z.infer<typeof linkAccountResponseSchema>;

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

/**
 * A player this device created and has never pushed. No `id` and no `rank`: the server assigns
 * both, which is the same rule `PlayerDraft` states locally (core/model) — whoever stores the
 * row owns its identity and its place in the ladder.
 *
 * `clientId` is this device's own key for the row. `RosterPush` (core/common) sends the local
 * `PlayerId` as that key, and the sync response maps it back to the server id in the same round
 * trip, which is what lets `origin` flip LOCAL -> REMOTE without a second request.
 */
export const newPlayerDtoSchema = playerDtoSchema.omit({ id: true, rank: true }).extend({
  clientId: z.string().min(1).max(64),
});
export type NewPlayerDto = z.infer<typeof newPlayerDtoSchema>;

/** An edit to a row the server already owns. `id` is a server id, never a `clientId`. */
export const playerEditDtoSchema = playerDtoSchema.omit({ rank: true });
export type PlayerEditDto = z.infer<typeof playerEditDtoSchema>;

/**
 * `POST /v1/roster/sync`'s request body.
 *
 * The caps mirror the server's (`backend/src/schemas/roster.ts`), and the request is parsed
 * against this schema **before** it is sent. That is not belt-and-braces: a body the server
 * would refuse comes back as `VALIDATION_ERROR` with whatever message Fastify composed, after
 * a round trip, while the same refusal here names the field and costs nothing. It is also
 * where §2.1 is enforced on the way *out* — `safeStat` is the same schema either direction, so
 * a stat that could not survive the wire is caught before it is written to it.
 */
export const rosterSyncRequestSchema = z.object({
  newPlayers: z.array(newPlayerDtoSchema).max(500),
  editedPlayers: z.array(playerEditDtoSchema).max(500),
  headToHead: z.array(headToHeadDtoSchema).max(2000),
});
export type RosterSyncRequest = z.infer<typeof rosterSyncRequestSchema>;

/** `POST /v1/roster/sync`'s response: the fresh snapshot, plus the id map `newPlayers` needed. */
export const rosterSyncResponseSchema = z.object({
  snapshot: rosterSnapshotDtoSchema,
  /** `clientId` -> the server id it was assigned. */
  assignedIds: z.record(z.string(), z.uuid()),
});
export type RosterSyncResponse = z.infer<typeof rosterSyncResponseSchema>;

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
