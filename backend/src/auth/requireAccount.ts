/**
 * Resolves the `Authorization: Bearer <key>` header on every request under `/v1/roster` and
 * `/v1/me` to the account it belongs to. There is no session and no cookie: the header is
 * checked, hashed, and looked up on every call, which is what a bearer token is for.
 */

import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';

import { unauthorized } from '../domain/errors.js';
import { db } from '../db/client.js';
import { accounts, apiKeys } from '../db/schema.js';
import { hashSecret } from './token.js';

export interface AuthedAccount {
  id: string;
  viewerId: string | null;
  season: number;
}

export const requireAccount = async (req: FastifyRequest): Promise<AuthedAccount> => {
  const header = req.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  if (!key) {
    throw unauthorized();
  }

  const [row] = await db
    .select({ id: accounts.id, viewerId: accounts.viewerId, season: accounts.season })
    .from(apiKeys)
    .innerJoin(accounts, eq(apiKeys.accountId, accounts.id))
    .where(eq(apiKeys.keyHash, hashSecret(key)))
    .limit(1);

  if (!row) {
    throw unauthorized();
  }
  return row;
};
