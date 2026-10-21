/**
 * The little both chain sources share: one GraphQL query posted to one endpoint, and the
 * envelope read back.
 *
 * It is not `RemoteRosterSource`'s world. These endpoints are public chain services — Mimir and a
 * Nine Chronicles node — not the app's backend, so there is no key to send and no ADR-0035 error
 * body to parse. What they share with the backend is only `HttpClient`'s deadline and its
 * offline/timeout handling, which is why this goes through it rather than calling `fetch`.
 *
 * **A GraphQL failure is HTTP 200.** Observed against both on 2026-10-01: a missing document, a
 * malformed address and a resolver exception all answer 200 with an `errors` array. So the caller
 * reads `errors`, not the status, and a non-2xx is a gateway or proxy talking, not the query.
 */

import { z } from 'zod';

import { err, ok, type Result } from '../common';
import type { NetworkError } from './errors';
import { HttpClient } from './httpClient';

const envelopeSchema = z.object({
  data: z.unknown().nullish(),
  errors: z
    .array(z.object({ message: z.string(), path: z.array(z.unknown()).optional() }))
    .optional(),
});

export interface GraphqlEnvelope {
  readonly data: unknown;
  readonly errors: readonly { readonly message: string; readonly path?: readonly unknown[] }[];
}

/**
 * A transport failure as the screens' two-reason taxonomy: unreachable or out of time is
 * `OFFLINE`, anything else is `FAILED`. The shape is shared by `CollectionError` and
 * `AvatarError`, which is why a structural return type serves both.
 */
export const networkFailure = (
  source: string,
  error: NetworkError,
): { reason: 'OFFLINE' | 'FAILED'; message: string } => ({
  reason: error.code === 'OFFLINE' ? 'OFFLINE' : 'FAILED',
  message: `${source}: ${error.code} — ${error.message}`,
});

/**
 * A deadline per node when there is another to fall back to: a dead one (observed 2026-10-21:
 * `heimdall-rpc-1` timed out, then answered 502) should cost seconds, not the full 20.
 */
export const FAILOVER_TIMEOUT_MS = 10_000;

async function postOne(
  endpoint: string,
  query: string,
  timeoutMs?: number,
): Promise<Result<GraphqlEnvelope, NetworkError>> {
  // The endpoint is the whole URL, so the request path is empty.
  const response = await new HttpClient(endpoint, null, { timeoutMs }).request<unknown>('', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  if (!response.ok) return err(response.error);

  const parsed = envelopeSchema.safeParse(response.value);
  if (!parsed.success) {
    return err({ code: 'MALFORMED_RESPONSE', message: 'the answer was not a GraphQL response' });
  }
  return ok({ data: parsed.data.data ?? null, errors: parsed.data.errors ?? [] });
}

/**
 * Posts to one endpoint, or to a list of them in order. Only a **transport** failure moves on to
 * the next node — unreachable, out of time, a non-2xx from a gateway, an answer that is not
 * GraphQL. A GraphQL `errors` array is the query's own answer and is returned as it is: another
 * node would only say the same. When every node fails, the last failure is returned.
 */
export async function postGraphql(
  endpoint: string | readonly string[],
  query: string,
): Promise<Result<GraphqlEnvelope, NetworkError>> {
  const list = typeof endpoint === 'string' ? [endpoint] : endpoint;
  const timeoutMs = list.length > 1 ? FAILOVER_TIMEOUT_MS : undefined;

  let last: Result<GraphqlEnvelope, NetworkError> = err({
    code: 'OFFLINE',
    message: 'no endpoint is configured',
  });
  for (const url of list) {
    last = await postOne(url, query, timeoutMs);
    if (last.ok) return last;
  }
  return last;
}
