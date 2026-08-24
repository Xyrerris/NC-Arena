/**
 * ROADMAP.md Phase 2 exit criteria: all three sorts and case-insensitive search proven at
 * the SQL layer against `better-sqlite3` in Node, plus persistence across a restart with
 * no network (ARCHITECTURE.md §10).
 *
 * The sort cases run against a synthetic fixture in which rank order, combat-power order and
 * win count all disagree. A fixture where they line up — the deleted seed was one — passes
 * the sort tests whether or not the sort does anything at all.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { err, isOk, ok, type RosterSnapshot, type RosterSource } from '../common';
import {
  asPlayerId,
  type HeadToHead,
  type Player,
  type PlayerDraft,
  type PlayerId,
  type RosterSort,
} from '../model';
import { createMemoryPreferences } from '../prefs';
import { createTestDatabase, type TestDatabase } from '../testing';
import { PlayerDraftRejected, createRosterRepository } from './rosterRepository';

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
    expect(detail?.viewer?.name).toBe('Aurel');
    expect(detail?.headToHead?.wins).toBe(9);
  });

  it('returns null for an unknown id instead of crashing on an undefined row', () => {
    const live = repo.observePlayer(asPlayerId('does-not-exist'));
    expect(live.map(live.query.all())).toBeNull();
  });

  it('still resolves a player when there is no viewer yet', () => {
    // The viewer is LEFT joined, so "no such player" and "no avatar yet" are different
    // answers. Inner-joined they were the same empty row, and Phase 4's not-found state
    // would have claimed a real player did not exist.
    const noViewer = createRosterRepository({
      db: handle.db,
      source: sourceOf(FIXTURE),
      preferences: createMemoryPreferences(),
    });
    const live = noViewer.observePlayer(asPlayerId('p-c'));
    const detail = live.map(live.query.all());
    expect(detail?.player.name).toBe('Cinder');
    expect(detail?.viewer).toBeNull();
    expect(detail?.headToHead).toBeNull();
  });

  it('resolves the viewer', () => {
    const live = repo.observeViewer();
    expect(live.map(live.query.all())?.name).toBe('Aurel');
  });
});

describe('rosterRepository — refresh and an empty start', () => {
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

  it('starts empty, because nothing seeds it any more', () => {
    // ADR-0021. A fresh install has migrations applied and no rows: the roster opens on
    // the empty state and the user adds the first player.
    const handle = createTestDatabase();
    const repo = createRosterRepository({
      db: handle.db,
      preferences: createMemoryPreferences(),
    });

    expect(repo.playerCount()).toBe(0);
    expect(repo.getViewerId()).toBeNull();
    expect(repo.getSeason()).toBeNull();
    handle.close();
  });

  it('treats a refresh with no source as nothing to do, not as a failure', async () => {
    // There is no upstream yet, and the roster is already showing everything there is.
    // An error here would put a working, hand-filled roster behind "The ladder could not
    // be read" — see `RosterUiState`, where any failure replaces the whole list.
    const handle = createTestDatabase();
    const repo = createRosterRepository({
      db: handle.db,
      preferences: createMemoryPreferences(),
    });
    repo.createPlayer(localDraft('Nyx'));

    expect((await repo.refresh()).ok).toBe(true);
    expect(repo.playerCount()).toBe(1);
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

/**
 * ADR-0020. The rules protected here are the two `core/db/write.ts` names as its job:
 * ranks stay one contiguous 1..N list, and a sync may not take a row the user entered.
 * Both break silently — a duplicate rank renders perfectly — so each is asserted as the
 * shape of the whole list rather than as one row.
 */
const ranksOf = (repo: ReturnType<typeof repositoryOn>): number[] => {
  const live = repo.observeRoster('RANK', '');
  return live.map(live.query.all()).map((entry) => entry.player.rank);
};

