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

import { err, ok, type AvatarSource } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import type { PlayerDraft } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { ViewerAvatarSection } from './ViewerAvatarSection';
import {
  ADDRESS_ERROR,
  SAVED_NOTE,
  notFoundMessage,
  uncheckedMessage,
} from './viewerAvatarUiState';

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

const IDENTITY = { name: 'Xyrerris', level: 494, agentAddress: '0xD7E4' };

const wrapWith = (repository: RosterRepository, avatarSource?: AvatarSource) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ArenaDataProvider value={{ repository, useLiveData: createStubLiveData(), avatarSource }}>
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

  describe('with a way to look the address up', () => {
    const sourceAnswering = (read: ReturnType<AvatarSource['readAvatar']>) => {
      const readAvatar = jest.fn().mockReturnValue(read);
      return { name: 'test', readAvatar } as AvatarSource & { readAvatar: jest.Mock };
    };
    const press = async (testID: string): Promise<void> => {
      await act(async () => {
        fireEvent.press(screen.getByTestId(testID));
      });
    };

    it('shows the name behind the address and stores nothing until it is confirmed', async () => {
      makeViewer();
      const source = sourceAnswering(Promise.resolve(ok(IDENTITY)));
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });

      await enter(CHECKSUM);
      await save();

      expect(source.readAvatar).toHaveBeenCalledWith({ planet: 'heimdall', address: ADDRESS });
      expect(screen.getByTestId('viewer-avatar-identity').props.children).toBe(
        'Xyrerris · level 494',
      );
      expect(repository.getViewerAvatar()).toBeNull();

      await press('viewer-avatar-confirm-yes');

      expect(repository.getViewerAvatar()).toEqual({ planet: 'heimdall', address: ADDRESS });
      expect(screen.getByTestId('viewer-avatar-note').props.children).toBe(SAVED_NOTE);
    });

    it('stores nothing when the user says it is not them', async () => {
      makeViewer();
      const source = sourceAnswering(Promise.resolve(ok(IDENTITY)));
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });
      await enter(ADDRESS);
      await save();

      await press('viewer-avatar-confirm-no');

      expect(screen.queryByTestId('viewer-avatar-confirm')).toBeNull();
      expect(repository.getViewerAvatar()).toBeNull();
    });

    it('says so when the chain has nobody there, and stores nothing', async () => {
      makeViewer();
      const source = sourceAnswering(Promise.resolve(ok(null)));
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });
      await enter(ADDRESS);
      await save();

      expect(screen.getByTestId('viewer-avatar-error').props.children).toBe(
        notFoundMessage('heimdall'),
      );
      expect(screen.queryByTestId('viewer-avatar-confirm')).toBeNull();
      expect(repository.getViewerAvatar()).toBeNull();
    });

    it('offers to save unchecked when the lookup did not happen, and only then stores', async () => {
      makeViewer();
      const source = sourceAnswering(
        Promise.resolve(err({ reason: 'OFFLINE' as const, message: 'down' })),
      );
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });
      await enter(ADDRESS);
      await save();

      expect(screen.getByTestId('viewer-avatar-unchecked').props.children).toBe(
        uncheckedMessage('OFFLINE'),
      );
      expect(repository.getViewerAvatar()).toBeNull();

      await press('viewer-avatar-save-unchecked');

      expect(repository.getViewerAvatar()).toEqual({ planet: 'heimdall', address: ADDRESS });
    });

    it('does not look anything up for an address that cannot be one', async () => {
      makeViewer();
      const source = sourceAnswering(Promise.resolve(ok(IDENTITY)));
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });
      await enter('0x1023');
      await save();

      expect(source.readAvatar).not.toHaveBeenCalled();
      expect(screen.getByTestId('viewer-avatar-address-error').props.children).toBe(ADDRESS_ERROR);
    });

    it('drops a name that arrives after the address was edited', async () => {
      makeViewer();
      let answer: (value: ReturnType<typeof ok>) => void = () => undefined;
      const slow = new Promise<ReturnType<typeof ok>>((resolve) => {
        answer = resolve;
      });
      const source = sourceAnswering(slow as ReturnType<AvatarSource['readAvatar']>);
      await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository, source) });
      await enter(ADDRESS);
      await save();
      expect(screen.queryByTestId('viewer-avatar-checking')).not.toBeNull();

      await enter(`${ADDRESS.slice(0, -1)}0`);
      await act(async () => {
        answer(ok(IDENTITY));
        await slow;
      });

      // The name belonged to the address that was typed first; it must not confirm this one.
      expect(screen.queryByTestId('viewer-avatar-confirm')).toBeNull();
      expect(repository.getViewerAvatar()).toBeNull();
    });
  });

  it('shows an avatar that is already stored', async () => {
    makeViewer();
    repository.setViewerAvatar({ planet: 'heimdall', address: ADDRESS });

    await render(<ViewerAvatarSection />, { wrapper: wrapWith(repository) });

    expect(screen.getByTestId('viewer-avatar-address').props.value).toBe(ADDRESS);
    expect(screen.getByTestId('viewer-avatar-current').props.children).toContain('Heimdall');
  });
});
