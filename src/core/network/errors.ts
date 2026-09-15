/**
 * The client-side half of ADR-0035's error taxonomy (decision 4). A caller reads `code`, never
 * an HTTP status: the status is transport, the code is the contract, and the taxonomy is
 * deliberately small enough that a `switch` over it can be exhaustive.
 */

import { apiErrorSchema, type ApiErrorDto } from './dto';

export type NetworkErrorCode =
  | ApiErrorDto['error']['code']
  /** The response body was not `{ error: { code, message } }` at all — not a contract failure. */
  | 'MALFORMED_RESPONSE'
  /** `fetch` itself rejected — offline, DNS, TLS, a dropped connection. */
  | 'OFFLINE';

export interface NetworkError {
  readonly code: NetworkErrorCode;
  readonly message: string;
}

export const offlineError = (cause: unknown): NetworkError => ({
  code: 'OFFLINE',
  message: cause instanceof Error ? cause.message : 'The network request failed.',
});

/**
 * Reads a failed response's body against the taxonomy. A body that does not match it — a proxy's
 * HTML error page, a truncated response — becomes `MALFORMED_RESPONSE` rather than throwing,
 * because a caller already has to handle "the network failed"; a response that failed to say
 * *how* it failed is the same class of problem, not a new one.
 */
export const parseApiError = async (response: Response): Promise<NetworkError> => {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { code: 'MALFORMED_RESPONSE', message: `HTTP ${response.status}` };
  }

  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) {
    return { code: 'MALFORMED_RESPONSE', message: `HTTP ${response.status}` };
  }
  return { code: parsed.data.error.code, message: parsed.data.error.message };
};