const localDraft = (name: string): PlayerDraft => ({
  name,
  combatPower: 500,
  score: 10,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

describe('rosterRepository — adding a player by hand', () => {
  let handle: TestDatabase;

  beforeEach(async () => {
    handle = createTestDatabase();
    await repositoryOn(handle).refresh();
  });

  afterEach(() => handle.close());

  it('appends the new player at the bottom of the ladder', () => {
    const repo = repositoryOn(handle);
    const created = repo.createPlayer(localDraft('Nyx'));

    expect(created.ok).toBe(true);
    expect(isOk(created) && created.value.rank).toBe(5);
    expect(ranksOf(repo)).toEqual([1, 2, 3, 4, 5]);
  });

  it('trims the stored name, so the roster cannot hold a padded duplicate', () => {
    const repo = repositoryOn(handle);
    const created = repo.createPlayer(localDraft('  Nyx  '));
    expect(isOk(created) && created.value.name).toBe('Nyx');
  });

  it('scales the whole-percent crit into the basis points the column stores', () => {
    const repo = repositoryOn(handle);
    const created = repo.createPlayer({ ...localDraft('Nyx'), critPercent: 113 });

    expect(isOk(created) && created.value.critBp).toBe(1_130_000);
  });

  it('rejects a fractional crit, which is what the percent unit exists to catch', () => {
    // Had the draft carried basis points, the form would have multiplied first — and
    // 58.4127 * 10_000 is 584127, a valid bp that no validator downstream could question.
    const repo = repositoryOn(handle);
    const result = repo.createPlayer({ ...localDraft('Nyx'), critPercent: 58.4127 });

    expect(result.ok).toBe(false);
    expect(repo.playerCount()).toBe(4);
  });

  it('refuses a draft the validator rejects, without writing a row', () => {
    const repo = repositoryOn(handle);
    const before = repo.playerCount();

    const result = repo.createPlayer({ ...localDraft('Nyx'), name: '', atk: -1 });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(PlayerDraftRejected);
    // Both fields at once, so the form can put each message under its own input in one
    // pass rather than making the user fix them one submit at a time.
    const fields =
      !result.ok && result.error instanceof PlayerDraftRejected ? result.error.fields : {};
    expect(Object.keys(fields).sort()).toEqual(['atk', 'name']);
    expect(repo.playerCount()).toBe(before);
  });

  it('refuses a name already on the ladder, case-insensitively', () => {
    const repo = repositoryOn(handle);
    // The roster's own search is case-insensitive, so two players it cannot tell apart are
    // two the user cannot either.
    const result = repo.createPlayer(localDraft('aUrEl'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(PlayerDraftRejected);
    expect(repo.playerCount()).toBe(4);
  });

  it('marks the row as local, and leaves synced rows alone', () => {
    const repo = repositoryOn(handle);
    repo.createPlayer(localDraft('Nyx'));

    const live = repo.observeRoster('RANK', '');
    const entries = live.map(live.query.all());
    expect(
      entries.filter((entry) => entry.origin === 'LOCAL').map((entry) => entry.player.name),
    ).toEqual(['Nyx']);
    expect(entries.filter((entry) => entry.origin === 'REMOTE')).toHaveLength(4);
  });
});

describe('rosterRepository — editing and removing a hand-entered player', () => {
  let handle: TestDatabase;
  let repo: ReturnType<typeof repositoryOn>;
  let localId: PlayerId;

  beforeEach(async () => {
    handle = createTestDatabase();
    repo = repositoryOn(handle);
    await repo.refresh();
    const created = repo.createPlayer(localDraft('Nyx'));
    if (!isOk(created)) throw new Error('fixture: the player could not be created');
    localId = created.value.id;
  });

  afterEach(() => handle.close());

  it('rewrites the stats of a player this device added', () => {
    const result = repo.updatePlayer(localId, { ...localDraft('Nyx'), combatPower: 9_999 });

    expect(isOk(result) && result.value.combatPower).toBe(9_999);
  });

  it('lets a player keep their own name across an edit', () => {
    // Without `exceptId` in the duplicate check, saving a player without renaming them
    // collides with themselves — which is the most common edit there is.
    expect(repo.updatePlayer(localId, { ...localDraft('Nyx'), score: 42 }).ok).toBe(true);
  });

  it('refuses to edit a synced player, because the next sync would undo it', () => {
    const synced = asPlayerId('p-b');
    const result = repo.updatePlayer(synced, { ...localDraft('Brann'), combatPower: 1 });

    expect(result.ok).toBe(false);
    const live = repo.observePlayer(synced);
    expect(live.map(live.query.all())?.player.combatPower).toBe(400);
  });

  it('refuses to remove a synced player', () => {
    expect(repo.deletePlayer(asPlayerId('p-b')).ok).toBe(false);
    expect(repo.playerCount()).toBe(5);
  });

  it('closes the gap in the ranking when a player is removed', () => {
    const second = repo.createPlayer(localDraft('Orrin'));
    if (!isOk(second)) throw new Error('fixture: the second player could not be created');
    expect(ranksOf(repo)).toEqual([1, 2, 3, 4, 5, 6]);

    expect(repo.deletePlayer(localId).ok).toBe(true);

    // Rank 5 was removed, so the row below it moves up rather than leaving a hole.
    expect(ranksOf(repo)).toEqual([1, 2, 3, 4, 5]);
    const live = repo.observePlayer(second.value.id);
    expect(live.map(live.query.all())?.player.rank).toBe(5);
  });

  it('returns a failure rather than throwing for an id that was already removed', () => {
    expect(repo.deletePlayer(localId).ok).toBe(true);
    expect(repo.deletePlayer(localId).ok).toBe(false);
  });
});

describe('rosterRepository — a sync does not take the user data', () => {
  it('keeps hand-entered players and re-seats them below the new ladder', async () => {
    const handle = createTestDatabase();
    const repo = repositoryOn(handle);
    await repo.refresh();
    repo.createPlayer(localDraft('Nyx'));
    expect(ranksOf(repo)).toEqual([1, 2, 3, 4, 5]);

    // A ladder that shrank from four players to two. Without the preservation rule the
    // hand-entered player disappears; with a naive one they keep rank 5 beside a two-row
    // ladder, which is the prototype's rank-12-in-a-14-player-roster bug reinvented.
    const shrunk: RosterSnapshot = {
      season: 42,
      viewerId: FIXTURE.viewerId,
      players: FIXTURE.players.slice(0, 2),
      headToHead: [],
    };
    const second = repositoryOn(handle, sourceOf(shrunk));
    await second.refresh();

    expect(second.playerCount()).toBe(3);
    expect(namesOf(second, 'RANK')).toEqual(['Aurel', 'Brann', 'Nyx']);
    expect(ranksOf(second)).toEqual([1, 2, 3]);
    handle.close();
  });

  it('yields to the server when a sync claims the same id', async () => {
    const handle = createTestDatabase();
    const repo = repositoryOn(handle);
    await repo.refresh();
    const created = repo.createPlayer(localDraft('Nyx'));
    if (!isOk(created)) throw new Error('fixture: the player could not be created');

    // Upstream has caught up with this player. Two rows sharing one id is the only outcome
    // worse than losing the local edit, so the snapshot wins.
    const claiming: RosterSnapshot = {
      season: 42,
      viewerId: FIXTURE.viewerId,
      players: [...FIXTURE.players, player(created.value.id, 'Nyx', 5, 4242)],
      headToHead: [],
    };
    const second = repositoryOn(handle, sourceOf(claiming));
    await second.refresh();

    expect(second.playerCount()).toBe(5);
    const live = second.observePlayer(created.value.id);
    const detail = live.map(live.query.all());
    expect(detail?.player.combatPower).toBe(4242);
    expect(detail?.origin).toBe('REMOTE');
    handle.close();
  });
});
