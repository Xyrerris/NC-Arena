import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from './support/pgliteClient.js';
import {
  type Account,
  type App,
  createAccount,
  getAvatar,
  newPlayer,
  pull,
  putAvatar,
  setViewer,
  startApp,
  sync,
} from './support/api.js';
import type { RosterSnapshotDto } from '../src/schemas/roster.js';

vi.mock('../src/db/client.js', () => import('./support/pgliteClient.js'));

// The avatar from ADR-0044's probe, in the checksum casing a wallet or explorer shows.
const CHECKSUM = '0x1023D8F22c6F5A8701E56A95E18Fb2DBE436B41f';
const LOWER = CHECKSUM.toLowerCase();

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

/** Two players on the account; the first is made the viewer. Returns both ids. */
const seedViewer = async (): Promise<[string, string]> => {
  await sync(app, account.apiKey, { newPlayers: [newPlayer('me'), newPlayer('other')] });
  const players = (await pull(app, account.apiKey)).json<RosterSnapshotDto>().players;
  const [me, other] = [players[0]!.id, players[1]!.id];
  await setViewer(app, account.apiKey, me);
  return [me, other];
};

describe('PUT /v1/me/avatar', () => {
  it('stores the planet and the address, lower-cased, and reads them back', async () => {
    await seedViewer();

    const put = await putAvatar(app, account.apiKey, { planet: 'heimdall', address: CHECKSUM });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ planet: 'heimdall', address: LOWER });

    const got = await getAvatar(app, account.apiKey);
    expect(got.json()).toEqual({ planet: 'heimdall', address: LOWER });
  });

  it('replaces the previous avatar', async () => {
    await seedViewer();
    await putAvatar(app, account.apiKey, { planet: 'odin', address: LOWER });
    await putAvatar(app, account.apiKey, { planet: 'heimdall', address: LOWER });

    expect((await getAvatar(app, account.apiKey)).json()).toEqual({
      planet: 'heimdall',
      address: LOWER,
    });
  });

  it('is refused before the account has a viewer, because the avatar belongs to one', async () => {
    const res = await putAvatar(app, account.apiKey, { planet: 'heimdall', address: LOWER });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it.each([
    ['a short address', { planet: 'heimdall', address: '0x1023' }],
    ['no 0x prefix', { planet: 'heimdall', address: LOWER.slice(2) }],
    ['a non-hex digit', { planet: 'heimdall', address: `0x${'g'.repeat(40)}` }],
    ['an unknown planet', { planet: 'asgard', address: LOWER }],
    ['no planet', { address: LOWER }],
  ])('rejects %s', async (_, payload) => {
    await seedViewer();
    const res = await putAvatar(app, account.apiKey, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('needs a key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/me/avatar',
      payload: { planet: 'odin', address: LOWER },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /v1/me/avatar', () => {
  it('answers 404 until one is set', async () => {
    await seedViewer();
    const res = await getAvatar(app, account.apiKey);
    expect(res.statusCode).toBe(404);
  });

  it('never shows another account’s avatar', async () => {
    await seedViewer();
    await putAvatar(app, account.apiKey, { planet: 'odin', address: LOWER });
    const stranger = await createAccount(app);
    expect((await getAvatar(app, stranger.apiKey)).statusCode).toBe(404);
  });
});

describe('the avatar follows the viewer (ADR-0044)', () => {
  it('survives choosing the same viewer again', async () => {
    const [me] = await seedViewer();
    await putAvatar(app, account.apiKey, { planet: 'heimdall', address: LOWER });

    await setViewer(app, account.apiKey, me);
    expect((await getAvatar(app, account.apiKey)).statusCode).toBe(200);
  });

  it('is dropped when another player becomes the viewer', async () => {
    const [, other] = await seedViewer();
    await putAvatar(app, account.apiKey, { planet: 'heimdall', address: LOWER });

    await setViewer(app, account.apiKey, other);
    expect((await getAvatar(app, account.apiKey)).statusCode).toBe(404);
  });
});
