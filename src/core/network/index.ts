/**
 * Network boundary (ADR-0035). The pull half of Phase 5's backend integration: DTO schemas
 * validated against `backend/openapi.yaml`'s contract, an error taxonomy shared with the
 * server, domain mappers, and `RemoteRosterSource` implementing the `RosterSource` port from
 * `core/common`.
 *
 * Every stat field's schema carries `.int().safe()` (`Number.isSafeInteger`). That check is
 * the whole §2.1 defence on this platform: TypeScript's `number` cannot express "integral and
 * below 2^53", so the check has to be executable. Above that ceiling a server's JSON response
 * would lose precision silently if this module trusted it unchecked.
 *
 * The push direction (`POST /v1/roster/sync`, the `LOCAL` -> `REMOTE` origin transition) and
 * wiring `RemoteRosterSource` into `arenaRepository`/`useRoster` are not here yet — see
 * ADR-0035's "Consequences" for what remains of Phase 5.
 */

export {
  apiErrorSchema,
  headToHeadDtoSchema,
  playerDtoSchema,
  rosterSnapshotDtoSchema,
} from './dto';
export type { ApiErrorDto, HeadToHeadDto, PlayerDto, RosterSnapshotDto } from './dto';

export { offlineError, parseApiError } from './errors';
export type { NetworkError, NetworkErrorCode } from './errors';

export { headToHeadFromDto, playerFromDto, rosterSnapshotFromDto } from './mappers';

export { HttpClient } from './httpClient';

export { RemoteRosterSource } from './remoteRosterSource';
