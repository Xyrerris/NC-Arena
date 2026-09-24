/**
 * The push half, from the repository's side (ADR-0035, decision 3).
 *
 * The case worth the file is the `LOCAL` -> `REMOTE` transition: a row the user typed in has
 * one id here and a different one upstream, and the sync has to end with the roster holding
 * the row once, under the server's id, with the matches swiped against it still attached.
 * Each half of that fails silently on its own — a duplicated row still renders, and a record
 * whose end no longer exists just disappears from a screen that had nothing to say about it.
 */

import {
  err,
  ok,
  type Result,
  type RosterPush,
  type RosterPushResult,
  type RosterSnapshot,
  type RosterSource,
} from '../common';
import { headToHead, players } from '../db';
import { asPlayerId, type Player, type PlayerDraft, type PlayerId } from '../model';
import { createMemoryPreferences, type ArenaPreferences } from '../prefs';
import { createTestDatabase, type TestDatabase } from '../testing';
import { createRosterRepository } from './rosterRepository';

const SERVER_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SERVER_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const draft = (name: string): PlayerDraft => ({
  name,
  level: 12,
  gameCode: '',
  combatPower: 500,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const remotePlayer = (id: string, name: string, rank: number): Player => ({
  id: asPlayerId(id),
  name,
  level: 12,
  gameCode: '',
  rank,
  combatPower: 500,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critBp: 30_000,
  hit: 4,
  spd: 5,
});

/** Records what the repository pushed, and answers with whatever the test wants back. */
const createSpySink = (
  reply: (push: RosterPush) => Result<RosterPushResult>,
  options: { onSetViewer?: (id: PlayerId) => Result<void> } = {},
) => {
  const pushes: RosterPush[] = [];
  const seated: PlayerId[] = [];
  return {
    pushes,
    seated,
    sink: {
      name: 'spy',
      pushRoster: (push: RosterPush) => {
        pushes.push(push);
        return Promise.resolve(reply(push));
      },
      setViewer: (id: PlayerId) => {
        seated.push(id);
        return Promise.resolve(options.onSetViewer?.(id) ?? ok(undefined));
      },
    },
  };
};

const createStubSource = (snapshots: RosterSnapshot[]): RosterSource => ({
  name: 'stub',
  fetchRoster: () =>
    Promise.resolve(
      ok(
        snapshots.shift() ?? {
          season: 1,
          viewerId: asPlayerId('none'),
          players: [],
          headToHead: [],
        },
      ),
    ),
});

describe('syncRoster — a hand-entered row becomes a server row', () => {
  let handle: TestDatabase;
  let preferences: ArenaPreferences;

  beforeEach(() => {
    handle = createTestDatabase();
    preferences = createMemoryPreferences();
  });

  afterEach(() => {
    handle.close();
  });

  it('pushes the local rows, and sends no edits when no synced row was changed', async () => {
    const spy = createSpySink(() => ok({ snapshot: null, assignedIds: new Map() }));
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences,
    });
    repo.createPlayer(draft('Nyx'));
    repo.createPlayer(draft('Orrin'));

    await repo.syncRoster();

    expect(spy.pushes).toHaveLength(1);
    expect(spy.pushes[0]?.newPlayers.map((p) => p.name)).toEqual(['Nyx', 'Orrin']);
    // Both rows are LOCAL, so they travel whole as new players; there is nothing to edit.
    expect(spy.pushes[0]?.editedPlayers).toEqual([]);
  });

  it('holds back a record whose opponent the server has never heard of', async () => {
    const spy = createSpySink(() => ok({ snapshot: null, assignedIds: new Map() }));
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences,
    });
    const me = repo.createPlayer(draft('Nyx'));
    const them = repo.createPlayer(draft('Orrin'));
    if (!me.ok || !them.ok) throw new Error('fixture');
    repo.setViewerId(me.value.id);
    repo.recordMatch(them.value.id, 'WIN');

    await repo.syncRoster();

    // Both ends are `local-…`, which the wire types as a uuid and the server has no row for.
    // The record is not lost — it is still in SQLite — it is simply not pushable yet.
    expect(spy.pushes[0]?.headToHead).toEqual([]);
  });

  it('carries the match record across the transition, re-pointed at the server id', async () => {
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: createSpySink((push) => {
        const [me, them] = push.newPlayers;
        if (!me || !them) throw new Error('expected two rows to be pushed');
        return ok({
          snapshot: {
            season: 41,
            viewerId: asPlayerId(SERVER_A),
            players: [remotePlayer(SERVER_A, me.name, 1), remotePlayer(SERVER_B, them.name, 2)],
            headToHead: [],
          },
          assignedIds: new Map([
            [me.id, asPlayerId(SERVER_A)],
            [them.id, asPlayerId(SERVER_B)],
          ]),
        });
      }).sink,
      preferences,
    });

    const me = repo.createPlayer(draft('Nyx'));
    const them = repo.createPlayer(draft('Orrin'));
    if (!me.ok || !them.ok) throw new Error('fixture');
    repo.setViewerId(me.value.id);
    repo.recordMatch(them.value.id, 'WIN');
    repo.recordMatch(them.value.id, 'WIN');

    const result = await repo.syncRoster();
    expect(result.ok).toBe(true);

    // The roster holds each row once, under the server's id, owned by the server now.
    const rows = handle.db.select().from(players).all();
    expect(rows.map((row) => row.id).sort()).toEqual([SERVER_A, SERVER_B].sort());
    expect(rows.every((row) => row.origin === 'REMOTE')).toBe(true);

    // And the two wins are still there, against the id that row has become.
    const records = handle.db.select().from(headToHead).all();
    expect(records).toEqual([
      expect.objectContaining({ viewerId: SERVER_A, opponentId: SERVER_B, wins: 2, losses: 0 }),
    ]);

    // The viewer preference followed the same id rather than pointing at a row that is gone.
    expect(preferences.getViewerId()).toBe(SERVER_A);
  });

  it('seats the viewer upstream and pulls again when the account has none yet', async () => {
    const spy = createSpySink((push) => {
      const [me] = push.newPlayers;
      if (!me) throw new Error('expected a row');
      // What a freshly created account answers: the rows landed, but nobody is the viewer,
      // so no snapshot can be built from it.
      return ok({ snapshot: null, assignedIds: new Map([[me.id, asPlayerId(SERVER_A)]]) });
    });
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([
        {
          season: 41,
          viewerId: asPlayerId(SERVER_A),
          players: [remotePlayer(SERVER_A, 'Nyx', 1)],
          headToHead: [],
        },
      ]),
      sink: spy.sink,
      preferences,
    });

    const me = repo.createPlayer(draft('Nyx'));
    if (!me.ok) throw new Error('fixture');
    repo.setViewerId(me.value.id);

    const result = await repo.syncRoster();

    expect(result.ok).toBe(true);
    // Seated by the id the push just assigned, never by the local one the server cannot resolve.
    expect(spy.seated).toEqual([SERVER_A]);
    expect(
      handle.db
        .select()
        .from(players)
        .all()
        .map((row) => row.id),
    ).toEqual([SERVER_A]);
  });

  it('succeeds without applying anything when nobody is the viewer yet', async () => {
    const spy = createSpySink((push) => {
      const [me] = push.newPlayers;
      if (!me) throw new Error('expected a row');
      return ok({ snapshot: null, assignedIds: new Map([[me.id, asPlayerId(SERVER_A)]]) });
    });
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences,
    });
    repo.createPlayer(draft('Nyx'));

    const result = await repo.syncRoster();

    // The rows are upstream and the push is idempotent, so the next sync re-sends them and is
    // answered with the same ids. What is missing is a choice the user has not made.
    expect(result.ok).toBe(true);
    expect(spy.seated).toEqual([]);
    const rows = handle.db.select().from(players).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origin).toBe('LOCAL');
  });

  it('reports a failed push and leaves the roster untouched', async () => {
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: createSpySink(() => err(new Error('backend: OFFLINE — no network'))).sink,
      preferences,
    });
    repo.createPlayer(draft('Nyx'));

    const result = await repo.syncRoster();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('OFFLINE');
    const rows = handle.db.select().from(players).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origin).toBe('LOCAL');
  });

  it('falls back to a pull when there is nothing to push to', async () => {
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([
        {
          season: 41,
          viewerId: asPlayerId(SERVER_A),
          players: [remotePlayer(SERVER_A, 'Nyx', 1)],
          headToHead: [],
        },
      ]),
      preferences,
    });

    const result = await repo.syncRoster();

    expect(result.ok).toBe(true);
    expect(
      handle.db
        .select()
        .from(players)
        .all()
        .map((row) => row.id),
    ).toEqual([SERVER_A]);
  });

  it('pushes a record once both of its ends are rows the server owns', async () => {
    const spy = createSpySink(() => ok({ snapshot: null, assignedIds: new Map() }));
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences: createMemoryPreferences({ viewerId: asPlayerId(SERVER_A) }),
    });

    // A ladder that has already synced: both rows are REMOTE, so both ids are server ids.
    handle.db
      .insert(players)
      .values([
        { ...remotePlayer(SERVER_A, 'Nyx', 1), nameFolded: 'nyx', origin: 'REMOTE' },
        { ...remotePlayer(SERVER_B, 'Orrin', 2), nameFolded: 'orrin', origin: 'REMOTE' },
      ])
      .run();
    handle.db
      .insert(headToHead)
      .values([{ viewerId: SERVER_A, opponentId: SERVER_B, wins: 3, losses: 1 }])
      .run();

    await repo.syncRoster();

    expect(spy.pushes[0]?.headToHead).toEqual([
      { viewerId: SERVER_A, opponentId: SERVER_B, wins: 3, losses: 1 },
    ]);
  });
});

