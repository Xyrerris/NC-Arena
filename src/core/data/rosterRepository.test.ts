/**
 * ROADMAP.md Phase 2 exit criteria: all three sorts and case-insensitive search proven at
 * the SQL layer against `better-sqlite3` in Node, plus persistence across a restart with
 * no network (ARCHITECTURE.md §10).
 *
 * The sort cases run against a synthetic fixture rather than the real seed on purpose. In
 * the seed, rank order and combat-power order happen to be identical — so a test written
 * against it would pass whether or not the CP sort did anything at all.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { err, ok, type RosterSnapshot, type RosterSource } from '../common';
import { asPlayerId, type HeadToHead, type Player, type RosterSort } from '../model';
import { createMemoryPreferences } from '../prefs';
import { createTestDatabase, type TestDatabase } from '../testing';
import { localSeedRosterSource } from './localSeedRosterSource';
import { createRosterRepository } from './rosterRepository';

const player = (id: string, name: string, rank: number, combatPower: number): Player => ({
  id: asPlayerId(id),
  name,
  rank,
  combatPower,
  score: 1000 - rank,
  atk: 1_000_000 + rank,
  def: 2_000_000 + rank,
  critBp: 500_000 + rank,
  hit: 3_000_000 + rank,
  spd: 4_000_000 + rank,
});

const record = (opponentId: string, wins: number, losses: number): HeadToHead => ({
  viewerId: asPlayerId('p-a'),
  opponentId: asPlayerId(opponentId),
  wins,
  losses,
});

/** Rank, combat power and wins deliberately disagree, so each sort has to earn its test. */
const FIXTURE: RosterSnapshot = {
  season: 41,
  viewerId: asPlayerId('p-a'),
  players: [
    player('p-a', 'Aurel', 1, 100),
    player('p-b', 'Brann', 2, 400),
    player('p-c', 'Cinder', 3, 200),
    player('p-d', 'Dross', 4, 300),
  ],
  headToHead: [record('p-b', 5, 1), record('p-c', 9, 0)],
};

const sourceOf = (snapshot: RosterSnapshot): RosterSource => ({
  name: 'fixture',
  fetchRoster: async () => ok(snapshot),
});

const repositoryOn = (handle: TestDatabase, source: RosterSource = sourceOf(FIXTURE)) =>
  createRosterRepository({ db: handle.db, source, preferences: createMemoryPreferences() });

const namesOf = (
  repo: ReturnType<typeof repositoryOn>,
  sort: RosterSort,
  search = '',
): string[] => {
  const live = repo.observeRoster(sort, search);
  return live.map(live.query.all()).map((entry) => entry.player.name);
};

describe('rosterRepository — sorting in SQL', () => {
  let handle: TestDatabase;
  let repo: ReturnType<typeof repositoryOn>;

  beforeEach(async () => {
    handle = createTestDatabase();
    repo = repositoryOn(handle);
    expect((await repo.refresh()).ok).toBe(true);
  });

  afterEach(() => handle.close());

  it('orders by absolute season rank', () => {
    expect(namesOf(repo, 'RANK')).toEqual(['Aurel', 'Brann', 'Cinder', 'Dross']);
  });

  it('orders by combat power, descending', () => {
    expect(namesOf(repo, 'COMBAT_POWER')).toEqual(['Brann', 'Dross', 'Cinder', 'Aurel']);
  });

  it('orders by my wins, with never-fought players last', () => {
    // Aurel is the viewer and Dross has no record; both have NULL wins, so they fall to
    // the end and are broken apart by rank.
    expect(namesOf(repo, 'MY_WINS')).toEqual(['Cinder', 'Brann', 'Aurel', 'Dross']);
  });
});

