/**
 * What the setup gate says, in one place (ADR-0035, decision 2).
 *
 * Pure: no React, no repository, no network. The sentences are the whole product on this
 * screen — it is the first thing a new install shows, it asks for something most users have
 * never heard of, and it displays a secret that can never be shown again — so they are
 * values a test can assert rather than strings inlined in JSX, the same contract every other
 * `*UiState` in the app follows (ARCHITECTURE.md §8).
 */

import type { AccountFailure } from '@/core/common';

export const TITLE = 'This ladder needs an account';

/**
 * Why a screen nobody asked for is standing in front of the roster. It says what an account
 * is *for* rather than asking the user to trust it: there is no email and no password here,
 * so "account" is the wrong word in every way except the one that matters.
 */
export const INTRO =
  'Your roster is stored on the server so it can follow you to another device. There is no ' +
  'email and no password — an account is just a key this device keeps.';

export const CODE_LABEL = 'Recovery code';

export const CODE_HINT =
  'Already set this up on another device? Enter its recovery code. Otherwise leave this ' +
  'empty and a new account will be created.';

export const CREATE_LABEL = 'Create an account';
export const LINK_LABEL = 'Link this device';

/**
 * One action, two labels, because there is one decision: the field is either filled in or it
 * is not (the owner's decision 3). A screen with two buttons would ask the user to choose
 * again something they have already said by typing or not typing, and would have to answer
 * "what happens if I press Create with a code in the box?" — a question this shape cannot
 * pose.
 */
export const actionLabel = (code: string): string =>
  code.trim() === '' ? CREATE_LABEL : LINK_LABEL;

/** The failures, as sentences. One per `AccountFailure`, so the switch below stays total. */
export const failureMessage = (reason: AccountFailure): string => {
  switch (reason) {
    case 'UNRECOGNISED':
      return 'That recovery code was not recognised. It is long, and every character counts — check it for a typo, or leave it empty to start a new roster instead.';
    case 'OFFLINE':
      return 'This device could not reach the server. Check your connection and try again — nothing has been created yet.';
    case 'FAILED':
      return 'The server could not finish that just now. Try again in a moment.';
  }
};

export const SECRETS_TITLE = 'Write this down before you continue';

/**
 * The warning. It is blunt on purpose and it names all three consequences, because every one
 * of them is permanent and none is obvious: the server keeps only hashes of both secrets
 * (`backend/src/auth/token.ts`), so nothing can reissue them, and nothing backs up the
 * database they belong to.
 */
export const SECRETS_WARNING =
  'This is the only time either of these is shown. The recovery code is the only way to add ' +
  'a second device, or to get this roster back if this app is uninstalled or its data is ' +
  'cleared. Nothing on the server can send it to you again.';

export const RECOVERY_CODE_LABEL = 'Recovery code — keep this';
export const API_KEY_LABEL = 'API key — already stored on this device';

/**
 * Said under the key, because showing somebody a secret they do not have to act on invites
 * them to act on it. The recovery code is the one to copy; this one is here for the record.
 */
export const API_KEY_NOTE = 'You do not need to keep this one. It is saved here already.';

export const CONTINUE_LABEL = 'I have written it down';

/** The state of one attempt at pairing this device. */
export type AccountSetupUiState =
  /** The form. `error` is the last refusal, and it survives until the next attempt. */
  | { kind: 'asking'; error: string | null }
  /** A request is in flight. Both actions block, because neither can be run twice. */
  | { kind: 'working' }
  /**
   * An account was just minted, and its secrets are on screen. There is no way back to this
   * state — not by navigating, not by relaunching — which is why the gate does not close
   * itself when the key is stored.
   */
  | { kind: 'created'; apiKey: string; recoveryCode: string };
