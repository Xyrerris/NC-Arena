/**
 * A thin `fetch` wrapper. It knows the bearer-token header and the ADR-0035 error envelope; it
 * knows nothing about the roster, which is what keeps `remoteRosterSource.ts` the only file that
 * has to change if a second resource is ever added.
 *
 * `baseUrl` and `apiKey` are constructor arguments rather than module-level config: `core/data`
 * is the only layer allowed to read `core/prefs` (ARCHITECTURE.md §4), so it is also the only
 * layer that can hand this client a token — this module has no way to fetch one itself, by the
 * same boundary that keeps it from importing `core/data`.
 *
 * The token may be given as a function, and on a device it is. A device acquires its key part
 * way through a run — it has none until the user has created an account or entered a recovery
 * code (ADR-0035, decision 2) — so a key read once at construction would be the key the app
 * started with, and the client would go on sending nothing long after pairing succeeded. A
 * plain string is still accepted, because a test that holds one fixed has no such problem.
 */

import { err, ok, type Result } from '../common';
import { offlineError, parseApiError, type NetworkError } from './errors';

/** A fixed token, or a way to read whichever one is current. */
export type ApiKeySource = string | null | (() => string | null);

export class HttpClient {
  private readonly readApiKey: () => string | null;

  constructor(
    private readonly baseUrl: string,
    apiKey: ApiKeySource,
  ) {
    this.readApiKey = typeof apiKey === 'function' ? apiKey : () => apiKey;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<Result<T, NetworkError>> {
    const apiKey = this.readApiKey();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...init.headers,
        },
      });
    } catch (cause) {
      return err(offlineError(cause));
    }

    if (!response.ok) {
      return err(await parseApiError(response));
    }

    try {
      return ok((await response.json()) as T);
    } catch {
      return err({
        code: 'MALFORMED_RESPONSE',
        message: `HTTP ${response.status}: invalid JSON body`,
      });
    }
  }
}
