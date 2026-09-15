/**
 * Secret generation and hashing (ADR-0035, decision 2).
 *
 * Both the API key and the recovery code are 256 bits of `crypto.randomBytes`, base64url-
 * encoded — the same amount of entropy either way, because neither is meant to be memorised;
 * the recovery code is typed once, into a second device, immediately after it is shown. What
 * is stored is a SHA-256 hex digest of the secret, never the secret itself, so a leaked
 * `accounts` table hands out nothing live. A per-secret salt is not added on top: the input is
 * already a uniformly random 256-bit value from a CSPRNG, which is what a salt exists to
 * simulate for a *human-chosen* secret like a password — there is no dictionary to widen here.
 */

import { createHash, randomBytes } from 'node:crypto';

export const generateSecret = (): string => randomBytes(32).toString('base64url');

export const hashSecret = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');
