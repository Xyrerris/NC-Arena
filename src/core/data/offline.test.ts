/**
 * The Phase 5 exit criterion "the app functions fully offline on previously synced data",
 * as a test rather than a promise.
 *
 * The repository is wired the way `arenaRepository.ts` wires it on a device with a URL
 * configured: the real `RemoteRosterSource` as both source and sink, the real
 * `RemoteAccountGateway`, a stored API key. Only `fetch` is fake, and it is the whole
 * network: it answers while `online` is true and rejects with React Native's own message
 * when it is not — which is what airplane mode looks like from JavaScript.
 *
 * Every request is counted. That count is the strongest claim here: it is not enough that
 * each offline operation *succeeds*, because one that quietly tried the network first and
 * fell back would pass that check and hang on a bad connection instead of failing fast. The
 * count proves that nothing but a sync ever reaches for the network at all.
 */

import { createRosterRepository, type RosterRepository } from './rosterRepository';
import { asPlayerId, type PlayerDraft } from '../model';
import { DEFAULT_TIMEOUT_MS, RemoteAccountGateway, RemoteRosterSource } from '../network';
import { createMemoryPreferences, type ArenaPreferences } from '../prefs';
import { createTestDatabase, type TestDatabase } from '../testing';

const BASE_URL = 'https://arena.test';
const VIEWER = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const RIVAL = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const BYSTANDER = '9b2e8f1a-3c4d-4e5f-8a6b-7c8d9e0f1a2b';

const playerDto = (id: string, name: string, rank: number) => ({
  id,
  name,
  level: 40,
  gameCode: `g${rank}`,
  rank,
  combatPower: 3_000_000_000,
  score: 1200 - rank,
  hp: 2_147_483_648,
  atk: 900,
  def: 800,
  critBp: 25_000,
  hit: 70,
  spd: 12,
});

/** The ladder the server holds, as the pull delivers it. */
const SNAPSHOT = {
  season: 41,
  viewerId: VIEWER,
  players: [
    playerDto(VIEWER, 'Nyx', 1),
    playerDto(RIVAL, 'Orrin', 2),
    playerDto(BYSTANDER, 'Pell', 3),
  ],
  headToHead: [{ viewerId: VIEWER, opponentId: RIVAL, wins: 3, losses: 1 }],
};