/**
 * ADR-0036: a synced row is as editable as a hand-entered one, on every device on the account.
 * The edit has to survive until the server has it — a pull that lands first may not undo it —
 * and has to stop being "pending" once the push that carried it has been answered.
 */
describe('syncRoster — an edit to a synced row', () => {
  let handle: TestDatabase;
  const preferences = (): ArenaPreferences =>
    createMemoryPreferences({ viewerId: asPlayerId(SERVER_A) });

  /** A ladder that has already synced: two REMOTE rows, as a linked device would hold them. */
  const seedSynced = (): void => {
    handle.db
      .insert(players)
      .values([
        { ...remotePlayer(SERVER_A, 'Nyx', 1), nameFolded: 'nyx', origin: 'REMOTE' },
        { ...remotePlayer(SERVER_B, 'Orrin', 2), nameFolded: 'orrin', origin: 'REMOTE' },
      ])
      .run();
  };

  /** What the server holds before it has seen any edit. */
  const unedited: RosterSnapshot = {
    season: 41,
    viewerId: asPlayerId(SERVER_A),
    players: [remotePlayer(SERVER_A, 'Nyx', 1), remotePlayer(SERVER_B, 'Orrin', 2)],
    headToHead: [],
  };

  const combatPowerOf = (id: string): number | undefined =>
    handle.db
      .select()
      .from(players)
      .all()
      .find((row) => row.id === id)?.combatPower;

  const editedAtOf = (id: string): number | null | undefined =>
    handle.db
      .select()
      .from(players)
      .all()
      .find((row) => row.id === id)?.editedAt;

  beforeEach(() => {
    handle = createTestDatabase();
    seedSynced();
  });

  afterEach(() => {
    handle.close();
  });

  it('pushes it as an edit under the server id, and settles it once the server answers', async () => {
    const spy = createSpySink((push) => {
      const [edit] = push.editedPlayers;
      if (!edit) throw new Error('expected an edit');
      // The server applied it, so its snapshot carries the new value.
      return ok({
        snapshot: {
          ...unedited,
          players: [remotePlayer(SERVER_A, 'Nyx', 1), { ...edit, rank: 2 }],
        },
        assignedIds: new Map(),
      });
    });
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences: preferences(),
    });

    expect(
      repo.updatePlayer(asPlayerId(SERVER_B), { ...draft('Orrin'), combatPower: 9_000 }).ok,
    ).toBe(true);
    expect(editedAtOf(SERVER_B)).not.toBeNull();

    expect((await repo.syncRoster()).ok).toBe(true);

    expect(spy.pushes[0]?.newPlayers).toEqual([]);
    expect(spy.pushes[0]?.editedPlayers).toEqual([
      expect.objectContaining({ id: SERVER_B, combatPower: 9_000 }),
    ]);
    expect(combatPowerOf(SERVER_B)).toBe(9_000);
    // Settled: the next sync has nothing to send.
    expect(editedAtOf(SERVER_B)).toBeNull();
  });

  it('keeps an edit made while the sync was in flight, and pushes it next time', async () => {
    let repo: ReturnType<typeof createRosterRepository> | undefined;
    const spy = createSpySink(() => {
      // The user saves again before the answer arrives. The snapshot below knows nothing
      // about this second edit, and must not be allowed to undo it.
      repo?.updatePlayer(asPlayerId(SERVER_B), { ...draft('Orrin'), combatPower: 7_777 });
      return ok({
        snapshot: {
          ...unedited,
          players: [
            remotePlayer(SERVER_A, 'Nyx', 1),
            { ...remotePlayer(SERVER_B, 'Orrin', 2), combatPower: 9_000 },
          ],
        },
        assignedIds: new Map(),
      });
    });
    repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([]),
      sink: spy.sink,
      preferences: preferences(),
    });

    repo.updatePlayer(asPlayerId(SERVER_B), { ...draft('Orrin'), combatPower: 9_000 });
    // Make sure the in-flight save gets a later stamp than the one the push carries.
    const pushedAt = editedAtOf(SERVER_B) ?? 0;
    jest.spyOn(Date, 'now').mockReturnValue(pushedAt + 1);

    await repo.syncRoster();
    jest.restoreAllMocks();

    expect(combatPowerOf(SERVER_B)).toBe(7_777);
    expect(editedAtOf(SERVER_B)).toBe(pushedAt + 1);

    await repo.syncRoster();
    expect(spy.pushes[1]?.editedPlayers).toEqual([
      expect.objectContaining({ id: SERVER_B, combatPower: 7_777 }),
    ]);
  });

  it('is not undone by a pull that runs before it was pushed', async () => {
    // No sink: `syncRoster` falls back to a plain pull, which pushes nothing.
    const repo = createRosterRepository({
      db: handle.db,
      source: createStubSource([{ ...unedited, season: 42 }]),
      preferences: preferences(),
    });
    repo.updatePlayer(asPlayerId(SERVER_B), { ...draft('Orrin'), combatPower: 9_000 });

    expect((await repo.syncRoster()).ok).toBe(true);

    expect(combatPowerOf(SERVER_B)).toBe(9_000);
    // Still pending, so the next sync that can push will.
    expect(editedAtOf(SERVER_B)).not.toBeNull();
  });
});
