/**
 * ADR-0020's exit criteria, one describe block each: a player can be added from the
 * roster, a rejected draft names the field that was wrong instead of failing silently, a
 * synced player cannot be edited, and removing a player closes the ranking behind them.
 *
 * The screen renders over a **real** `better-sqlite3` database rather than a stubbed
 * repository, exactly as `RosterScreen.test.tsx` does — so "the player was added" is an
 * assertion about the row SQLite now holds, not about a spy having been called.
 *
 * jest-expo runs at fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type RosterSnapshot, type RosterSource } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId, type Player, type PlayerId } from '@/core/model';
import { createStatScanner, type ScannedLine, type StatScanner } from '@/core/ocr';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { PlayerFormScreen } from './PlayerFormScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

const player = (id: string, name: string, rank: number, combatPower: number): Player => ({
  id: asPlayerId(id),
  name,
  level: 100 + rank,
  gameCode: `a${rank}`,
  rank,
  combatPower,
  score: 1000 - rank,
  hp: 5_000_000 + rank,
  atk: 1_000_000 + rank,
  def: 2_000_000 + rank,
  critBp: 500_000 + rank,
  hit: 3_000_000 + rank,
  spd: 4_000_000 + rank,
});

const FIXTURE: RosterSnapshot = {
  season: 41,
  viewerId: asPlayerId('p-a'),
  players: [player('p-a', 'Aurel', 1, 1_000_000), player('p-b', 'Brann', 2, 4_000_000)],
  headToHead: [],
};

const sourceOf = (snapshot: RosterSnapshot): RosterSource => ({
  name: 'fixture',
  fetchRoster: async () => ok(snapshot),
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

const type = async (field: string, value: string): Promise<void> => {
  fireEvent.changeText(screen.getByTestId(`form-field-${field}`), value);
  // Let each keystroke commit before the next. Overlapping act() scopes corrupt the
  // renderer for the rest of the file rather than failing the test that caused it
  // (ADR-0018's note on RNTL).
  await waitFor(() => expect(screen.getByTestId(`form-field-${field}`).props.value).toBe(value));
};

const namesInRoster = (repository: RosterRepository): string[] => {
  const live = repository.observeRoster('RANK', '');
  return live.map(live.query.all()).map((entry) => entry.player.name);
};

const NYX = {
  name: 'Nyx',
  level: 7,
  gameCode: 'n1x',
  combatPower: 2500,
  score: 10,
  hp: 9,
  atk: 1,
  def: 2,
  critPercent: 3,
  hit: 4,
  spd: 5,
};

describe('PlayerFormScreen — adding a player', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(FIXTURE)).repository;
    expect((await repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const renderCreate = () =>
    render(<PlayerFormScreen mode={{ kind: 'create' }} />, { wrapper: wrapWith(repository) });

  it('writes the new player to SQLite and opens their page', async () => {
    await renderCreate();
    await type('name', 'Nyx');
    await type('combatPower', '2500');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann', 'Nyx']));
    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/player/[id]' }));
  });

  it('accepts a pasted, group-separated number', async () => {
    // The roster renders "2.418.904.113", so that is the shape a value arrives in when it
    // is copied back out of the app.
    await renderCreate();
    await type('name', 'Nyx');
    await type('atk', '2.418.904.113');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Nyx'));
    const live = repository.observeRoster('RANK', 'Nyx');
    expect(live.map(live.query.all())[0]?.player.atk).toBe(2_418_904_113);
  });

  it('takes crit as a whole percentage and stores it in basis points', async () => {
    await renderCreate();
    await type('name', 'Nyx');
    await type('critPercent', '113');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Nyx'));
    const live = repository.observeRoster('RANK', 'Nyx');
    // 113 % typed, 1_130_000 stored. The x10_000 happens once, in core/db/write.ts, and
    // multiplying a validated integer cannot lose anything.
    expect(live.map(live.query.all())[0]?.player.critBp).toBe(1_130_000);
  });

  it('accepts a crit above 100 %, because the game has them', async () => {
    await renderCreate();
    await type('name', 'Nyx');
    await type('critPercent', '178');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Nyx'));
    const live = repository.observeRoster('RANK', 'Nyx');
    expect(live.map(live.query.all())[0]?.player.critBp).toBe(1_780_000);
  });

  it('refuses a fractional crit rather than rounding it silently', async () => {
    await renderCreate();
    await type('name', 'Nyx');
    await type('critPercent', '58.4127');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(screen.getByTestId('form-field-critPercent-error')).toBeTruthy());
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
  });

  it('reads back a value in the punctuation the app displays it with', async () => {
    // The roster renders 2.418.904.113, so that is what gets copied out of it and pasted
    // back in. A parse that choked on its own output would be the app disagreeing with
    // itself (ADR-0025).
    await renderCreate();
    await type('name', 'Nyx');
    await type('combatPower', '2.418.904.113');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Nyx'));
    const live = repository.observeRoster('RANK', '');
    const nyx = live.map(live.query.all()).find((entry) => entry.player.name === 'Nyx');
    expect(nyx?.player.combatPower).toBe(2_418_904_113);
  });

  it('reads a comma-grouped value too, because a number may be copied from anywhere', async () => {
    await renderCreate();
    await type('name', 'Nyx');
    await type('combatPower', '2,418,904,113');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Nyx'));
    const live = repository.observeRoster('RANK', '');
    const nyx = live.map(live.query.all()).find((entry) => entry.player.name === 'Nyx');
    expect(nyx?.player.combatPower).toBe(2_418_904_113);
  });

  it('refuses a mistyped decimal rather than reading it as a group separator', async () => {
    // `1.5` is not `15`. A parse that stripped every dot would have accepted it, and the
    // user would have had no way to notice — the number in the box would look right.
    await renderCreate();
    await type('name', 'Nyx');
    await type('atk', '1.5');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(screen.getByTestId('form-field-atk-error')).toBeTruthy());
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
  });

  it('names the offending field rather than failing silently', async () => {
    await renderCreate();
    await type('combatPower', 'not a number');

    fireEvent.press(screen.getByTestId('form-submit'));

    // The name is empty and combat power is unparseable, and both say so at once.
    await waitFor(() => expect(screen.getByTestId('form-field-name-error')).toBeTruthy());
    expect(screen.getByTestId('form-field-combatPower-error')).toBeTruthy();
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('clears a field error as that field is retyped', async () => {
    await renderCreate();
    fireEvent.press(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.getByTestId('form-field-name-error')).toBeTruthy());

    await type('name', 'Nyx');

    // A message that outlives the value it described reads as a control that is stuck.
    await waitFor(() => expect(screen.queryByTestId('form-field-name-error')).toBeNull());
  });

  it('refuses a name already on the ladder, and says which field', async () => {
    await renderCreate();
    await type('name', 'aUrEl');

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(screen.getByTestId('form-field-name-error')).toBeTruthy());
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
  });

  it('leaves without writing when cancelled', async () => {
    await renderCreate();
    await type('name', 'Nyx');

    fireEvent.press(screen.getByTestId('form-cancel'));

    expect(mockBack).toHaveBeenCalled();
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
  });

  it('goes to the roster rather than out of the app when there is no history', async () => {
    // A deep link has nothing behind it, so `back()` would leave the app from a control
    // labelled CANCEL.
    mockCanGoBack.mockReturnValue(false);
    await renderCreate();

    fireEvent.press(screen.getByTestId('form-cancel'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('offers no remove control when creating, because there is nothing to remove', async () => {
    await renderCreate();

    expect(screen.queryByTestId('form-delete')).toBeNull();
  });
});

describe('PlayerFormScreen — editing a player', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;
  let localId: PlayerId;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(FIXTURE)).repository;
    expect((await repository.refresh()).ok).toBe(true);

    const created = repository.createPlayer(NYX);
    if (!created.ok) throw new Error('fixture: the player could not be created');
    localId = created.value.id;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const renderEdit = (id: PlayerId) =>
    render(<PlayerFormScreen mode={{ kind: 'edit', id }} />, { wrapper: wrapWith(repository) });

  it('opens with the stored values already in the inputs', async () => {
    await renderEdit(localId);

    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));
    expect(screen.getByTestId('form-field-combatPower').props.value).toBe('2500');
  });

  it('saves the change and returns where it came from', async () => {
    await renderEdit(localId);
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));

    await type('combatPower', '9999');
    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => {
      const live = repository.observePlayer(localId);
      expect(live.map(live.query.all())?.player.combatPower).toBe(9999);
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('refuses a synced player instead of offering an edit the next sync would undo', async () => {
    await renderEdit(asPlayerId('p-b'));

    await waitFor(() => expect(screen.getByTestId('form-unavailable')).toBeTruthy());
    expect(screen.queryByTestId('player-form')).toBeNull();
  });

  it('says so when the id matches nobody at all', async () => {
    await renderEdit(asPlayerId('no-such-player'));

    await waitFor(() => expect(screen.getByTestId('form-unavailable')).toBeTruthy());
  });

  it('confirms before removing, and closes the ranking gap afterwards', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderEdit(localId);
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx'));

    fireEvent.press(screen.getByTestId('form-delete'));

    // Pressing the control asks; it does not remove.
    expect(alert).toHaveBeenCalled();
    expect(namesInRoster(repository)).toContain('Nyx');

    // Confirming does.
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.style === 'destructive')?.onPress?.();

    await waitFor(() => expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']));
    const live = repository.observeRoster('RANK', '');
    expect(live.map(live.query.all()).map((entry) => entry.player.rank)).toEqual([1, 2]);
    // Not `back()`: the screen behind an edit is that player's page, which no longer exists.
    expect(mockReplace).toHaveBeenCalledWith('/');
    alert.mockRestore();
  });
});

/**
 * ADR-0024: the form can be filled from a screenshot.
 *
 * The scanner is injected through the screen's `scanner` prop and built from the same
 * ports the device uses, so these tests exercise the real parser over recorded lines —
 * there is no photo library and no ML Kit anywhere in this file.
 */
