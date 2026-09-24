import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { requireAccount } from '../auth/requireAccount.js';
import { db } from '../db/client.js';
import { headToHead, players } from '../db/schema.js';
import { toHeadToHeadDto, toPlayerDto } from '../domain/mappers.js';
import { applyRosterSync } from '../domain/rosterSync.js';
import {
  rosterSnapshotDtoSchema,
  rosterSyncRequestSchema,
  rosterSyncResponseSchema,
} from '../schemas/roster.js';

const loadSnapshot = async (account: { id: string; season: number; viewerId: string | null }) => {
  const playerRows = await db
    .select()
    .from(players)
    .where(eq(players.accountId, account.id))
    .orderBy(asc(players.rank));
  const h2hRows = await db.select().from(headToHead).where(eq(headToHead.accountId, account.id));

  return {
    season: account.season,
    viewerId: account.viewerId,
    players: playerRows.map(toPlayerDto),
    headToHead: h2hRows.map(toHeadToHeadDto),
  };
};

/**
 * `GET /v1/roster` (pull) and `POST /v1/roster/sync` (push) — ADR-0035, decision 3. Both are
 * the wire side of the `RosterSource` port and the "push direction for LOCAL rows" Phase 5's
 * deliverables call for (ARCHITECTURE.md §7).
 */
export const rosterRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/v1/roster', { schema: { response: { 200: rosterSnapshotDtoSchema } } }, async (req) => {
    const account = await requireAccount(req);
    return loadSnapshot(account);
  });

  app.post(
    '/v1/roster/sync',
    {
      schema: {
        body: rosterSyncRequestSchema,
        response: { 200: rosterSyncResponseSchema },
      },
    },
    async (req) => {
      const account = await requireAccount(req);
      const { assignedIds } = await applyRosterSync({
        accountId: account.id,
        viewerId: account.viewerId,
        newPlayers: req.body.newPlayers,
        editedPlayers: req.body.editedPlayers,
        headToHead: req.body.headToHead,
        deletedPlayers: req.body.deletedPlayers,
      });
      const snapshot = await loadSnapshot(account);
      return { snapshot, assignedIds };
    },
  );
};
