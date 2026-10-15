/**
 * DTO schemas for the wire. Mirrored on the client in `src/core/network/dto.ts` — the two are
 * not the same file (no module may cross the `backend/` ↔ `src/` boundary, ADR-0035), but they
 * are meant to be read side by side, and a field added here without its twin there is a bug.
 *
 * Every stat is `.int().safe()` — Zod's `safe()` is exactly `Number.isSafeInteger`, which is
 * the whole §2.1 defence stated as a schema rather than as a runtime `if`.
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
  /** Percent x 10_000 — the same `critBp` unit as `core/model`, never a float (§2.2). */
  critBp: safeStat,
  hit: safeStat,
  spd: safeStat,
});
export type PlayerDto = z.infer<typeof playerDtoSchema>;

/**
 * A player this device has never pushed before. No `id` — the server assigns one — and no
 * `rank`, for the same reason `PlayerDraft` drops both on the client (core/model): whoever
 * stores the row owns both fields, and a client that could set either is how the rank
 * contiguity invariant gets broken from the other end of the wire.
 *
 * `clientId` is how `POST /v1/roster/sync`'s response tells the client which server id belongs
 * to which locally-entered row, in the same request that created it (ADR-0035, decision 3).
 */
export const newPlayerDtoSchema = playerDtoSchema.omit({ id: true, rank: true }).extend({
  clientId: z.string().min(1).max(64),
});
export type NewPlayerDto = z.infer<typeof newPlayerDtoSchema>;

/**
 * An edit to a row the server already has. `id` is required and is not the `clientId` of
 * anything — it is the id a previous sync's response already handed back.
 */
export const playerEditDtoSchema = playerDtoSchema.omit({ rank: true });
export type PlayerEditDto = z.infer<typeof playerEditDtoSchema>;

export const headToHeadDtoSchema = z.object({
  viewerId: z.uuid(),
  opponentId: z.uuid(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});
export type HeadToHeadDto = z.infer<typeof headToHeadDtoSchema>;