describe('PlayerFormScreen — filling from a screenshot', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  const SHEET: ScannedLine[] = [
    { text: 'Lv.488 Deus #a984', frame: { left: 700, top: 58, right: 922, bottom: 92 } },
    { text: 'CP 11.724.329.467', frame: { left: 1378, top: 265, right: 1632, bottom: 299 } },
    { text: 'HP 1440085258', frame: { left: 1398, top: 366, right: 1610, bottom: 400 } },
    { text: 'ATK 476993540', frame: { left: 1398, top: 404, right: 1610, bottom: 438 } },
    { text: 'DEF 146695690', frame: { left: 1398, top: 442, right: 1610, bottom: 476 } },
    { text: 'CRI 149%', frame: { left: 1398, top: 480, right: 1610, bottom: 514 } },
    { text: 'HIT 417532877', frame: { left: 1398, top: 518, right: 1610, bottom: 552 } },
    { text: 'SPD 1014675713', frame: { left: 1398, top: 556, right: 1610, bottom: 590 } },
  ];

  const scannerReading = (lines: ScannedLine[]): StatScanner =>
    createStatScanner({
      source: { name: 'fake', pick: async () => ok('file:///cache/scan.png') },
      recogniser: { name: 'fake', recognise: async () => ok(lines) },
    });

  const scannerFailing = (message: string): StatScanner =>
    createStatScanner({
      source: { name: 'fake', pick: async () => err(new Error(message)) },
      recogniser: { name: 'fake', recognise: async () => ok([]) },
    });

  const renderScanning = (scanner: StatScanner) =>
    render(<PlayerFormScreen mode={{ kind: 'create' }} scanner={scanner} />, {
      wrapper: wrapWith(repository),
    });

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    handle = createTestDatabase();
    repository = createTestRepository(handle.db, sourceOf(FIXTURE)).repository;
    expect((await repository.refresh()).ok).toBe(true);
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  it('fills every field the screenshot supplies', async () => {
    await renderScanning(scannerReading(SHEET));
    fireEvent.press(screen.getByTestId('form-scan-button'));

    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Deus'));
    expect(screen.getByTestId('form-field-level').props.value).toBe('488');
    expect(screen.getByTestId('form-field-gameCode').props.value).toBe('a984');
    expect(screen.getByTestId('form-field-combatPower').props.value).toBe('11724329467');
    expect(screen.getByTestId('form-field-hp').props.value).toBe('1440085258');
    expect(screen.getByTestId('form-field-critPercent').props.value).toBe('149');
    expect(screen.getByTestId('form-field-spd').props.value).toBe('1014675713');
  });

  it('leaves score alone, because the profile screen does not show one', async () => {
    await renderScanning(scannerReading(SHEET));
    await type('score', '1712');

    fireEvent.press(screen.getByTestId('form-scan-button'));

    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Deus'));
    expect(screen.getByTestId('form-field-score').props.value).toBe('1712');
  });

  it('saves nothing on its own — a scan is a suggestion, not a write', async () => {
    await renderScanning(scannerReading(SHEET));
    fireEvent.press(screen.getByTestId('form-scan-button'));

    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Deus'));
    expect(namesInRoster(repository)).toEqual(['Aurel', 'Brann']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('writes the scanned player once the user presses save', async () => {
    await renderScanning(scannerReading(SHEET));
    fireEvent.press(screen.getByTestId('form-scan-button'));
    await waitFor(() => expect(screen.getByTestId('form-field-name').props.value).toBe('Deus'));

    fireEvent.press(screen.getByTestId('form-submit'));

    await waitFor(() => expect(namesInRoster(repository)).toContain('Deus'));
    const live = repository.observeRoster('RANK', '');
    const deus = live.map(live.query.all()).find((entry) => entry.player.name === 'Deus');
    expect(deus?.player).toMatchObject({
      level: 488,
      gameCode: 'a984',
      combatPower: 11_724_329_467,
      hp: 1_440_085_258,
      // 149 % in the form, basis points in the column — scaled once, at the storage
      // boundary, exactly as a hand-typed crit is.
      critBp: 1_490_000,
    });
  });

  it('names the fields it could not read, so a partial scan does not look complete', async () => {
    await renderScanning(scannerReading(SHEET.slice(2)));
    fireEvent.press(screen.getByTestId('form-scan-button'));

    const note = await screen.findByTestId('form-scan-note');
    expect(note.props.children).toContain('Name');
    expect(screen.getByTestId('form-field-name').props.value).toBe('');
  });

  it('shows the picker failure rather than a generic shrug', async () => {
    await renderScanning(scannerFailing('No access to your photos.'));
    fireEvent.press(screen.getByTestId('form-scan-button'));

    const problem = await screen.findByTestId('form-scan-error');
    expect(problem.props.children).toBe('No access to your photos.');
  });

  it('keeps what the user already typed when the scan fails', async () => {
    await renderScanning(scannerFailing('No access to your photos.'));
    await type('name', 'Nyx');

    fireEvent.press(screen.getByTestId('form-scan-button'));

    await screen.findByTestId('form-scan-error');
    expect(screen.getByTestId('form-field-name').props.value).toBe('Nyx');
  });
});
