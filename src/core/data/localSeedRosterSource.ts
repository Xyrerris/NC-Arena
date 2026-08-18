/**
 * The Phase 2 bootstrap source (ARCHITECTURE.md §7).
 *
 * It reads the committed seed and hands back the same `RosterSnapshot` the Phase 5 remote
 * source will. That is the whole point of the exercise: every screen built between now and
 * then talks to the repository, so swapping the source should produce no diff under
 * `src/features` at all.
 *
 * The seed is a committed asset rather than untrusted input, so this validates with the
 * §2.1 safe-integer guard rather than a Zod schema — Zod belongs at the network boundary,
 * where the input actually comes from somewhere else.
 */

import seedJson from '../../../assets/seed.json';
import { assertSafeInteger, err, ok, type RosterSnapshot, type RosterSource } from '../common';
import { asPlayerId, type HeadToHead, type Player } from '../model';

const NUMERIC_FIELDS = [
  'rank',
  'combatPower',
  'score',
  'atk',
  'def',
  'critBp',
  'hit',
  'spd',
] as const;

const parseSeed = (raw: typeof seedJson): RosterSnapshot => {
  if (raw.players.length === 0) {
    throw new Error('assets/seed.json: the roster is empty.');
  }

  const ids = new Set<string>();
  const players: Player[] = raw.players.map((row) => {
    for (const field of NUMERIC_FIELDS) {
      assertSafeInteger(row[field], `assets/seed.json: ${row.name}.${field}`);
    }
    if (ids.has(row.id)) {
      throw new Error(`assets/seed.json: duplicate player id ${row.id}.`);
    }
    ids.add(row.id);
    return {
      id: asPlayerId(row.id),
      name: row.name,
      rank: row.rank,
      combatPower: row.combatPower,
      score: row.score,
      atk: row.atk,
      def: row.def,
      critBp: row.critBp,
      hit: row.hit,
      spd: row.spd,
    };
  });

  // One ranked list, contiguous from 1. This is the assertion that keeps the prototype's
  // "viewer ranked 12 inside a 14-player roster, count reported as 15" from coming back
  // (ARCHITECTURE.md §7): three numbers that could not all be true, and nothing checked.
  const ranks = players.map((player) => player.rank).sort((a, b) => a - b);
  const contiguous = ranks.every((rank, index) => rank === index + 1);
  if (!contiguous) {
    throw new Error(
      `assets/seed.json: ranks must be one contiguous 1..${players.length} list, got ${ranks.join(', ')}.`,
    );
  }

  if (!ids.has(raw.viewerId)) {
    throw new Error(`assets/seed.json: viewerId ${raw.viewerId} is not in the roster.`);
  }

  const headToHead: HeadToHead[] = raw.headToHead.map((row) => {
    for (const id of [row.viewerId, row.opponentId]) {
      if (!ids.has(id)) {
        throw new Error(`assets/seed.json: head-to-head references unknown player ${id}.`);
      }
    }
    assertSafeInteger(row.wins, 'assets/seed.json: headToHead.wins');
    assertSafeInteger(row.losses, 'assets/seed.json: headToHead.losses');
    return {
      viewerId: asPlayerId(row.viewerId),
      opponentId: asPlayerId(row.opponentId),
      wins: row.wins,
      losses: row.losses,
    };
  });

  return { viewerId: asPlayerId(raw.viewerId), players, headToHead };
};

export const localSeedRosterSource: RosterSource = {
  name: 'local-seed',
  fetchRoster: async () => {
    try {
      return ok(parseSeed(seedJson));
    } catch (cause) {
      return err(cause instanceof Error ? cause : new Error(String(cause)));
    }
  },
};
