/**
 * ROADMAP.md 4.10.3's exit criteria: the roster can leave the device and come back.
 *
 * A wipe is modelled as a second database with a second preference store — which is what an
 * uninstall or a "clear data" tap actually leaves behind — rather than by deleting rows from
 * the first. Restoring into the database that still remembers everything would prove nothing
 * about the case the feature exists for.
 *
 * Every refusal below asserts that the database was **not touched**, because "refuses before
 * writing" is the property that decides whether a bad file costs the user their roster.
 */

import { SCHEMA_VERSION } from '../db';
import { asPlayerId, type PlayerDraft, type PlayerId } from '../model';
import { createMemoryPreferences, type ArenaPreferences } from '../prefs';
import { createTestDatabase, type TestDatabase } from '../testing';
import {
  BACKUP_FORMAT,
  backupFileName,
  parseRosterBackup,
  serialiseBackup,
  type RosterBackup,
} from './rosterBackup';
import { createRosterRepository, type RosterRepository } from './rosterRepository';

const draft = (name: string, combatPower: number): PlayerDraft => ({
  name,
  level: 400 + combatPower,
  gameCode: `a${combatPower}`,
  combatPower,
  score: 1_000 + combatPower,
  hp: 5_000_000 + combatPower,
  atk: 1_000_000 + combatPower,
  def: 2_000_000 + combatPower,
  critPercent: 58,
  hit: 3_000_000 + combatPower,
  spd: 4_000_000 + combatPower,
});

interface Device {
  handle: TestDatabase;
  repository: RosterRepository;
  preferences: ArenaPreferences;
}

/** A phone: one database, one preference store, one repository over them. */
const device = (): Device => {
  const handle = createTestDatabase();
  const preferences = createMemoryPreferences();
  return {
    handle,
    preferences,
    repository: createRosterRepository({ db: handle.db, preferences }),
  };
};

/** The ladder as anyone can see it, for comparing one device against another. */
const ladderOf = (repository: RosterRepository) => {
  const live = repository.observeRoster('RANK', '');
  return live.map(live.query.all()).map((entry) => ({
    id: entry.player.id,
    name: entry.player.name,
    rank: entry.player.rank,
    combatPower: entry.player.combatPower,
    critBp: entry.player.critBp,
    gameCode: entry.player.gameCode,
    level: entry.player.level,
    hp: entry.player.hp,
    origin: entry.origin,
    isViewer: entry.isViewer,
    record: entry.record === null ? null : { wins: entry.record.wins, losses: entry.record.losses },
  }));
};

/** Three players, a chosen avatar, and two records — one of them a loss column. */
const fill = (source: Device): { me: PlayerId; rival: PlayerId; third: PlayerId } => {
  const me = source.repository.createPlayer(draft('Ärä', 900));
  const rival = source.repository.createPlayer(draft('Brann', 400));
  const third = source.repository.createPlayer(draft('Cinder', 200));
  if (!me.ok || !rival.ok || !third.ok) throw new Error('fixture: a player was refused');

  expect(source.repository.setViewerId(me.value.id).ok).toBe(true);
  expect(source.repository.recordMatch(rival.value.id, 'WIN').ok).toBe(true);
  expect(source.repository.recordMatch(rival.value.id, 'WIN').ok).toBe(true);
  expect(source.repository.recordMatch(third.value.id, 'LOSS').ok).toBe(true);

  return { me: me.value.id, rival: rival.value.id, third: third.value.id };
};

