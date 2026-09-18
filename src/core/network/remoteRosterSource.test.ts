import { RemoteRosterSource } from './remoteRosterSource';
import { asPlayerId, type Player } from '../model';
import type { RosterPush } from '../common';

const validPlayer = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  name: 'Skarn',
  level: 488,
  gameCode: 'a984',
  rank: 1,
  combatPower: 2_145_880,
  score: 1712,
  hp: 1_440_085_258,
  atk: 2_418_904_113,
  def: 1_204_551_002,
  critBp: 584_127,
  hit: 908_442_310,
  spd: 771_003_984,
};

describe('RemoteRosterSource.fetchRoster', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps a valid snapshot to the domain shape', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          season: 41,
          viewerId: validPlayer.id,
          players: [validPlayer],
          headToHead: [],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const source = new RemoteRosterSource('https://api.example.com', 'key');
    const result = await source.fetchRoster();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.season).toBe(41);
      expect(result.value.players).toHaveLength(1);
    }
  });

  it('fails when the account has no viewer set yet, rather than fabricating one', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ season: 41, viewerId: null, players: [], headToHead: [] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const result = await new RemoteRosterSource('https://api.example.com', 'key').fetchRoster();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no viewer set');
    }
  });

  it('fails when the response does not match the contract', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ nonsense: true }), { status: 200 }),
      ) as unknown as typeof fetch;

    const result = await new RemoteRosterSource('https://api.example.com', 'key').fetchRoster();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('did not match the contract');
    }
  });

  it('fails with the taxonomy code when the server rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'bad key' } }), {
        status: 401,
      }),
    ) as unknown as typeof fetch;

    const result = await new RemoteRosterSource('https://api.example.com', 'bad-key').fetchRoster();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('UNAUTHORIZED');
    }
  });
});

describe('RemoteRosterSource.pushRoster', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const localPlayer: Player = { ...validPlayer, id: asPlayerId('local-1') };
  const onePush: RosterPush = { newPlayers: [localPlayer], editedPlayers: [], headToHead: [] };
  const emptyPush: RosterPush = { newPlayers: [], editedPlayers: [], headToHead: [] };

  /** Records what was sent, so a test can assert the body without reaching into mock.calls. */
  const respondWith = (body: unknown, status = 200) => {
    const sent: { url?: string; init?: RequestInit } = {};
    global.fetch = jest.fn((url: string, init: RequestInit) => {
      sent.url = url;
      sent.init = init;
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as unknown as typeof fetch;
    return sent;
  };

  const okResponse = (viewerId: string | null) => ({
    snapshot: { season: 41, viewerId, players: [validPlayer], headToHead: [] },
    assignedIds: { 'local-1': validPlayer.id },
  });

  it('POSTs the mapped body to the sync endpoint', async () => {
    const sent = respondWith(okResponse(validPlayer.id));

    await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(onePush);

    expect(sent.url).toBe('https://api.example.com/v1/roster/sync');
    expect(sent.init?.method).toBe('POST');

    const body = JSON.parse(String(sent.init?.body)) as {
      newPlayers: { clientId: string; id?: string; rank?: number }[];
    };
    expect(body.newPlayers[0]?.clientId).toBe('local-1');
    expect(body.newPlayers[0]?.id).toBeUndefined();
    expect(body.newPlayers[0]?.rank).toBeUndefined();
  });

  it('returns the fresh snapshot and the clientId -> server id map', async () => {
    respondWith(okResponse(validPlayer.id));

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(
      onePush,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshot?.season).toBe(41);
      expect(result.value.assignedIds.get(asPlayerId('local-1'))).toBe(validPlayer.id);
    }
  });

  it('keeps the id map when the account has no viewer yet, instead of failing the push', async () => {
    // The state a freshly created account is in until PUT /v1/me/viewer has run — which is
    // exactly when the first push happens. The rows have already landed by the time the
    // response is parsed, so reporting a failure here would discard the only record of which
    // local row became which server row, and the retry it invites would duplicate all of them
    // (the server inserts newPlayers unconditionally). fetchRoster refuses the same state,
    // because a pull that fails has changed nothing.
    respondWith(okResponse(null));

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(
      onePush,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshot).toBeNull();
      expect(result.value.assignedIds.get(asPlayerId('local-1'))).toBe(validPlayer.id);
    }
  });

  it('refuses an oversized push before sending it', async () => {
    const sent = respondWith(okResponse(validPlayer.id));

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster({
      ...emptyPush,
      newPlayers: Array.from({ length: 501 }, (_, i) => ({
        ...localPlayer,
        id: asPlayerId(`local-${i}`),
      })),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('request does not match the contract');
    }
    expect(sent.url).toBeUndefined();
  });

  it('fails with the taxonomy code when the server rejects the push', async () => {
    respondWith({ error: { code: 'VALIDATION_ERROR', message: 'bad row' } }, 400);

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(
      onePush,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('VALIDATION_ERROR');
    }
  });

  it('fails when the response does not match the contract', async () => {
    respondWith({ snapshot: { season: 41, viewerId: null, players: [], headToHead: [] } });

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(
      emptyPush,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('did not match the contract');
    }
  });

  it('fails as offline when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const result = await new RemoteRosterSource('https://api.example.com', 'key').pushRoster(
      emptyPush,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('OFFLINE');
    }
  });
});
