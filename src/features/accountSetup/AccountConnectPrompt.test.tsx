/**
 * The "You" screen's way back to an account after setup was skipped (ADR-0038).
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ok, type AccountGateway } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { AccountConnectPrompt } from './AccountConnectPrompt';

const gateway: AccountGateway = {
  name: 'fake',
  createAccount: async () =>
    ok({
      accountId: '11111111-1111-4111-8111-111111111111',
      apiKey: 'minted-key',
      recoveryCode: 'minted-code',
    }),
  linkAccount: async () =>
    ok({ accountId: '11111111-1111-4111-8111-111111111111', apiKey: 'linked-key' }),
};

const wrapWith = (repository: RosterRepository) =>
  function Harness({ children }: { children: ReactNode }) {
    return (
      <ArenaDataProvider value={{ repository, useLiveData: createStubLiveData() }}>
        {children}
      </ArenaDataProvider>
    );
  };

describe('AccountConnectPrompt', () => {
  let handle: TestDatabase;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    handle = createTestDatabase();
  });

  afterEach(() => {
    cleanup();
    handle.close();
  });

  it('offers to connect an unpaired device, and goes away once it is paired', async () => {
    const { repository } = createTestRepository(handle.db, undefined, gateway);
    repository.skipAccountSetup();
    const onConnect = jest.fn();
    await render(<AccountConnectPrompt onConnect={onConnect} />, {
      wrapper: wrapWith(repository),
    });

    fireEvent.press(screen.getByTestId('account-connect-button'));
    expect(onConnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await repository.linkAccount('some-code');
    });
    expect(screen.queryByTestId('account-connect')).toBeNull();
  });

  it('renders nothing in a build with no backend', async () => {
    const { repository } = createTestRepository(handle.db);
    await render(<AccountConnectPrompt onConnect={jest.fn()} />, {
      wrapper: wrapWith(repository),
    });

    expect(screen.queryByTestId('account-connect')).toBeNull();
  });
});