describe('rosterRepository — search in SQL', () => {
  let handle: TestDatabase;
  let repo: ReturnType<typeof repositoryOn>;

  beforeEach(async () => {
    handle = createTestDatabase();
    repo = repositoryOn(handle);
    await repo.refresh();
  });

  afterEach(() => handle.close());

  it('returns everything for an empty or whitespace query', () => {
    expect(namesOf(repo, 'RANK', '')).toHaveLength(4);
    expect(namesOf(repo, 'RANK', '   ')).toHaveLength(4);
  });

  it('matches a substring, case-insensitively', () => {
    expect(namesOf(repo, 'RANK', 'ur')).toEqual(['Aurel']);
    expect(namesOf(repo, 'RANK', 'UR')).toEqual(['Aurel']);
    expect(namesOf(repo, 'RANK', 'n')).toEqual(['Brann', 'Cinder']);
  });

  it('shows the empty state rather than a blank screen for a non-match', () => {
    expect(namesOf(repo, 'RANK', 'zzz')).toEqual([]);
  });

  it('treats LIKE wildcards as literal characters', () => {
    // Unescaped, "_" matches any single character and would return the whole roster.
    expect(namesOf(repo, 'RANK', '_')).toEqual([]);
    expect(namesOf(repo, 'RANK', '%')).toEqual([]);
  });
});

describe('rosterRepository — search against names that contain wildcards', () => {
  // A separate fixture, because the assertion that actually proves escaping works needs a
  // name containing a literal "_": an unescaped underscore matches *every* row, so
  // "returns exactly this one" fails loudly where "returns nothing" passes by accident.
  const WILDCARDS: RosterSnapshot = {
    season: 41,
    viewerId: asPlayerId('w-a'),
    players: [
      player('w-a', 'Ordinary', 1, 400),
      player('w-b', 'Ex_ile', 2, 300),
      player('w-c', 'Cent%ry', 3, 200),
      player('w-d', 'Plain', 4, 100),
    ],
    headToHead: [],
  };

  let handle: TestDatabase;
  let repo: ReturnType<typeof repositoryOn>;

  beforeEach(async () => {
    handle = createTestDatabase();
    repo = repositoryOn(handle, sourceOf(WILDCARDS));
    await repo.refresh();
  });

  afterEach(() => handle.close());

  it('matches a literal underscore instead of any single character', () => {
    expect(namesOf(repo, 'RANK', '_')).toEqual(['Ex_ile']);
    expect(namesOf(repo, 'RANK', 'x_i')).toEqual(['Ex_ile']);
  });

  it('matches a literal percent instead of any run of characters', () => {
    expect(namesOf(repo, 'RANK', '%')).toEqual(['Cent%ry']);
  });

  it('matches a literal backslash', () => {
    expect(namesOf(repo, 'RANK', String.fromCharCode(92))).toEqual([]);
  });
});

describe('rosterRepository — entries and detail', () => {
  let handle: TestDatabase;
  let repo: ReturnType<typeof repositoryOn>;

  beforeEach(async () => {
    handle = createTestDatabase();
    repo = repositoryOn(handle);
    await repo.refresh();
  });

  afterEach(() => handle.close());

  it('flags the viewer inside the one ranked list', () => {
    const live = repo.observeRoster('RANK', '');
    const entries = live.map(live.query.all());
    const viewers = entries.filter((entry) => entry.isViewer).map((entry) => entry.player.name);
    expect(viewers).toEqual(['Aurel']);
  });

  it('leaves the record null for a player never fought', () => {
    const live = repo.observeRoster('RANK', '');
    const byName = new Map(live.map(live.query.all()).map((entry) => [entry.player.name, entry]));
    expect(byName.get('Dross')?.record).toBeNull();
    expect(byName.get('Brann')?.record).toEqual({
      viewerId: 'p-a',
      opponentId: 'p-b',
      wins: 5,
      losses: 1,
    });
  });

  it('resolves opponent, viewer and head-to-head in one query', () => {
    const live = repo.observePlayer(asPlayerId('p-c'));
    const detail = live.map(live.query.all());
    expect(detail?.player.name).toBe('Cinder');
    expect(detail?.viewer.name).toBe('Aurel');
    expect(detail?.headToHead?.wins).toBe(9);
  });

  it('returns null for an unknown id instead of crashing on an undefined row', () => {
    const live = repo.observePlayer(asPlayerId('does-not-exist'));
    expect(live.map(live.query.all())).toBeNull();
  });

  it('resolves the viewer', () => {
    const live = repo.observeViewer();
    expect(live.map(live.query.all())?.name).toBe('Aurel');
  });
});

