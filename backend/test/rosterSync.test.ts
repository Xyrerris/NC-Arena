/**
 * `POST /v1/roster/sync` against a real Postgres. The comment block at the top of
 * `src/domain/rosterSync.ts` states the merge's rules; each `describe` here holds one of them.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlayerDto } from '../src/schemas/player.js';
import type { RosterSnapshotDto, RosterSyncResponse } from '../src/schemas/roster.js';
import { resetDatabase } from './support/pgliteClient.js';
import {
  type Account,
  type App,
  createAccount,
  newPlayer,
  pull,
  setViewer,
  startApp,
  sync,
} from './support/api.js';

vi.mock('../src/db/client.js', () => import('./support/pgliteClient.js'));

let app: App;
let account: Account;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase();
  account = await createAccount(app);
});

const push = async (body: Parameters<typeof sync>[2]): Promise<RosterSyncResponse> => {
  const res = await sync(app, account.apiKey, body);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<RosterSyncResponse>();
};

const snapshot = async (): Promise<RosterSnapshotDto> =>
  (await pull(app, account.apiKey)).json<RosterSnapshotDto>();

const ladder = (players: readonly PlayerDto[]) => players.map((p) => `${p.rank}:${p.name}`);

/** Pushes one new player per clientId, in order, and returns their server ids. */
const seed = async (...clientIds: string[]): Promise<string[]> => {
  const { assignedIds } = await push({ newPlayers: clientIds.map((id) => newPlayer(id)) });
  return clientIds.map((id) => assignedIds[id]!);
};

const edit = (player: PlayerDto, overrides: Partial<PlayerDto> = {}) => {
  const { rank: _rank, ...rest } = player;
  return { ...rest, ...overrides };
};

