/**
 * ROADMAP.md 4.10.3's exit criteria, from the screen rather than from the repository: the
 * roster leaves through a control somebody can press, and comes back through another.
 *
 * Rendered over a **real** `better-sqlite3` database like every other screen test, and over
 * a fake `BackupFile` — so "the roster was exported" is an assertion about the bytes handed
 * to the share sheet, and "the roster was restored" is one about the rows that are in the
 * table afterwards. Neither is an assertion about a spy having been called.
 *
 * The confirmation `Alert` is driven the way the delete control's is: the button is pressed
 * by reaching into the mocked `Alert.alert`, because a system dialog has no test id.
 *
 * jest-expo runs at fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type Result } from '@/core/common';
import {
  ArenaDataProvider,
  serialiseBackup,
  type BackupFile,
  type RosterRepository,
} from '@/core/data';
import type { PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { RosterBackupControls } from './RosterBackupControls';
import { IMPORT_CONFIRM_REPLACE, IMPORT_CONFIRM_TITLE } from './rosterBackupUiState';

const draft = (name: string, combatPower: number): PlayerDraft => ({
  name,
  level: 400,
  gameCode: '',
  combatPower,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const wrapWith = (repository: RosterRepository) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ArenaDataProvider value={{ repository, useLiveData: createStubLiveData() }}>
          {children}
        </ArenaDataProvider>
      </SafeAreaProvider>
    );
  };

/**
 * A share sheet and a file picker that never existed. `written` is what the user would have
 * saved; `offered` is what they would have picked.
 */
interface FakeBackupFile extends BackupFile {
  written: { fileName: string; contents: string }[];
}

const fakeFile = (
  offered: () => Promise<Result<string | null>>,
  onWrite: () => Result<void> = () => ok(undefined),
): FakeBackupFile => {
  const written: { fileName: string; contents: string }[] = [];
  return {
    name: 'fake',
    written,
    write: async (fileName, contents) => {
      written.push({ fileName, contents });
      return onWrite();
    },
    read: offered,
  };
};

const startAct = (): void => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
};

/** Presses the destructive button in the confirmation the import opens. */
const confirmReplace = (alert: jest.SpyInstance<typeof Alert.alert>): void => {
  const call = alert.mock.calls[alert.mock.calls.length - 1] as
    [string, string, AlertButton[]] | undefined;
  expect(call?.[0]).toBe(IMPORT_CONFIRM_TITLE);
  const replace = (call?.[2] ?? []).find((button) => button.text === IMPORT_CONFIRM_REPLACE);
  expect(replace).toBeDefined();
  replace?.onPress?.();
};

describe('RosterBackupControls', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let alert: jest.SpyInstance<typeof Alert.alert>;

  beforeEach(() => {
    startAct();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined) as never;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
  });

  afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    handle.close();
  });

  const fill = (): void => {
    const me = repository.createPlayer(draft('Ärä', 900));
    const rival = repository.createPlayer(draft('Brann', 400));
    if (!me.ok || !rival.ok) throw new Error('fixture: a player was refused');
    expect(repository.setViewerId(me.value.id).ok).toBe(true);
    expect(repository.recordMatch(rival.value.id, 'WIN').ok).toBe(true);
  };

  it('says what is at stake, counting both the players and the records', async () => {
    fill();
    await render(<RosterBackupControls file={fakeFile(async () => ok(null))} />, {
      wrapper: wrapWith(repository),
    });

    expect(screen.getByTestId('roster-backup-stakes').props.children).toContain(
      '2 players and 1 record',
    );
  });

  it('offers nothing to export while the ladder is empty, and says why', async () => {
    await render(<RosterBackupControls file={fakeFile(async () => ok(null))} />, {
      wrapper: wrapWith(repository),
    });

    expect(screen.getByTestId('roster-backup-export').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('roster-backup-stakes').props.children).toContain(
      'nothing on the ladder yet',
    );
  });

  it('hands the whole roster to the share sheet, as a file named after today', async () => {
    fill();
    const file = fakeFile(async () => ok(null));
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('roster-backup-export'));

    await waitFor(() => expect(file.written).toHaveLength(1));
    const [saved] = file.written;
    expect(saved?.fileName).toMatch(/^arena-scout-roster-\d{4}-\d{2}-\d{2}\.json$/);
    expect(saved?.contents).toContain('"name": "Ärä"');
    await waitFor(() => expect(screen.getByTestId('roster-backup-note')).toBeTruthy());
  });

  it('says what went wrong when the share sheet refuses, rather than claiming a save', async () => {
    fill();
    const file = fakeFile(
      async () => ok(null),
      () => err(new Error('No app on this device can take a file.')),
    );
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('roster-backup-export'));

    await waitFor(() =>
      expect(screen.getByTestId('roster-backup-error').props.children).toBe(
        'No app on this device can take a file.',
      ),
    );
  });

  it('asks before replacing, and does nothing at all if the question is dismissed', async () => {
    fill();
    const file = fakeFile(async () => ok(serialiseBackup(repository.exportSnapshot())));
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('roster-backup-import'));

    expect(Alert.alert).toHaveBeenCalled();
    // The picker was never opened: dismissing the question is the end of it.
    expect(screen.queryByTestId('roster-backup-note')).toBeNull();
  });

  it('restores the ladder in a file the user picked, and says how much came back', async () => {
    fill();
    const backup = serialiseBackup(repository.exportSnapshot());

    // A second database and a second preference store: what an uninstall leaves behind, and
    // the only state in which a restore is worth anything.
    const wiped = createTestDatabase();
    const fresh = createTestRepository(wiped.db).repository;
    expect(fresh.playerCount()).toBe(0);

    const file = fakeFile(async () => ok(backup));
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(fresh) });

    fireEvent.press(screen.getByTestId('roster-backup-import'));
    confirmReplace(alert);

    await waitFor(() =>
      expect(screen.getByTestId('roster-backup-note').props.children).toBe(
        'Restored 2 players and 1 record.',
      ),
    );
    expect(fresh.playerCount()).toBe(2);
    expect(fresh.getViewerId()).not.toBeNull();
    wiped.close();
  });

  it('shows the file’s own refusal, and leaves the roster where it was', async () => {
    fill();
    const file = fakeFile(async () => ok('{ "not": "ours" }'));
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('roster-backup-import'));
    confirmReplace(alert);

    await waitFor(() =>
      expect(screen.getByTestId('roster-backup-error').props.children).toContain(
        'not an Arena Scout roster',
      ),
    );
    expect(repository.playerCount()).toBe(2);
  });

  it('says nothing when the picker is dismissed, because nothing happened', async () => {
    fill();
    const file = fakeFile(async () => ok(null));
    await render(<RosterBackupControls file={file} />, { wrapper: wrapWith(repository) });

    fireEvent.press(screen.getByTestId('roster-backup-import'));
    confirmReplace(alert);

    await waitFor(() => expect(screen.queryByTestId('roster-backup-note')).toBeNull());
    expect(screen.queryByTestId('roster-backup-error')).toBeNull();
  });
});
