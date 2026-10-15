import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAccount } from '../auth/requireAccount.js';
import { db } from '../db/client.js';
import { accounts, players } from '../db/schema.js';
import { notFound } from '../domain/errors.js';
import {
  setViewerAvatarRequestSchema,
  setViewerRequestSchema,
  viewerAvatarSchema,
} from '../schemas/roster.js';

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

      // Setting the viewer the account already has is a no-op for its avatar; setting another
      // one drops it, because the address belongs to the previous viewer (ADR-0044).
      const changed = account.viewerId !== req.body.playerId;
      await db
        .update(accounts)
        .set({
          viewerId: req.body.playerId,
          ...(changed ? { viewerAvatarPlanet: null, viewerAvatarAddress: null } : {}),
        })
        .where(eq(accounts.id, account.id));
      return { viewerId: req.body.playerId };
    },
  );

  /**
   * `PUT /v1/me/avatar` / `GET /v1/me/avatar` — the Nine Chronicles avatar the viewer plays
   * (ADR-0044). It needs a viewer to belong to, so a PUT before one is chosen is refused.
   */
  app.put(
    '/v1/me/avatar',
    { schema: { body: setViewerAvatarRequestSchema, response: { 200: viewerAvatarSchema } } },
    async (req) => {
      const account = await requireAccount(req);
      if (account.viewerId === null) {
        throw notFound('This account has no viewer yet; set one with PUT /v1/me/viewer first.');
      }
      await db
        .update(accounts)
        .set({ viewerAvatarPlanet: req.body.planet, viewerAvatarAddress: req.body.address })
        .where(eq(accounts.id, account.id));
      return req.body;
    },
  );

  app.get('/v1/me/avatar', { schema: { response: { 200: viewerAvatarSchema } } }, async (req) => {
    const account = await requireAccount(req);
    const parsed = viewerAvatarSchema.safeParse({
      planet: account.viewerAvatarPlanet,
      address: account.viewerAvatarAddress,
    });
    if (!parsed.success) throw notFound('No avatar is set for the viewer of this account.');
    return parsed.data;
  });
};