describe('new players', () => {
  it('are ranked after the ladder already held, and named in assignedIds', async () => {
    await seed('a');
    const { assignedIds, snapshot: after } = await push({
      newPlayers: [newPlayer('b'), newPlayer('c')],
    });

    expect(Object.keys(assignedIds)).toEqual(['b', 'c']);
    expect(ladder(after.players)).toEqual(['1:Player a', '2:Player b', '3:Player c']);
    expect(after.players.find((p) => p.name === 'Player b')!.id).toBe(assignedIds['b']);
  });

  it('come back with every stat in the column it went out in', async () => {
    const { snapshot: after } = await push({ newPlayers: [newPlayer('a')] });
    const { clientId: _clientId, ...sent } = newPlayer('a');
    expect(after.players[0]).toEqual({ ...sent, id: expect.any(String), rank: 1 });
  });

  // The client-side twin is src/features/player/statContract.test.tsx. A `bigint` column read
  // through a driver that returns strings, or an `integer` column, fails this and nothing else.
  it('keep a stat above Int32.MAX and up to MAX_SAFE_INTEGER exactly', async () => {
    const big = { combatPower: 2 ** 31 + 7, score: Number.MAX_SAFE_INTEGER };
    const { snapshot: after } = await push({ newPlayers: [newPlayer('a', big)] });

    expect(after.players[0]).toMatchObject(big);
    expect(typeof after.players[0]!.score).toBe('number');
  });

  it('refuse a stat past MAX_SAFE_INTEGER as a VALIDATION_ERROR, writing nothing', async () => {
    const res = await sync(app, account.apiKey, {
      newPlayers: [newPlayer('a', { score: Number.MAX_SAFE_INTEGER + 1 })],
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect((await snapshot()).players).toEqual([]);
  });

  it('ignore a rank the client tries to choose — the server owns it', async () => {
    await seed('a');
    const res = await sync(app, account.apiKey, {
      newPlayers: [{ ...newPlayer('b'), rank: 1 } as ReturnType<typeof newPlayer>],
    });

    expect(res.statusCode).toBe(200);
    expect(ladder(res.json<RosterSyncResponse>().snapshot.players)).toEqual([
      '1:Player a',
      '2:Player b',
    ]);
  });
});

describe('idempotency — a replayed push', () => {
  it('is answered with the ids of the first, and creates nothing', async () => {
    const body = { newPlayers: [newPlayer('a'), newPlayer('b')] };
    const first = await push(body);
    const replay = await push(body);

    expect(replay.assignedIds).toEqual(first.assignedIds);
    expect(ladder(replay.snapshot.players)).toEqual(['1:Player a', '2:Player b']);
  });

  it('that arrives beside a genuinely new row ranks only the new one', async () => {
    const first = await push({ newPlayers: [newPlayer('a')] });
    const second = await push({ newPlayers: [newPlayer('a'), newPlayer('b')] });

    expect(second.assignedIds['a']).toBe(first.assignedIds['a']);
    expect(ladder(second.snapshot.players)).toEqual(['1:Player a', '2:Player b']);
  });

  it('keys clientIds per account, so two accounts may reuse one', async () => {
    await push({ newPlayers: [newPlayer('local-1')] });
    const other = await createAccount(app);
    const res = await sync(app, other.apiKey, { newPlayers: [newPlayer('local-1')] });

    expect(res.statusCode).toBe(200);
    expect(res.json<RosterSyncResponse>().snapshot.players).toHaveLength(1);
  });
});

describe('edits', () => {
  it('overwrite the server’s copy and keep its rank', async () => {
    await seed('a', 'b');
    const [, b] = (await snapshot()).players;

    const { snapshot: after } = await push({
      editedPlayers: [edit(b!, { name: 'Renamed', combatPower: 9_999 })],
    });

    expect(after.players[1]).toMatchObject({
      id: b!.id,
      rank: 2,
      name: 'Renamed',
      combatPower: 9_999,
    });
  });

  it('to a row that is gone are skipped, and the rest of the push still lands', async () => {
    const [a] = await seed('a');
    const [gone] = (await snapshot()).players;
    await push({ deletedPlayers: [a!] });

    const { snapshot: after } = await push({
      editedPlayers: [edit(gone!, { name: 'Ghost' })],
      newPlayers: [newPlayer('b')],
    });

    expect(ladder(after.players)).toEqual(['1:Player b']);
  });

  it('cannot reach a row another account owns', async () => {
    const other = await createAccount(app);
    await sync(app, other.apiKey, { newPlayers: [newPlayer('theirs')] });
    const [theirs] = (await pull(app, other.apiKey)).json<RosterSnapshotDto>().players;

    await push({ editedPlayers: [edit(theirs!, { name: 'Hijacked' })] });

    const [unchanged] = (await pull(app, other.apiKey)).json<RosterSnapshotDto>().players;
    expect(unchanged!.name).toBe('Player theirs');
  });
});

describe('deletes (ADR-0039)', () => {
  it('close the gap in the ranks below', async () => {
    const [, b] = await seed('a', 'b', 'c', 'd');
    const { snapshot: after } = await push({ deletedPlayers: [b!] });
    expect(ladder(after.players)).toEqual(['1:Player a', '2:Player c', '3:Player d']);
  });

  it('of several rows at once still leave the ladder contiguous', async () => {
    const [a, , c] = await seed('a', 'b', 'c', 'd', 'e');
    const { snapshot: after } = await push({ deletedPlayers: [c!, a!] });
    expect(ladder(after.players)).toEqual(['1:Player b', '2:Player d', '3:Player e']);
  });

  it('take the records that name the deleted row', async () => {
    const [me, a, b] = await seed('me', 'a', 'b');
    await push({
      headToHead: [
        { viewerId: me!, opponentId: a!, wins: 3, losses: 1 },
        { viewerId: me!, opponentId: b!, wins: 0, losses: 2 },
      ],
    });

    const { snapshot: after } = await push({ deletedPlayers: [a!] });
    expect(after.headToHead).toEqual([{ viewerId: me!, opponentId: b!, wins: 0, losses: 2 }]);
  });

  it('skip the account’s viewer, which no device may remove', async () => {
    const [me, a] = await seed('me', 'a');
    await setViewer(app, account.apiKey, me!);

    const { snapshot: after } = await push({ deletedPlayers: [me!, a!] });
    expect(ladder(after.players)).toEqual(['1:Player me']);
    expect(after.viewerId).toBe(me);
  });

  it('win over an edit to the same row in the same push', async () => {
    const [a] = await seed('a');
    const [row] = (await snapshot()).players;
    const { snapshot: after } = await push({
      editedPlayers: [edit(row!, { name: 'Edited' })],
      deletedPlayers: [a!],
    });
    expect(after.players).toEqual([]);
  });

  it('of a row already gone, or another account’s, change nothing', async () => {
    const other = await createAccount(app);
    await sync(app, other.apiKey, { newPlayers: [newPlayer('theirs')] });
    const [theirs] = (await pull(app, other.apiKey)).json<RosterSnapshotDto>().players;
    const [a] = await seed('a');
    await push({ deletedPlayers: [a!] });

    const res = await sync(app, account.apiKey, { deletedPlayers: [a!, theirs!.id] });

    expect(res.statusCode).toBe(200);
    expect((await pull(app, other.apiKey)).json<RosterSnapshotDto>().players).toHaveLength(1);
  });
});

describe('head-to-head records', () => {
  it('are upserted by (viewer, opponent), so a second push overwrites the first', async () => {
    const [me, a] = await seed('me', 'a');
    await push({ headToHead: [{ viewerId: me!, opponentId: a!, wins: 1, losses: 0 }] });
    const { snapshot: after } = await push({
      headToHead: [{ viewerId: me!, opponentId: a!, wins: 4, losses: 2 }],
    });
    expect(after.headToHead).toEqual([{ viewerId: me!, opponentId: a!, wins: 4, losses: 2 }]);
  });

  it('naming a row that is gone are skipped rather than failing the push', async () => {
    const [me, a] = await seed('me', 'a');
    await push({ deletedPlayers: [a!] });

    const { snapshot: after } = await push({
      headToHead: [{ viewerId: me!, opponentId: a!, wins: 1, losses: 0 }],
    });
    expect(after.headToHead).toEqual([]);
  });

  it('naming another account’s player are refused', async () => {
    const other = await createAccount(app);
    await sync(app, other.apiKey, { newPlayers: [newPlayer('theirs')] });
    const [theirs] = (await pull(app, other.apiKey)).json<RosterSnapshotDto>().players;
    const [me] = await seed('me');

    const { snapshot: after } = await push({
      headToHead: [{ viewerId: me!, opponentId: theirs!.id, wins: 1, losses: 0 }],
    });
    expect(after.headToHead).toEqual([]);
  });
});

describe('the request body', () => {
  it('parses without deletedPlayers, as an older client sends it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/roster/sync',
      headers: { authorization: `Bearer ${account.apiKey}` },
      payload: { newPlayers: [newPlayer('a')], editedPlayers: [], headToHead: [] },
    });
    expect(res.statusCode).toBe(200);
  });
});
