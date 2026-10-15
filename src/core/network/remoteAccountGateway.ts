/**
 * `AccountGateway` over HTTP: `POST /v1/accounts` and `POST /v1/accounts/link` (ADR-0035,
 * decision 2).
 *
 * Its own client, constructed with a **null key**, and that is the point rather than an
 * oversight: these are the only two endpoints in the contract with `security: []`, because
 * they are how a device that has no key gets one. Sharing `RemoteRosterSource`'s client
 * would mean sending whatever key is currently stored — which during setup is `null`, and
 * after a failed link is a key belonging to a different account.
 */

import {
  err,
  ok,
  type AccountCredentials,
  type AccountError,
  type AccountGateway,
  type LinkedAccount,
  type Result,
} from '../common';
import {
  createAccountResponseSchema,
  linkAccountRequestSchema,
  linkAccountResponseSchema,
} from './dto';
import type { NetworkError } from './errors';
import { HttpClient } from './httpClient';

export class RemoteAccountGateway implements AccountGateway {
  readonly name = 'backend';
  private readonly client: HttpClient;

  constructor(baseUrl: string) {
    this.client = new HttpClient(baseUrl, null);
  }

  async createAccount(): Promise<Result<AccountCredentials, AccountError>> {
    // `{}` rather than no body at all. `HttpClient` always sends `Content-Type:
    // application/json`, and Fastify refuses that header with an empty body
    // (FST_ERR_CTP_EMPTY_JSON_BODY) before the route is ever reached — a 400 on the one
    // call that cannot be retried into success. The route declares no body schema and
    // ignores what it is given, so an empty object satisfies the parser and nothing else.
    const response = await this.client.request<unknown>('/v1/accounts', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!response.ok) return err(this.failure(response.error));

    const parsed = createAccountResponseSchema.safeParse(response.value);
    if (!parsed.success) {
      return err({
        reason: 'FAILED',
        message: `${this.name}: the account response did not match the contract.`,
      });
    }
    return ok(parsed.data);
  }

  async linkAccount(recoveryCode: string): Promise<Result<LinkedAccount, AccountError>> {
    // Checked here rather than round-tripped, like `pushRoster`'s body: an empty code is a
    // `VALIDATION_ERROR` the server would take a request to report, and "FAILED" is the
    // wrong sentence for it — the user typed nothing, which is the same remedy as typing
    // it wrong.
    const body = linkAccountRequestSchema.safeParse({ recoveryCode });
    if (!body.success) {
      return err({ reason: 'UNRECOGNISED', message: `${this.name}: no recovery code was given.` });
    }

    const response = await this.client.request<unknown>('/v1/accounts/link', {
      method: 'POST',
      body: JSON.stringify(body.data),
    });
    if (!response.ok) {
      // NOT_FOUND is the contract's answer to a code no account has (`backend/src/routes/
      // accounts.ts`), and it is the one failure here the user can actually fix. It means
      // that only on *this* call: a 404 from `createAccount` is a wrong base URL, which is
      // not something retyping anything will solve.
      return err(
        response.error.code === 'NOT_FOUND'
          ? { reason: 'UNRECOGNISED', message: `${this.name}: that recovery code was not found.` }
          : this.failure(response.error),
      );
    }

    const parsed = linkAccountResponseSchema.safeParse(response.value);
    if (!parsed.success) {
      return err({
        reason: 'FAILED',
        message: `${this.name}: the link response did not match the contract.`,
      });
    }
    return ok(parsed.data);
  }

  private failure(error: NetworkError): AccountError {
    return {
      reason: error.code === 'OFFLINE' ? 'OFFLINE' : 'FAILED',
      message: `${this.name}: ${error.code} — ${error.message}`,
    };
  }
}