describe('rosterBackup — a roster survives the device it was typed on', () => {
  let source: Device;
  let wiped: Device;

  beforeEach(() => {
    source = device();
    wiped = device();
  });

  afterEach(() => {
    source.handle.close();
    wiped.handle.close();
  });

  it('comes back as the same ladder, in the same order, on a device that had nothing', () => {
    fill(source);
    const before = ladderOf(source.repository);
    const file = serialiseBackup(source.repository.exportSnapshot());

    expect(ladderOf(wiped.repository)).toEqual([]);
    const imported = wiped.repository.importSnapshot(file);

    expect(imported.ok).toBe(true);
    expect(ladderOf(wiped.repository)).toEqual(before);
  });

  it('brings the avatar with it, so the restored roster still has a hero card', () => {
    const { me } = fill(source);
    const file = serialiseBackup(source.repository.exportSnapshot());

    expect(wiped.repository.getViewerId()).toBeNull();
    expect(wiped.repository.importSnapshot(file).ok).toBe(true);

    expect(wiped.repository.getViewerId()).toBe(me);
    expect(ladderOf(wiped.repository).find((row) => row.isViewer)?.name).toBe('Ärä');
  });

  it('brings every head-to-head with it, wins and losses apart', () => {
    const { rival, third } = fill(source);
    expect(
      wiped.repository.importSnapshot(serialiseBackup(source.repository.exportSnapshot())).ok,
    ).toBe(true);

    const restored = ladderOf(wiped.repository);
    expect(restored.find((row) => row.id === rival)?.record).toEqual({ wins: 2, losses: 0 });
    expect(restored.find((row) => row.id === third)?.record).toEqual({ wins: 0, losses: 1 });
  });

  /**
   * The reason this is not a round trip through `RosterSnapshot`. Every row here was typed
   * in by hand, so a restore that dropped `origin` would hand back a ladder the user may
   * neither edit nor delete — and nothing on screen would say why.
   */
  it('restores a hand-entered player as still hand-entered, and therefore still editable', () => {
    const { rival } = fill(source);
    expect(
      wiped.repository.importSnapshot(serialiseBackup(source.repository.exportSnapshot())).ok,
    ).toBe(true);

    expect(ladderOf(wiped.repository).every((row) => row.origin === 'LOCAL')).toBe(true);
    expect(wiped.repository.updatePlayer(rival, draft('Brann', 450)).ok).toBe(true);
  });

  it('is a replace, not a merge: the roster being restored over does not survive it', () => {
    fill(source);
    const stranger = wiped.repository.createPlayer(draft('Deus', 700));
    expect(stranger.ok).toBe(true);

    expect(
      wiped.repository.importSnapshot(serialiseBackup(source.repository.exportSnapshot())).ok,
    ).toBe(true);

    expect(ladderOf(wiped.repository).map((row) => row.name)).toEqual(['Ärä', 'Brann', 'Cinder']);
  });

  it('finds a restored name by searching for it, because the fold is rebuilt on the way in', () => {
    fill(source);
    expect(
      wiped.repository.importSnapshot(serialiseBackup(source.repository.exportSnapshot())).ok,
    ).toBe(true);

    const live = wiped.repository.observeRoster('RANK', 'ärä');
    expect(live.map(live.query.all()).map((entry) => entry.player.name)).toEqual(['Ärä']);
  });

  it('reports what it restored, so the screen can say more than "done"', () => {
    fill(source);
    const imported = wiped.repository.importSnapshot(
      serialiseBackup(source.repository.exportSnapshot()),
    );

    expect(imported.ok && imported.value).toEqual({ players: 3, records: 2, season: null });
  });

  it('exports an empty roster rather than refusing one, because that is a valid answer', () => {
    const file = serialiseBackup(source.repository.exportSnapshot());
    const imported = wiped.repository.importSnapshot(file);

    expect(imported.ok && imported.value.players).toBe(0);
    expect(wiped.repository.getViewerId()).toBeNull();
  });

  it('forgets the old avatar when the file carries none, rather than pointing at a gone row', () => {
    const stranger = wiped.repository.createPlayer(draft('Deus', 700));
    expect(stranger.ok && wiped.repository.setViewerId(stranger.value.id).ok).toBe(true);

    expect(
      wiped.repository.importSnapshot(serialiseBackup(source.repository.exportSnapshot())).ok,
    ).toBe(true);

    expect(wiped.repository.getViewerId()).toBeNull();
  });
});

