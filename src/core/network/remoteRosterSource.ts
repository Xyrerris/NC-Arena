/**
 * The pull half of ADR-0035: a `RosterSource` (`core/common`) backed by `GET /v1/roster`. This
 * is the seam ARCHITECTURE.md §7 describes — `core/data`'s repository takes a `RosterSource`
 * optionally, and swapping this one in is meant to be the whole of what Phase 5 changes above
 * this module. Nothing here is wired into `arenaRepository` yet; that wiring, and the push
 * direction (`POST /v1/roster/sync`), are the remaining Phase 5 work ADR-0035 leaves open.
 */

import { err, ok, type Result, type RosterSnapshot, type RosterSource } from '../common';
import { rosterSnapshotDtoSchema } from './dto';
import { HttpClient } from './httpClient';
import { rosterSnapshotFromDto } from './mappers';

export class RemoteRosterSource implements RosterSource {
  readonly name = 'backend';
  private readonly client: HttpClient;

  constructor(baseUrl: string, apiKey: string) {
    this.client = new HttpClient(baseUrl, apiKey);
  }

  async fetchRoster(): Promise<Result<RosterSnapshot>> {
    const response = await this.client.request<unknown>('/v1/roster');
    if (!response.ok) {
      return err(new Error(`${this.name}: ${response.error.code} — ${response.error.message}`));
    }

    const parsed = rosterSnapshotDtoSchema.safeParse(response.value);
    if (!parsed.success) {
      return err(
        new Error(`${this.name}: response did not match the contract — ${parsed.error.message}`),
      );
    }

    if (!parsed.data.viewerId) {
      // An account with no viewer chosen yet has nothing for RosterSnapshot.viewerId to carry
      // (core/common/rosterSource.ts requires one). This is the honest failure rather than a
      // fabricated id: the roster screen degrades exactly as it already does with no viewer
      // (ADR-0022), and PUT /v1/me/viewer is what resolves it.
      return err(new Error(`${this.name}: no viewer set for this account yet (PUT /v1/me/viewer)`));
    }

    return ok(rosterSnapshotFromDto({ ...parsed.data, viewerId: parsed.data.viewerId }));
  }
}
