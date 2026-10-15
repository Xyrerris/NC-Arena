import { z } from 'zod';

import {
  headToHeadDtoSchema,
  newPlayerDtoSchema,
  playerDtoSchema,
  playerEditDtoSchema,
} from './player.js';

/** `GET /v1/roster`'s response — the wire shape of `RosterSnapshot` (ARCHITECTURE.md §7). */
export const rosterSnapshotDtoSchema = z.object({
  season: z.number().int().positive(),
  viewerId: z.uuid().nullable(),
  players: z.array(playerDtoSchema),
  headToHead: z.array(headToHeadDtoSchema),
});
export type RosterSnapshotDto = z.infer<typeof rosterSnapshotDtoSchema>;

/** `POST /v1/roster/sync`'s request body. */
export const rosterSyncRequestSchema = z.object({
  newPlayers: z.array(newPlayerDtoSchema).max(500),
  editedPlayers: z.array(playerEditDtoSchema).max(500),
  headToHead: z.array(headToHeadDtoSchema).max(2000),
  /** Server ids removed on the device (ADR-0039). Defaulted, so an older client still parses. */
  deletedPlayers: z.array(z.uuid()).max(500).default([]),
});
export type RosterSyncRequest = z.infer<typeof rosterSyncRequestSchema>;

/** `POST /v1/roster/sync`'s response: the fresh snapshot, plus the id map `newPlayers` needed. */
export const rosterSyncResponseSchema = z.object({
  snapshot: rosterSnapshotDtoSchema,
  /** `clientId` -> the server id it was assigned. */
  assignedIds: z.record(z.string(), z.uuid()),
});
export type RosterSyncResponse = z.infer<typeof rosterSyncResponseSchema>;

export const setViewerRequestSchema = z.object({ playerId: z.uuid() });
export type SetViewerRequest = z.infer<typeof setViewerRequestSchema>;

/** The planets Nine Chronicles runs on, as 9CAPI and Mimir name them (ADR-0044). */
export const planetSchema = z.enum(['odin', 'heimdall', 'thor']);
export type Planet = z.infer<typeof planetSchema>;

/** An avatar address: `0x` and 40 hex digits, in either case. */
const avatarAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const avatarAddressMessage = 'An avatar address is 0x followed by 40 hex digits.';

/**
 * What the server stores and answers: the address already lower-cased. Kept free of
 * transforms because a response schema is also used to *encode*, and fastify-type-provider-zod
 * refuses a one-way transform there.
 */
export const viewerAvatarSchema = z.object({
  planet: planetSchema,
  address: z.string().regex(avatarAddressPattern, avatarAddressMessage),
});
export type ViewerAvatar = z.infer<typeof viewerAvatarSchema>;

/**
 * The request: the same shape, with the address lower-cased on the way in so the stored value
 * does not depend on whether it was pasted from a checksummed source.
 */
export const setViewerAvatarRequestSchema = z.object({
  planet: planetSchema,
  address: z
    .string()
    .regex(avatarAddressPattern, avatarAddressMessage)
    .transform((address) => address.toLowerCase()),
});
