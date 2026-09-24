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