const draft = (name: string, gameCode: string): PlayerDraft => ({
  name,
  level: 12,
  gameCode,
  combatPower: 500,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

interface FakeNetwork {
  online: boolean;
  /**
   * Connected but mute: the request is accepted and never answered — a captive portal, a Wi-Fi
   * with no uplink. Airplane mode fails at once; this is the case that used to hang.
   */
  silent: boolean;
  /** Every request the app made, online or not, as `METHOD path`. */
  requests: string[];
  /** The last body `POST /v1/roster/sync` was sent. */
  lastPush: unknown;
}

describe('offline on previously synced data (ROADMAP.md Phase 5 exit criterion)', () => {
  let handle: TestDatabase;
  let preferences: ArenaPreferences;
  let network: FakeNetwork;
  const originalFetch = globalThis.fetch;

  /** A fresh repository over the same SQLite file and preferences — an app restart. */
  const launch = (): RosterRepository => {
    const remote = new RemoteRosterSource(BASE_URL, () => preferences.getApiKey());
    return createRosterRepository({
      db: handle.db,
      source: remote,
      sink: remote,
      gateway: new RemoteAccountGateway(BASE_URL),
      preferences,
    });
  };

  const names = (repository: RosterRepository, search = ''): string[] => {
    const live = repository.observeRoster('RANK', search);
    return live.map(live.query.all()).map((row) => row.player.name);
  };

  beforeEach(async () => {
    handle = createTestDatabase();
    preferences = createMemoryPreferences({ apiKey: 'paired-device-key' });
    network = { online: true, silent: false, requests: [], lastPush: null };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(BASE_URL, '');
      network.requests.push(`${init?.method ?? 'GET'} ${path}`);
      if (network.silent) {
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          ),
        );
      }
      // React Native's fetch rejects with exactly this TypeError when there is no route.
      if (!network.online) throw new TypeError('Network request failed');

      let body: unknown = SNAPSHOT;
      if (path === '/v1/roster/sync') {
        network.lastPush = JSON.parse(String(init?.body));
        body = { snapshot: SNAPSHOT, assignedIds: {} };
      }
      return { ok: true, status: 200, json: async () => body };
    }) as typeof fetch;

    // The sync that makes the data "previously synced", done the way the app does it.
    expect((await launch().syncRoster()).ok).toBe(true);
    network.requests.length = 0;
    network.online = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    handle.close();
  });

  it('opens straight onto the synced ladder after a restart, with no setup gate', () => {
    const repository = launch();

    // The gate is what stands between a launch and the roster; a paired device must not
    // meet it just because the server is out of reach.
    expect(repository.needsAccount()).toBe(false);
    expect(names(repository)).toEqual(['Nyx', 'Orrin', 'Pell']);
    expect(names(repository, 'orr')).toEqual(['Orrin']);

    const viewer = repository.observeViewer();
    expect(viewer.map(viewer.query.all())?.name).toBe('Nyx');

    const rival = repository.observePlayer(asPlayerId(RIVAL));
    const detail = rival.map(rival.query.all());
    expect(detail?.player.hp).toBe(2_147_483_648);
    expect(detail?.headToHead).toMatchObject({ wins: 3, losses: 1 });

    expect(repository.getSeason()).toBe(41);
    expect(repository.getLastSyncedAt()).not.toBeNull();
    expect(network.requests).toEqual([]);
  });

  it('takes every write the app offers without touching the network', () => {
    const repository = launch();

    const created = repository.createPlayer(draft('Quill', 'q17'));
    expect(created.ok).toBe(true);
    expect(repository.updatePlayer(asPlayerId(RIVAL), draft('Orrin', 'g2')).ok).toBe(true);
    expect(repository.recordMatch(asPlayerId(RIVAL), 'WIN').ok).toBe(true);
    expect(repository.recordMatch(asPlayerId(BYSTANDER), 'LOSS').ok).toBe(true);
    expect(repository.removeMatch(asPlayerId(BYSTANDER), 'LOSS').ok).toBe(true);
    expect(repository.deletePlayer(asPlayerId(BYSTANDER)).ok).toBe(true);
    repository.setRosterSort('COMBAT_POWER');
    repository.setShortUnit(repository.getShortUnit());

    expect(names(repository)).toEqual(['Nyx', 'Orrin', 'Quill']);
    const rival = repository.observePlayer(asPlayerId(RIVAL));
    expect(rival.map(rival.query.all())?.headToHead).toMatchObject({ wins: 4, losses: 1 });
    expect(network.requests).toEqual([]);
  });

  it('exports and restores a backup offline', () => {
    const repository = launch();
    const backup = JSON.stringify(repository.exportSnapshot());

    repository.createPlayer(draft('Quill', 'q17'));
    const restored = repository.importSnapshot(backup);

    expect(restored.ok).toBe(true);
    expect(names(repository)).toEqual(['Nyx', 'Orrin', 'Pell']);
    expect(network.requests).toEqual([]);
  });

  it('fails a sync as a result the screen can show, and leaves the ladder exactly as it was', async () => {
    const repository = launch();
    repository.createPlayer(draft('Quill', 'q17'));
    const before = names(repository);
    const syncedAt = repository.getLastSyncedAt();

    const result = await repository.syncRoster();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('OFFLINE');
    expect(names(repository)).toEqual(before);
    // "Updated N ago" keeps telling the truth: nothing new was applied.
    expect(repository.getLastSyncedAt()).toBe(syncedAt);
    expect(network.requests).toEqual(['POST /v1/roster/sync']);
  });

  it('ends a sync against a server that never answers, so the next one can run', async () => {
    jest.useFakeTimers();
    try {
      const repository = launch();
      repository.createPlayer(draft('Quill', 'q17'));
      const before = names(repository);
      network.online = true;
      network.silent = true;

      const hung = repository.syncRoster();
      await jest.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      const result = await hung;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('OFFLINE — The server did not answer within 20 s.');
      }
      expect(names(repository)).toEqual(before);

      // Settled, not merely abandoned: the network comes back and the very next sync lands.
      network.silent = false;
      expect((await repository.syncRoster()).ok).toBe(true);
      expect(network.lastPush).toMatchObject({
        newPlayers: [expect.objectContaining({ name: 'Quill' })],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('pushes everything done offline on the first sync back online', async () => {
    const repository = launch();
    repository.createPlayer(draft('Quill', 'q17'));
    repository.updatePlayer(asPlayerId(RIVAL), { ...draft('Orrin', 'g2'), level: 99 });
    repository.recordMatch(asPlayerId(RIVAL), 'WIN');
    repository.deletePlayer(asPlayerId(BYSTANDER));
    expect((await repository.syncRoster()).ok).toBe(false);

    network.online = true;
    expect((await repository.syncRoster()).ok).toBe(true);

    expect(network.lastPush).toMatchObject({
      newPlayers: [expect.objectContaining({ name: 'Quill', gameCode: 'q17' })],
      editedPlayers: [expect.objectContaining({ id: RIVAL, level: 99 })],
      headToHead: [{ viewerId: VIEWER, opponentId: RIVAL, wins: 4, losses: 1 }],
      deletedPlayers: [BYSTANDER],
    });
  });
});
