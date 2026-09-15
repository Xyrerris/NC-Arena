import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { generateSecret, hashSecret } from '../auth/token.js';
import { db } from '../db/client.js';
import { accounts, apiKeys } from '../db/schema.js';
import { notFound } from '../domain/errors.js';
import {
  createAccountResponseSchema,
  linkAccountRequestSchema,
  linkAccountResponseSchema,
} from '../schemas/account.js';

/** `POST /v1/accounts`, `POST /v1/accounts/link` (ADR-0035, decision 2). No auth required. */
export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/v1/accounts',
    { schema: { response: { 201: createAccountResponseSchema } } },
    async (_req, reply) => {
      const apiKey = generateSecret();
      const recoveryCode = generateSecret();

      const [account] = await db
        .insert(accounts)
        .values({ recoveryCodeHash: hashSecret(recoveryCode) })
        .returning({ id: accounts.id });
      if (!account) {
        throw new Error('account insert returned no row');
      }
      await db.insert(apiKeys).values({ accountId: account.id, keyHash: hashSecret(apiKey) });

      return reply.code(201).send({ accountId: account.id, apiKey, recoveryCode });
    },
  );

  app.post(
    '/v1/accounts/link',
    {
      schema: {
        body: linkAccountRequestSchema,
        response: { 201: linkAccountResponseSchema },
      },
    },
    async (req, reply) => {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.recoveryCodeHash, hashSecret(req.body.recoveryCode)))
        .limit(1);
      if (!account) {
        throw notFound('Recovery code not recognised.');
      }

      const apiKey = generateSecret();
      await db.insert(apiKeys).values({ accountId: account.id, keyHash: hashSecret(apiKey) });

      return reply.code(201).send({ accountId: account.id, apiKey });
    },
  );
};
