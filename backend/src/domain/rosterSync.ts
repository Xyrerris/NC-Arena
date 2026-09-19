/**
 * `POST /v1/roster/sync`'s merge (ADR-0035, decision 3). One transaction:
 *
 *  1. Every `newPlayers` row is inserted at the next rank in this account's ladder, keyed by
 *     the client's own `clientId` so the response can map it back to a server id in the same
 *     round trip — the `LOCAL` -> `REMOTE` transition ARCHITECTURE.md §7 describes.
 *  2. Every `editedPlayers` row overwrites the server's copy of a row this account already
 *     owns. Two devices editing the same row between syncs is decided by whichever sync lands
 *     second — no per-field merge (ADR-0035, decision 3's "Rejected — CRDTs").
 *  3. Every `headToHead` row is upserted by its `(account, viewer, opponent)` key.
 *
 * Returns the fresh snapshot so the caller can hand it straight back — the client applies it
 * with `replaceRoster` exactly as a pull would (ARCHITECTURE.md §7).
 *
 * **This endpoint is idempotent, and step 1 is the only part that had to be made so.** An edit
 * is keyed by a server id and overwrites, so replaying it lands on the same row; a head-to-head
 * row is upserted by its own key. A *new* row had neither: it was inserted unconditionally and
 * its `clientId` was read once and thrown away. That made a lost response unrecoverable — the
 * client cannot tell "applied" from "never arrived", its only safe move is to push again, and
 * the retry created a second copy of every row. `players.clientId` and the unique index over
 * `(account_id, client_id)` are what close that hole, and the read below is what turns a replay
 * into the same answer rather than a conflict.
 */

import { and, eq, inArray, max } from 'drizzle-orm';

import type { HeadToHeadDto, NewPlayerDto, PlayerEditDto } from '../schemas/player.js';
import { db } from '../db/client.js';
import { headToHead, players } from '../db/schema.js';
import { notFound } from './errors.js';
import { foldPlayerName } from './foldPlayerName.js';

export interface RosterSyncInput {
  accountId: string;
  newPlayers: readonly NewPlayerDto[];
  editedPlayers: readonly PlayerEditDto[];
  headToHead: readonly HeadToHeadDto[];
}

export const applyRosterSync = async (
  input: RosterSyncInput,
): Promise<{ assignedIds: Record<string, string> }> => {
  const assignedIds: Record<string, string> = {};

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ highestRank: max(players.rank) })
      .from(players)
      .where(eq(players.accountId, input.accountId));
    let nextRank = (row?.highestRank ?? 0) + 1;

    // Which of this push's clientIds this account has already accepted. On a first push this is
    // empty and every row below is inserted; on a replay it holds them all and nothing is.
    const clientIds = input.newPlayers.map((draft) => draft.clientId);
    const alreadyAccepted = new Map<string, string>();
    if (clientIds.length > 0) {
      const seen = await tx
        .select({ id: players.id, clientId: players.clientId })
        .from(players)
        .where(and(eq(players.accountId, input.accountId), inArray(players.clientId, clientIds)));
      for (const existing of seen) {
        if (existing.clientId !== null) alreadyAccepted.set(existing.clientId, existing.id);
      }
    }

    for (const draft of input.newPlayers) {
      const accepted = alreadyAccepted.get(draft.clientId);
      if (accepted !== undefined) {
        // Already created by an earlier push whose response the client did not receive. Answer
        // with the id it was given then, and do not consume a rank: the row already has one.
        assignedIds[draft.clientId] = accepted;
        continue;
      }

      const [inserted] = await tx
        .insert(players)
        .values({
          accountId: input.accountId,
          clientId: draft.clientId,
          name: draft.name,
          nameFolded: foldPlayerName(draft.name),
          level: draft.level,
          gameCode: draft.gameCode,
          rank: nextRank,
          combatPower: draft.combatPower,
          score: draft.score,
          hp: draft.hp,
          atk: draft.atk,
          def: draft.def,
          critBp: draft.critBp,
          hit: draft.hit,
          spd: draft.spd,
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: [players.accountId, players.clientId] })
        .returning({ id: players.id });

      if (inserted) {
        assignedIds[draft.clientId] = inserted.id;
        nextRank += 1;
        continue;
      }

      // No row came back, so the unique index refused the insert: a concurrent push for the
      // same clientId committed between the read above and this write. That is the race the
      // index exists for — the read alone cannot close it, because a read and a write are two
      // statements. The row that won is the one this response has to name, so it is read back
      // rather than retried.
      const [raced] = await tx
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.accountId, input.accountId), eq(players.clientId, draft.clientId)))
        .limit(1);
      if (!raced) {
        throw new Error(`insert of ${draft.clientId} was refused but no row holds it`);
      }
      assignedIds[draft.clientId] = raced.id;
    }

    for (const edit of input.editedPlayers) {
      const [updated] = await tx
        .update(players)
        .set({
          name: edit.name,
          nameFolded: foldPlayerName(edit.name),
          level: edit.level,
          gameCode: edit.gameCode,
          combatPower: edit.combatPower,
          score: edit.score,
          hp: edit.hp,
          atk: edit.atk,
          def: edit.def,
          critBp: edit.critBp,
          hit: edit.hit,
          spd: edit.spd,
          updatedAt: new Date(),
        })
        .where(and(eq(players.id, edit.id), eq(players.accountId, input.accountId)))
        .returning({ id: players.id });
      if (!updated) {
        throw notFound(`No player ${edit.id} on this account.`);
      }
    }

    for (const record of input.headToHead) {
      await tx
        .insert(headToHead)
        .values({
          accountId: input.accountId,
          viewerId: record.viewerId,
          opponentId: record.opponentId,
          wins: record.wins,
          losses: record.losses,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [headToHead.accountId, headToHead.viewerId, headToHead.opponentId],
          set: { wins: record.wins, losses: record.losses, updatedAt: new Date() },
        });
    }
  });

  return { assignedIds };
};