describe('rosterRepository — refresh and seeding', () => {
  it('surfaces a source failure as a Result rather than throwing', async () => {
    const handle = createTestDatabase();
    const failing: RosterSource = {
      name: 'failing',
      fetchRoster: async () => err(new Error('offline')),
    };
    const repo = repositoryOn(handle, failing);

    const result = await repo.refresh();
    expect(result.ok).toBe(false);
    expect(repo.playerCount()).toBe(0);
    handle.close();
  });

  it('seeds an empty database once and leaves a populated one alone', async () => {
    const handle = createTestDatabase();
    let calls = 0;
    const counting: RosterSource = {
      name: 'counting',
      fetchRoster: async () => {
        calls += 1;
        return ok(FIXTURE);
      },
    };
    const repo = repositoryOn(handle, counting);

    expect((await repo.ensureSeeded()).ok).toBe(true);
    expect((await repo.ensureSeeded()).ok).toBe(true);
    expect(calls).toBe(1);
    expect(repo.playerCount()).toBe(4);
    handle.close();
  });

  it('replaces the ladder as a unit, so a stale player cannot survive a sync', async () => {
    const handle = createTestDatabase();
    await repositoryOn(handle).refresh();

    const shrunk: RosterSnapshot = {
      season: 41,
      viewerId: FIXTURE.viewerId,
      players: FIXTURE.players.slice(0, 2),
      headToHead: [],
    };
    const second = repositoryOn(handle, sourceOf(shrunk));
    await second.refresh();

    expect(second.playerCount()).toBe(2);
    handle.close();
  });
});

describe('rosterRepository — offline persistence', () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-db-'));
    file = path.join(directory, 'arena.db');
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('serves previously synced data after a restart, with no source available', async () => {
    const first = createTestDatabase(file);
    await repositoryOn(first).refresh();
    first.close();

    // The restart: a new connection to the same file, and a source that throws if anything
    // reaches for it. Nothing should.
    const second = createTestDatabase(file);
    const offline = createRosterRepository({
      db: second.db,
      source: {
        name: 'unreachable',
        fetchRoster: () => {
          throw new Error('the repository must not reach the network to read stored data');
        },
      },
      preferences: createMemoryPreferences({ viewerId: asPlayerId('p-a') }),
    });

    expect(offline.playerCount()).toBe(4);
    expect(namesOf(offline, 'COMBAT_POWER')).toEqual(['Brann', 'Dross', 'Cinder', 'Aurel']);

    const live = offline.observePlayer(asPlayerId('p-b'));
    expect(live.map(live.query.all())?.headToHead?.wins).toBe(5);

    second.close();
  });
});

describe('localSeedRosterSource', () => {
  it('parses the committed seed into one contiguous ranked list', async () => {
    const result = await localSeedRosterSource.fetchRoster();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { players, viewerId, headToHead } = result.value;
    expect(players).toHaveLength(15);
    expect(players.map((entry) => entry.rank)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );

    // The prototype put the viewer outside the roster at rank 12 of 14 and reported 15
    // registered players. One list of 15 with the viewer at rank 9 is the resolution.
    const viewer = players.find((entry) => entry.id === viewerId);
    expect(viewer?.name).toBe('Krios');
    expect(viewer?.rank).toBe(9);
    expect(headToHead).toHaveLength(14);
    expect(headToHead.some((entry) => entry.opponentId === viewerId)).toBe(false);
  });

  it('loads into SQLite and sorts by my wins across the real roster', async () => {
    const handle = createTestDatabase();
    const repo = createRosterRepository({
      db: handle.db,
      source: localSeedRosterSource,
      preferences: createMemoryPreferences(),
    });
    expect((await repo.ensureSeeded()).ok).toBe(true);
    expect(repo.playerCount()).toBe(15);

    const live = repo.observeRoster('MY_WINS', '');
    const entries = live.map(live.query.all());
    expect(entries.slice(0, 3).map((entry) => entry.player.name)).toEqual([
      'Lirien',
      'Dunmoor',
      'Petravale',
    ]);
    // The viewer has no record against themselves, so they sort last.
    expect(entries[entries.length - 1]?.player.name).toBe('Krios');
    handle.close();
  });
});
