import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from './support/pgliteClient.js';
import {
  type App,
  createAccount,
  pull,
  setViewer,
  startApp,
  sync,
  newPlayer,
} from './support/api.js';

vi.mock('../src/db/client.js', () => import('./support/pgliteClient.js'));

let app: App;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(resetDatabase);

describe('GET /health', () => {
  it('answers without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('POST /v1/accounts', () => {
  it('mints an account whose key opens an empty roster', async () => {
    const account = await createAccount(app);

    const res = await pull(app, account.apiKey);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ season: 1, viewerId: null, players: [], headToHead: [] });
  });

  it('never hands two accounts the same secrets', async () => {
    const a = await createAccount(app);
    const b = await createAccount(app);
    expect(new Set([a.apiKey, a.recoveryCode, b.apiKey, b.recoveryCode]).size).toBe(4);
    expect(a.accountId).not.toBe(b.accountId);
  });
});

describe('POST /v1/accounts/link', () => {
  it('gives a second device its own key to the same roster', async () => {
    const first = await createAccount(app);
    await sync(app, first.apiKey, { newPlayers: [newPlayer('a')] });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/accounts/link',
      payload: { recoveryCode: first.recoveryCode },
    });
    expect(res.statusCode).toBe(201);
    const linked = res.json<{ accountId: string; apiKey: string }>();
    expect(linked.accountId).toBe(first.accountId);
    expect(linked.apiKey).not.toBe(first.apiKey);

    const roster = await pull(app, linked.apiKey);
    expect(roster.json<{ players: { name: string }[] }>().players.map((p) => p.name)).toEqual([
      'Player a',
    ]);
    // The first device's key keeps working: linking adds a key, it does not rotate one.
    expect((await pull(app, first.apiKey)).statusCode).toBe(200);
  });

  it('answers NOT_FOUND for a code no account holds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/accounts/link',
      payload: { recoveryCode: 'not-a-real-code' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('answers VALIDATION_ERROR for an empty code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/accounts/link',
      payload: { recoveryCode: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('the bearer key', () => {
  it.each([
    ['no header', undefined],
    ['a key no account holds', 'Bearer nope'],
    ['a scheme other than Bearer', 'Basic abc'],
  ])('refuses %s with UNAUTHORIZED', async (_label, authorization) => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/roster',
      headers: authorization === undefined ? {} : { authorization },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('never shows one account another account’s roster', async () => {
    const a = await createAccount(app);
    const b = await createAccount(app);
    await sync(app, a.apiKey, { newPlayers: [newPlayer('a')] });

    expect((await pull(app, b.apiKey)).json()).toMatchObject({ players: [] });
  });
});

describe('PUT /v1/me/viewer', () => {
  it('seats a player this account holds, and the next pull carries it', async () => {
    const account = await createAccount(app);
    const pushed = await sync(app, account.apiKey, { newPlayers: [newPlayer('me')] });
    const id = pushed.json<{ assignedIds: Record<string, string> }>().assignedIds['me']!;

    const res = await setViewer(app, account.apiKey, id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ viewerId: id });
    expect((await pull(app, account.apiKey)).json()).toMatchObject({ viewerId: id });
  });

  it('refuses another account’s player with NOT_FOUND', async () => {
    const a = await createAccount(app);
    const b = await createAccount(app);
    const pushed = await sync(app, a.apiKey, { newPlayers: [newPlayer('theirs')] });
    const theirs = pushed.json<{ assignedIds: Record<string, string> }>().assignedIds['theirs']!;

    const res = await setViewer(app, b.apiKey, theirs);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect((await pull(app, b.apiKey)).json()).toMatchObject({ viewerId: null });
  });
});
