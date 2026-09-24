/**
 * The setup gate, end to end through a real repository and a fake gateway (ADR-0035,
 * decision 2; the owner's decision 3 in HANDOFF.md).
 *
 * Rendered over a **real** `better-sqlite3` database and the real `createRosterRepository`,
 * like every other screen test here, so "this device is now paired" is an assertion about
 * the preference the next launch reads rather than about a spy.
 *
 * jest-expo runs at fontScale 2, so every render below is also a 200 % font-scale render —
 * which is the scale this screen's warning is longest at.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { err, ok, type AccountError, type AccountGateway } from '@/core/common';
import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  type TestDatabase,
} from '@/core/testing';

import { AccountSetupScreen } from './AccountSetupScreen';
import { CREATE_LABEL, LINK_LABEL, failureMessage } from './accountSetupUiState';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

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

const gatewayThat = (overrides: Partial<AccountGateway> = {}): AccountGateway => ({
  name: 'fake',
  createAccount: async () =>
    ok({ accountId: ACCOUNT_ID, apiKey: 'minted-key', recoveryCode: 'minted-code' }),
  linkAccount: async () => ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }),
  ...overrides,
});

const typeCode = async (value: string): Promise<void> => {
  fireEvent.changeText(screen.getByTestId('account-setup-code'), value);
  await waitFor(() => expect(screen.getByTestId('account-setup-code').props.value).toBe(value));
};

const submit = (): void => {
  fireEvent.press(screen.getByTestId('account-setup-submit'));
};

describe('AccountSetupScreen', () => {
  let handle: TestDatabase;
  let onDone: jest.Mock;

  const mount = async (gateway: AccountGateway): Promise<RosterRepository> => {
    const { repository } = createTestRepository(handle.db, undefined, gateway);
    await render(<AccountSetupScreen onDone={onDone} />, { wrapper: wrapWith(repository) });
    return repository;
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    handle = createTestDatabase();
    onDone = jest.fn();
  });

  afterEach(async () => {
    await cleanup();
    handle.close();
  });

  describe('an empty field creates an account', () => {
    it('shows the recovery code the server minted', async () => {
      await mount(gatewayThat());

      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-recovery')).toBeTruthy());
      expect(screen.getByTestId('account-setup-recovery').props.children).toBe('minted-code');
    });

    it('keeps the code on screen although the key is already stored', async () => {
      // This is the whole reason the gate latches instead of watching `needsAccount`: by
      // the time the code is readable, the condition that opened the gate is already false.
      // A gate that re-read it would swap the roster in over the one and only time this
      // code is ever shown, and the server keeps only its hash.
      const repository = await mount(gatewayThat());

      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-recovery')).toBeTruthy());
      expect(repository.needsAccount()).toBe(false);
      expect(onDone).not.toHaveBeenCalled();
    });

    it('warns that this is the only time it is shown', async () => {
      await mount(gatewayThat());

      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-warning')).toBeTruthy());
    });

    it('closes the gate only once the code has been acknowledged', async () => {
      await mount(gatewayThat());

      submit();
      await waitFor(() => expect(screen.getByTestId('account-setup-continue')).toBeTruthy());
      expect(onDone).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('account-setup-continue'));

      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('mints one account however long the request is in flight', async () => {
      // A second account would be minted and then orphaned: its key would overwrite the
      // first's, and the first's recovery code — already on screen — would belong to a
      // roster this device could no longer reach. So the request is held open here, and
      // the screen is pressed again while it is.
      let release = (): void => {};
      const inFlight = new Promise<void>((resolve) => {
        release = resolve;
      });
      const createAccount = jest
        .fn<ReturnType<AccountGateway['createAccount']>, []>()
        .mockImplementation(async () => {
          await inFlight;
          return ok({ accountId: ACCOUNT_ID, apiKey: 'minted-key', recoveryCode: 'minted-code' });
        });
      await mount(gatewayThat({ createAccount }));

      submit();
      await waitFor(() => expect(screen.getByTestId('account-setup-busy')).toBeTruthy());
      submit();

      await act(async () => {
        release();
        await inFlight;
      });

      await waitFor(() => expect(screen.getByTestId('account-setup-recovery')).toBeTruthy());
      expect(createAccount).toHaveBeenCalledTimes(1);
    });

    it('treats a field of pure whitespace as empty', async () => {
      const linkAccount = jest
        .fn<ReturnType<AccountGateway['linkAccount']>, [string]>()
        .mockResolvedValue(ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }));
      await mount(gatewayThat({ linkAccount }));

      await typeCode('   ');
      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-recovery')).toBeTruthy());
      expect(linkAccount).not.toHaveBeenCalled();
    });
  });

  describe('a recovery code links this device', () => {
    it('sends the trimmed code and closes the gate with nothing to show', async () => {
      const linkAccount = jest
        .fn<ReturnType<AccountGateway['linkAccount']>, [string]>()
        .mockResolvedValue(ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }));
      await mount(gatewayThat({ linkAccount }));

      // A pasted code arrives with the newline the clipboard carried. Creating a second
      // account because of one would be unrecoverable.
      await typeCode('  a-recovery-code\n');
      submit();

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(linkAccount).toHaveBeenCalledWith('a-recovery-code');
      expect(screen.queryByTestId('account-setup-recovery')).toBeNull();
    });

    it('stores the key that came back', async () => {
      const repository = await mount(gatewayThat());

      await typeCode('a-recovery-code');
      submit();

      await waitFor(() => expect(repository.needsAccount()).toBe(false));
    });
  });

  describe('the action says what it will do', () => {
    it('offers to create while the field is empty, and to link once it is not', async () => {
      await mount(gatewayThat());

      // `ArenaButton` draws every label in upper case, so the assertion matches what is on
      // screen rather than what was passed in.
      expect(screen.getByTestId('account-setup-submit')).toHaveTextContent(
        CREATE_LABEL.toUpperCase(),
      );

      await typeCode('a-recovery-code');

      expect(screen.getByTestId('account-setup-submit')).toHaveTextContent(
        LINK_LABEL.toUpperCase(),
      );
    });
  });

  describe('a refusal keeps the gate open', () => {
    const refuse = (error: AccountError): AccountGateway =>
      gatewayThat({ createAccount: async () => err(error), linkAccount: async () => err(error) });

    it('says the code was not recognised, and does not close', async () => {
      const repository = await mount(refuse({ reason: 'UNRECOGNISED', message: 'nope' }));

      await typeCode('wrong-code');
      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-error')).toBeTruthy());
      expect(screen.getByTestId('account-setup-error')).toHaveTextContent(
        failureMessage('UNRECOGNISED'),
      );
      expect(onDone).not.toHaveBeenCalled();
      expect(repository.needsAccount()).toBe(true);
    });

    it('distinguishes being offline from having typed it wrong', async () => {
      await mount(refuse({ reason: 'OFFLINE', message: 'no network' }));

      await typeCode('a-recovery-code');
      submit();

      await waitFor(() => expect(screen.getByTestId('account-setup-error')).toBeTruthy());
      expect(screen.getByTestId('account-setup-error')).toHaveTextContent(
        failureMessage('OFFLINE'),
      );
    });

    it('lets the user try again after a refusal', async () => {
      const linkAccount = jest
        .fn<ReturnType<AccountGateway['linkAccount']>, [string]>()
        .mockResolvedValueOnce(err({ reason: 'UNRECOGNISED', message: 'nope' }))
        .mockResolvedValueOnce(ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }));
      await mount(gatewayThat({ linkAccount }));

      await typeCode('wrong-code');
      submit();
      await waitFor(() => expect(screen.getByTestId('account-setup-error')).toBeTruthy());

      // The guard is a latch on one attempt, not on the screen: a refused attempt has to
      // leave the button pressable or the only way out is to kill the app.
      await typeCode('right-code');
      submit();

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(linkAccount).toHaveBeenNthCalledWith(2, 'right-code');
    });
  });

  describe('continuing offline (ADR-0038)', () => {
    it('closes the gate without an account, and remembers the choice', async () => {
      const repository = await mount(gatewayThat());

      await act(async () => {
        fireEvent.press(screen.getByTestId('account-setup-skip'));
      });

      expect(onDone).toHaveBeenCalledTimes(1);
      expect(repository.needsAccount()).toBe(false);
      expect(repository.canLinkAccount()).toBe(true);
    });

    it('is the way out when the server cannot be reached', async () => {
      const offline: AccountError = { reason: 'OFFLINE', message: 'no network' };
      await mount(
        gatewayThat({
          createAccount: async () => err(offline),
          linkAccount: async () => err(offline),
        }),
      );

      await act(async () => {
        submit();
      });
      await screen.findByTestId('account-setup-error');
      await act(async () => {
        fireEvent.press(screen.getByTestId('account-setup-skip'));
      });

      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
