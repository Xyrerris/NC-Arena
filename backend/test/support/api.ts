/**
 * Drives the real Fastify app through `inject` — the whole request path, validation and error
 * envelope included, without a listening socket. Import this only from a file that has already
 * mocked `src/db/client.js` (see `pgliteClient.ts`), or the server reaches for `DATABASE_URL`.
 */

import type { NewPlayerDto } from '../../src/schemas/player.js';
import type { RosterSyncRequest } from '../../src/schemas/roster.js';
import { buildServer } from '../../src/server.js';

export type App = ReturnType<typeof buildServer>;

export const startApp = async (): Promise<App> => {
  const app = buildServer();
  // The request log is noise in a test run; a failure is reported by the assertion instead.
  app.log.level = 'silent';
  await app.ready();
  return app;
};

export interface Account {
  accountId: string;
  apiKey: string;
  recoveryCode: string;
}

export const createAccount = async (app: App): Promise<Account> => {
  const res = await app.inject({ method: 'POST', url: '/v1/accounts' });
  if (res.statusCode !== 201) throw new Error(`createAccount answered ${res.statusCode}`);
  return res.json<Account>();
};

const auth = (apiKey: string) => ({ authorization: `Bearer ${apiKey}` });

export const pull = (app: App, apiKey: string) =>
  app.inject({ method: 'GET', url: '/v1/roster', headers: auth(apiKey) });

export const sync = (app: App, apiKey: string, body: Partial<RosterSyncRequest>) =>
  app.inject({
    method: 'POST',
    url: '/v1/roster/sync',
    headers: auth(apiKey),
    payload: { newPlayers: [], editedPlayers: [], headToHead: [], ...body },
  });

export const setViewer = (app: App, apiKey: string, playerId: string) =>
  app.inject({ method: 'PUT', url: '/v1/me/viewer', headers: auth(apiKey), payload: { playerId } });

/** A valid `newPlayers` row. Every stat is distinct so a swapped column shows up in a diff. */
export const newPlayer = (
  clientId: string,
  overrides: Partial<NewPlayerDto> = {},
): NewPlayerDto => ({
  clientId,
  name: `Player ${clientId}`,
  level: 10,
  gameCode: 'ABC123',
  combatPower: 1_000,
  score: 200,
  hp: 3_000,
  atk: 400,
  def: 500,
  critBp: 1_250,
  hit: 600,
  spd: 700,
  ...overrides,
});

export const putAvatar = (app: App, apiKey: string, payload: object) =>
  app.inject({ method: 'PUT', url: '/v1/me/avatar', headers: auth(apiKey), payload });

export const getAvatar = (app: App, apiKey: string) =>
  app.inject({ method: 'GET', url: '/v1/me/avatar', headers: auth(apiKey) });
