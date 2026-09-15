import { RemoteRosterSource } from './remoteRosterSource';

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