describe('rosterBackup — the file a person has to be able to read', () => {
  let source: Device;

  beforeEach(() => {
    source = device();
  });
  afterEach(() => source.handle.close());

  it('is indented text with one field per line, not one long line', () => {
    fill(source);
    const file = serialiseBackup(source.repository.exportSnapshot());

    expect(file.split('\n').length).toBeGreaterThan(20);
    expect(file).toContain('\n  "players": [');
  });

  it('spells a name the way the user typed it, accents and all', () => {
    fill(source);
    expect(serialiseBackup(source.repository.exportSnapshot())).toContain('"name": "Ärä"');
  });

  it('says what it is and what it was written at, at the top of the file', () => {
    const backup = source.repository.exportSnapshot();
    const file = serialiseBackup(backup);

    expect(file.startsWith(`{\n  "format": "${BACKUP_FORMAT}",\n`)).toBe(true);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false);
  });

  /** The fold is derived on the way in, so a document carrying one could only disagree. */
  it('does not carry the folded name, which is the database’s business and not the file’s', () => {
    fill(source);
    expect(serialiseBackup(source.repository.exportSnapshot())).not.toContain('nameFolded');
  });

  it('names the file after the day it was written', () => {
    expect(backupFileName('2026-09-07T10:20:30.000Z')).toBe('arena-scout-roster-2026-09-07.json');
  });
});

