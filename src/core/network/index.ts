/**
 * Network boundary (ADR-0035). Both halves of Phase 5's backend integration: DTO schemas
 * validated against `backend/openapi.yaml`'s contract, an error taxonomy shared with the
 * server, domain mappers in both directions, and `RemoteRosterSource` implementing the
 * `RosterSource` and `RosterSink` ports from `core/common`.
 *
 * Every stat field's schema carries `.int().safe()` (`Number.isSafeInteger`). That check is
 * the whole §2.1 defence on this platform: TypeScript's `number` cannot express "integral and
 * below 2^53", so the check has to be executable. Above that ceiling a server's JSON response
 * would lose precision silently if this module trusted it unchecked — and the same schema
 * guards the request body, so a value that could not survive the wire never reaches it.
 *
 * What is still open is the *wiring*: `arenaRepository`/`useRoster` do not call either port
 * yet, and the `LOCAL` -> `REMOTE` origin transition has nowhere to be applied until they do.
 * That, and the product decisions about when a push fires, is what remains of Phase 5 — see
 * ADR-0035's "Consequences".
 */

export {
  apiErrorSchema,
  headToHeadDtoSchema,
  newPlayerDtoSchema,
  playerDtoSchema,
  playerEditDtoSchema,
  rosterSnapshotDtoSchema,
  rosterSyncRequestSchema,
  rosterSyncResponseSchema,
} from './dto';
export type {
  ApiErrorDto,
  HeadToHeadDto,
  NewPlayerDto,
  PlayerDto,
  PlayerEditDto,
  RosterSnapshotDto,
  RosterSyncRequest,
  RosterSyncResponse,
} from './dto';

export { offlineError, parseApiError } from './errors';
export type { NetworkError, NetworkErrorCode } from './errors';

export {
  assignedIdsFromDto,
  headToHeadFromDto,
  headToHeadToDto,
  newPlayerToDto,
  playerEditToDto,
  playerFromDto,
  rosterPushToDto,
  rosterSnapshotFromDto,
} from './mappers';

export { HttpClient } from './httpClient';

export { RemoteRosterSource } from './remoteRosterSource';
