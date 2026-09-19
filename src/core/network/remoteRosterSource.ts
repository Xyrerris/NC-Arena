/**
 * ADR-0035's two directions over HTTP: a `RosterSource` backed by `GET /v1/roster`, and a
 * `RosterSink` backed by `POST /v1/roster/sync`. This is the seam ARCHITECTURE.md §7 describes
 * — `core/data`'s repository takes the ports, and swapping this implementation in is meant to
 * be the whole of what Phase 5 changes above this module.
 *
 * Nothing here is wired into `arenaRepository` yet: when a push fires, and what the roster
 * screen shows while one is in flight, are the product decisions ADR-0035 leaves open, and they
 * belong to the caller rather than to the transport.
 */

import {
  err,
  ok,
  type Result,
  type RosterPush,
  type RosterPushResult,
  type RosterSink,
  type RosterSnapshot,
  type RosterSource,
} from '../common';
import type { PlayerId } from '../model';
import { rosterSnapshotDtoSchema, rosterSyncRequestSchema, rosterSyncResponseSchema } from './dto';
import type { RosterSnapshotDto } from './dto';
import { HttpClient, type ApiKeySource } from './httpClient';
import { assignedIdsFromDto, rosterPushToDto, rosterSnapshotFromDto } from './mappers';

export class RemoteRosterSource implements RosterSource, RosterSink {
  readonly name = 'backend';
  private readonly client: HttpClient;

  constructor(baseUrl: string, apiKey: ApiKeySource) {
    this.client = new HttpClient(baseUrl, apiKey);
  }

  async fetchRoster(): Promise<Result<RosterSnapshot>> {
    const response = await this.client.request<unknown>('/v1/roster');
    if (!response.ok) {
      return err(this.failure(`${response.error.code} — ${response.error.message}`));
    }

    const parsed = rosterSnapshotDtoSchema.safeParse(response.value);
    if (!parsed.success) {
      return err(this.failure(`response did not match the contract — ${parsed.error.message}`));
    }

    const snapshot = this.toSnapshot(parsed.data);
    if (snapshot === null) {
      // An account with no viewer chosen yet has nothing for RosterSnapshot.viewerId to carry
      // (core/common/rosterSource.ts requires one). This is the honest failure rather than a
      // fabricated id: the roster screen degrades exactly as it already does with no viewer
      // (ADR-0022), and PUT /v1/me/viewer is what resolves it. A *pull* can fail here for free
      // — it changed nothing — which is why `pushRoster` treats the same state differently.
      return err(this.failure('no viewer set for this account yet (PUT /v1/me/viewer)'));
    }

    return ok(snapshot);
  }

  async pushRoster(push: RosterPush): Promise<Result<RosterPushResult>> {
    // The outgoing body is parsed against the same contract the server enforces, before it is
    // sent (see `rosterSyncRequestSchema`). A push that cannot be represented is a bug here,
    // not a round trip the user waits on to be told so.
    const body = rosterSyncRequestSchema.safeParse(rosterPushToDto(push));
    if (!body.success) {
      return err(this.failure(`request does not match the contract — ${body.error.message}`));
    }

    const response = await this.client.request<unknown>('/v1/roster/sync', {
      method: 'POST',
      body: JSON.stringify(body.data),
    });
    if (!response.ok) {
      return err(this.failure(`${response.error.code} — ${response.error.message}`));
    }

    const parsed = rosterSyncResponseSchema.safeParse(response.value);
    if (!parsed.success) {
      return err(this.failure(`response did not match the contract — ${parsed.error.message}`));
    }

    // `snapshot` may be null here where `fetchRoster` refuses: by this point the rows have
    // already been applied server-side, and `assignedIds` is the only record of which local row
    // became which server row. See `RosterPushResult` for why throwing that away would be worse
    // than returning a snapshot the caller has nothing to do with.
    return ok({
      snapshot: this.toSnapshot(parsed.data.snapshot),
      assignedIds: assignedIdsFromDto(parsed.data.assignedIds),
    });
  }

  async setViewer(playerId: PlayerId): Promise<Result<void>> {
    const response = await this.client.request<unknown>('/v1/me/viewer', {
      method: 'PUT',
      body: JSON.stringify({ playerId }),
    });
    if (!response.ok) {
      return err(this.failure(`${response.error.code} — ${response.error.message}`));
    }
    // The response echoes the id back. Nothing here reads it: the caller passed it in, and a
    // server that answered with a different one would be a contract violation this method has
    // no better answer for than the next pull, which reads the viewer from the snapshot.
    return ok(undefined);
  }

  /** The snapshot, or null when the account has not said which player is the viewer yet. */
  private toSnapshot(dto: RosterSnapshotDto): RosterSnapshot | null {
    return dto.viewerId === null ? null : rosterSnapshotFromDto({ ...dto, viewerId: dto.viewerId });
  }

  private failure(reason: string): Error {
    return new Error(`${this.name}: ${reason}`);
  }
}
