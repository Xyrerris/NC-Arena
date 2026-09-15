/**
 * A thin `fetch` wrapper. It knows the bearer-token header and the ADR-0035 error envelope; it
 * knows nothing about the roster, which is what keeps `remoteRosterSource.ts` the only file that
 * has to change if a second resource is ever added.
 *
 * `baseUrl` and `apiKey` are constructor arguments rather than module-level config: `core/data`
 * is the only layer allowed to read `core/prefs` (ARCHITECTURE.md §4), so it is also the only
 * layer that can hand this client a token — this module has no way to fetch one itself, by the
 * same boundary that keeps it from importing `core/data`.
 */

import { err, ok, type Result } from '../common';
import { offlineError, parseApiError, type NetworkError } from './errors';

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<Result<T, NetworkError>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
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
