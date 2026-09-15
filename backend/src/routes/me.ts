import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAccount } from '../auth/requireAccount.js';
import { db } from '../db/client.js';
import { accounts, players } from '../db/schema.js';
import { notFound } from '../domain/errors.js';
import { setViewerRequestSchema } from '../schemas/roster.js';

/**
 * `PUT /v1/me/viewer` — sets which player on the account's roster is the viewer. This is
 * narrower than ADR-0022's local `viewerId`: that preference decides which row *this device*
 * shows as "you"; this endpoint is what a fresh device restores it from after pairing, and
 * what a device with no local preference yet can seed from (ADR-0035, decision 2).
 */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.put(
    '/v1/me/viewer',
    {
      schema: {
        body: setViewerRequestSchema,
        response: { 200: z.object({ viewerId: z.uuid() }) },
      },
    },
    async (req) => {
      const account = await requireAccount(req);

      const [owned] = await db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.id, req.body.playerId), eq(players.accountId, account.id)))
        .limit(1);
      if (!owned) {
        throw notFound(`No player ${req.body.playerId} on this account.`);
      }

      await db
        .update(accounts)
        .set({ viewerId: req.body.playerId })
        .where(eq(accounts.id, account.id));
      return { viewerId: req.body.playerId };
    },
  );
};
