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
 *
 * **Every request has a deadline.** React Native's `fetch` has none of its own, so on a network
 * that accepts the connection and then never answers — a captive portal, a Wi-Fi with no
 * uplink — a request would simply never settle. Airplane mode is not the problem: there `fetch`
 * rejects at once. The hang is worse than a failure because the sync is one TanStack scope: a
 * request that never ends holds the badge spinning and queues every later pull-to-refresh and
 * background run behind it. The deadline covers the body as well as the headers, since a
 * server can stall mid-response just as well, and it ends as `OFFLINE` — from the user's side a
 * server that does not answer and one that cannot be reached are the same thing, and the
 * account setup screen already has the words for it.
 */

import { err, ok, type Result } from '../common';
import { offlineError, parseApiError, timeoutError, type NetworkError } from './errors';

/** A fixed token, or a way to read whichever one is current. */
export type ApiKeySource = string | null | (() => string | null);

/**
 * Long enough for a cold VPS and a slow mobile link to answer a full push, short enough that a
 * pull-to-refresh on a dead network reports back while the user is still looking at it.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

export interface HttpClientOptions {
  timeoutMs?: number;
}

export class HttpClient {
  private readonly readApiKey: () => string | null;
  private readonly timeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    apiKey: ApiKeySource,
    options: HttpClientOptions = {},
  ) {
    this.readApiKey = typeof apiKey === 'function' ? apiKey : () => apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<Result<T, NetworkError>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced rather than trusted to the abort alone: aborting is what frees the socket, but the
    // deadline must hold even for a `fetch` that ignores its signal. The timeout result settles
    // in the same tick as the abort, so it wins the race over the rejection the abort causes.
    const expired = new Promise<Result<T, NetworkError>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(err(timeoutError(this.timeoutMs)));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.send<T>(path, init, controller.signal), expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async send<T>(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Result<T, NetworkError>> {
    const apiKey = this.readApiKey();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal,
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
