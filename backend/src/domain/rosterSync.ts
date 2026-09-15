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
 */

import { and, eq, max } from 'drizzle-orm';

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

    for (const draft of input.newPlayers) {
      const [inserted] = await tx
        .insert(players)
        .values({
          accountId: input.accountId,
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
        .returning({ id: players.id });
      if (!inserted) {
        throw new Error('insert returned no row');
      }
      assignedIds[draft.clientId] = inserted.id;
      nextRank += 1;
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
