/**
 * The port behind ADR-0035's two account endpoints — `POST /v1/accounts` and
 * `POST /v1/accounts/link` (decision 2).
 *
 * It sits beside `RosterSource` for the same reason that one does: `core/network`
 * implements it, §4 forbids `core/network` from importing `core/data`, so the contract has
 * to live where both can see it. Keeping it here is also what lets the setup screen be
 * driven in a test with no server — the same seam `BackupFile` gives the backup controls.
 *
 * **This is identification, not authentication** (ADR-0035, decision 2). There is no
 * password, no email and no login: creating an account mints a pair of secrets, and the
 * recovery code is the only thing that ever proves a second device belongs to the same
 * roster. Nothing here can recover one that was not written down.
 */

import type { Result } from './result';

/**
 * What `POST /v1/accounts` mints. Both secrets are returned **exactly once** — the server
 * stores only their hashes (`backend/src/auth/token.ts`), so no later request can ask for
 * them again.
 */
export interface AccountCredentials {
  accountId: string;
  /** This device's bearer token. Stored; never shown again after the screen that shows it. */
  apiKey: string;
  /**
   * The only way a second device ever joins this account, and the only way *this* one
   * rejoins it after the app's data is cleared. Nothing backs it up.
   */
  recoveryCode: string;
}

/** What `POST /v1/accounts/link` returns: a fresh key for this device on an existing account. */
export interface LinkedAccount {
  accountId: string;
  apiKey: string;
}

/**
 * Why an attempt failed, in the three cases the setup screen has different sentences for.
 *
 * It is deliberately not `NetworkError` (core/network): that taxonomy is the wire's, this
 * one is the screen's, and §4 forbids `core/common` from importing `core/network` anyway.
 * Three cases rather than six because the screen can only offer two remedies — fix the code
 * you typed, or try again later — and a fourth code with no distinct remedy behind it is a
 * distinction the user cannot act on.
 */
export type AccountFailure =
  /** The recovery code is not one the server knows. Only `linkAccount` can produce it. */
  | 'UNRECOGNISED'
  /** `fetch` never reached the server. Worth retrying unchanged. */
  | 'OFFLINE'
  /** Anything else — a 500, a proxy's HTML, a response that did not match the contract. */
  | 'FAILED';

export interface AccountError {
  readonly reason: AccountFailure;
  readonly message: string;
}

export interface AccountGateway {
  /** Identifies the gateway in the failure surfaced to the user, like `RosterSource.name`. */
  readonly name: string;
  createAccount(): Promise<Result<AccountCredentials, AccountError>>;
  /**
   * Pairs this device to the account that recovery code belongs to, minting it a key of its
   * own. The existing device keeps working — a link adds a key, it does not move one.
   */
  linkAccount(recoveryCode: string): Promise<Result<LinkedAccount, AccountError>>;
}
