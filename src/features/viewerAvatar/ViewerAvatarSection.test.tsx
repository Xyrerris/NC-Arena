/**
 * ADR-0044 from the screen: the avatar is entered beside "me", checked for shape, stored
 * through the repository, and hidden while there is nobody to attach it to.
 *
 * Over a real `better-sqlite3` database like every other screen test. jest-expo runs at
 * fontScale 2, so every render here is also a 200 % font-scale render.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import type { PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { ViewerAvatarSection } from './ViewerAvatarSection';
import { ADDRESS_ERROR, SAVED_NOTE } from './viewerAvatarUiState';

const ADDRESS = '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f';
const CHECKSUM = '0x1023D8F22c6F5A8701E56A95E18Fb2DBE436B41f';

const draft = (name: string): PlayerDraft => ({
  name,
  level: 400,
  gameCode: '',
  combatPower: 900,
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

describe('ViewerAvatarSection', () => {
  let handle: TestDatabase;
  let repository: RosterRepository;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
    repository = createTestRepository(handle.db).repository;
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  const makeViewer = (): void => {
    const me = repository.createPlayer(draft('Xyrerris'));
    if (!me.ok) throw new Error('fixture: the player was refused');
    expect(repository.setViewerId(me.value.id).ok).toBe(true);
  };

  const enter = async (text: string): Promise<void> => {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('viewer-avatar-address'), text);
    });
  };
  const save = async (): Promise<void> => {
    await act(async () => {
      fireEvent.press(screen.getByTestId('viewer-avatar-save'));
    });
  };

  it('renders nothing while nobody is "you"', async () => {
    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });
    expect(screen.queryByTestId('viewer-avatar')).toBeNull();
  });

  it('stores the planet and a lower-cased address, and says it will sync later', async () => {
    makeViewer();
    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });

    await act(async () => {
      fireEvent.press(screen.getByTestId('viewer-avatar-planet-odin'));
    });
    await enter(`  ${CHECKSUM} `);
    await save();

    expect(repository.getViewerAvatar()).toEqual({ planet: 'odin', address: ADDRESS });
    expect(screen.getByTestId('viewer-avatar-note').props.children).toBe(SAVED_NOTE);
    // The stored value is what the field now shows, and the current avatar is summarised.
    expect(screen.getByTestId('viewer-avatar-address').props.value).toBe(ADDRESS);
    expect(screen.getByTestId('viewer-avatar-current').props.children).toContain('Odin');
  });

  it('refuses an address that cannot be one, and stores nothing', async () => {
    makeViewer();
    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });

    await enter('0x1023');
    await save();

    expect(screen.getByTestId('viewer-avatar-address-error').props.children).toBe(ADDRESS_ERROR);
    expect(repository.getViewerAvatar()).toBeNull();
  });

  it('clears the complaint as soon as the address is edited', async () => {
    makeViewer();
    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });
    await enter('nope');
    await save();
    expect(screen.queryByTestId('viewer-avatar-address-error')).not.toBeNull();

    await enter(ADDRESS);

    expect(screen.queryByTestId('viewer-avatar-address-error')).toBeNull();
  });

  it('shows an avatar that is already stored', async () => {
    makeViewer();
    repository.setViewerAvatar({ planet: 'heimdall', address: ADDRESS });

    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });

    expect(screen.getByTestId('viewer-avatar-address').props.value).toBe(ADDRESS);
    expect(screen.getByTestId('viewer-avatar-current').props.children).toContain('Heimdall');
  });
});