describe('rosterBackup — what an import refuses, before it writes anything', () => {
  let device_: Device;
  let existing: ReturnType<typeof ladderOf>;

  beforeEach(() => {
    device_ = device();
    fill(device_);
    existing = ladderOf(device_.repository);
  });
  afterEach(() => device_.handle.close());

  /** Every refusal has to leave the roster exactly as it was. */
  const refuse = (text: string): string => {
    const imported = device_.repository.importSnapshot(text);
    expect(imported.ok).toBe(false);
    expect(ladderOf(device_.repository)).toEqual(existing);
    return imported.ok ? '' : imported.error.message;
  };

  const good = (): RosterBackup => device_.repository.exportSnapshot();

  it('refuses a truncated file, and says the file is damaged', () => {
    const file = serialiseBackup(good());
    expect(refuse(file.slice(0, Math.floor(file.length / 2)))).toContain('damaged');
  });

  it('refuses an empty file, which is what a failed copy leaves behind', () => {
    expect(refuse('')).toContain('damaged');
  });

  it('refuses a file that is not ours, and says so rather than describing a roster', () => {
    const message = refuse(JSON.stringify({ name: 'arena-scout', version: '0.1.0' }, null, 2));
    expect(message).toContain('not an Arena Scout roster');
  });

  it('refuses JSON that is not even an object', () => {
    expect(refuse('[1, 2, 3]')).toContain('not an Arena Scout roster');
  });

  it('refuses a future schema version, and names both versions', () => {
    const message = refuse(serialiseBackup({ ...good(), schemaVersion: SCHEMA_VERSION + 1 }));

    expect(message).toContain(`schema version ${SCHEMA_VERSION + 1}`);
    expect(message).toContain(`up to ${SCHEMA_VERSION}`);
  });

  it('accepts an older schema version, because the alternative is telling somebody their only copy is unreadable', () => {
    // A document from before `origin`, `level`, `gameCode` and `hp` existed: exactly the
    // columns the schema defaults, and exactly what those defaults are for.
    const older = {
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      season: 40,
      viewerId: 'p-a',
      players: [
        {
          id: 'p-a',
          name: 'Aurel',
          rank: 1,
          combatPower: 100,
          score: 10,
          atk: 1,
          def: 2,
          critBp: 3,
          hit: 4,
          spd: 5,
        },
      ],
      headToHead: [],
    };

    const imported = device_.repository.importSnapshot(JSON.stringify(older));

    expect(imported.ok).toBe(true);
    expect(ladderOf(device_.repository)).toEqual([
      {
        id: 'p-a',
        name: 'Aurel',
        rank: 1,
        combatPower: 100,
        critBp: 3,
        gameCode: '',
        level: 0,
        hp: 0,
        origin: 'REMOTE',
        isViewer: true,
        record: null,
      },
    ]);
  });

  /**
   * The file is human-readable and therefore hand-editable, so a restore normalises what it
   * writes exactly as the form does — a padded name or a `#`-prefixed code typed back in by
   * hand has to land in the table in the one shape every lookup expects.
   */
  it('normalises a name and a code somebody wrote back into the file by hand', () => {
    const backup = good();
    const [first, ...rest] = backup.players;
    expect(first).toBeDefined();

    // A code with a letter past `f` in it, deliberately: the design-token rule reads
    // `#a984` — the shape the game actually prints — as a hex colour, and this is a test
    // fixture rather than a reason to silence the rule.
    const edited = { ...first!, name: '  Deus  ', gameCode: '#Zq7k' };
    const imported = device_.repository.importSnapshot(
      serialiseBackup({ ...backup, players: [edited, ...rest] }),
    );
    expect(imported.ok).toBe(true);

    const restored = ladderOf(device_.repository).find((row) => row.id === edited.id);
    expect(restored?.name).toBe('Deus');
    expect(restored?.gameCode).toBe('zq7k');
    // ...and the screenshot import can still find them, which is what normalising buys.
    expect(device_.repository.findImportMatch('deus', 'zq7k')?.player.id).toBe(edited.id);
  });

  it('refuses a player missing a stat, rather than restoring a zero nobody typed', () => {
    const backup = good();
    const [first, ...rest] = backup.players;
    expect(first).toBeDefined();
    const { spd: _spd, ...withoutSpd } = { ...first };
    const message = refuse(JSON.stringify({ ...backup, players: [withoutSpd, ...rest] }, null, 2));

    expect(message).toContain('Player 1');
    expect(message).toContain('spd');
  });

  it('refuses a stat that is not a whole number this app can hold', () => {
    const backup = good();
    const [first, ...rest] = backup.players;
    expect(first).toBeDefined();
    const message = refuse(
      JSON.stringify({ ...backup, players: [{ ...first, combatPower: 1.5 }, ...rest] }, null, 2),
    );

    expect(message).toContain('combatPower');
  });

  it('refuses two players sharing an id, which the primary key could not hold anyway', () => {
    const backup = good();
    const [first] = backup.players;
    expect(first).toBeDefined();
    expect(refuse(serialiseBackup({ ...backup, players: [first!, first!] }))).toContain('repeats');
  });

  it('refuses a record against a player the file does not carry', () => {
    const backup = good();
    const [me] = backup.players;
    expect(me).toBeDefined();
    const message = refuse(
      serialiseBackup({
        ...backup,
        headToHead: [
          { viewerId: asPlayerId(me!.id), opponentId: asPlayerId('nobody'), wins: 1, losses: 0 },
        ],
      }),
    );

    expect(message).toContain('does not carry');
  });

  it('refuses a record with a negative column, which counts matches that did not happen', () => {
    const backup = good();
    const [record, ...rest] = backup.headToHead;
    expect(record).toBeDefined();
    expect(
      refuse(serialiseBackup({ ...backup, headToHead: [{ ...record!, wins: -1 }, ...rest] })),
    ).toContain('wins');
  });

  it('refuses a record of a player against themselves, which no screen can show or undo', () => {
    const backup = good();
    const [me] = backup.players;
    expect(me).toBeDefined();
    const message = refuse(
      serialiseBackup({
        ...backup,
        headToHead: [
          { viewerId: asPlayerId(me!.id), opponentId: asPlayerId(me!.id), wins: 1, losses: 0 },
        ],
      }),
    );

    expect(message).toContain('against themselves');
  });

  it('refuses an avatar the file does not carry, rather than restoring a roster with no hero card', () => {
    const message = refuse(serialiseBackup({ ...good(), viewerId: 'nobody' }));
    expect(message).toContain('avatar');
  });
});

describe('parseRosterBackup — the reader on its own', () => {
  const minimal: RosterBackup = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-07T10:20:30.000Z',
    season: null,
    viewerId: null,
    players: [],
    headToHead: [],
  };

  it('round-trips its own output', () => {
    const parsed = parseRosterBackup(serialiseBackup(minimal));
    expect(parsed.ok && parsed.value).toEqual(minimal);
  });

  it('reads a document with no exportedAt, which is a note to the reader and not data', () => {
    const { exportedAt: _dropped, ...withoutDate } = minimal;
    const parsed = parseRosterBackup(JSON.stringify(withoutDate));

    expect(parsed.ok && parsed.value.exportedAt).toBe('');
  });

  it('refuses a schema version that is not a version', () => {
    const parsed = parseRosterBackup(JSON.stringify({ ...minimal, schemaVersion: '4' }));
    expect(parsed.ok).toBe(false);
  });

  it('refuses players that are not a list', () => {
    const parsed = parseRosterBackup(JSON.stringify({ ...minimal, players: {} }));
    expect(parsed.ok).toBe(false);
  });
});
