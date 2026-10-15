/**
 * The `core/data` half of the setup gate (ADR-0035, decision 2): the repository is the only
 * layer that may hold both the gateway and the preference store, so it is the only place the
 * key a successful pairing returns can actually be kept.
 *
 * The assertions are about the **stored preference**, not about a spy having been called —
 * the thing that matters is what the next launch reads, which is the same standard the
 * viewer tests hold themselves to.
 */

import { err, ok, type AccountError, type AccountGateway } from '../common';
import { createTestDatabase, createTestRepository, type TestDatabase } from '../testing';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const gatewayThat = (overrides: Partial<AccountGateway> = {}): AccountGateway => ({
  name: 'fake',
  createAccount: async () =>
    ok({ accountId: ACCOUNT_ID, apiKey: 'minted-key', recoveryCode: 'minted-code' }),
  linkAccount: async () => ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }),
  ...overrides,
});

const failing = (error: AccountError): Partial<AccountGateway> => ({
  createAccount: async () => err(error),
  linkAccount: async () => err(error),
});

describe('the setup gate seam', () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  describe('needsAccount', () => {
    it('is false with no gateway — the app as it ships with no API URL', () => {
      const { repository } = createTestRepository(database.db);

      // ADR-0021's hand-filled ladder has no accounts, so gating it would ask the user for
      // something the product does not have.
      expect(repository.needsAccount()).toBe(false);
    });

    it('is true with a gateway and no stored key', () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());

      expect(repository.needsAccount()).toBe(true);
    });

    it('is false once a key is stored, and stays false across a restart', async () => {
      const { repository, restart } = createTestRepository(database.db, undefined, gatewayThat());

      await repository.createAccount();

      expect(repository.needsAccount()).toBe(false);
      // The gate opens once per install, not once per launch: a second run reads the same
      // MMKV store and must not ask again.
      expect(restart().needsAccount()).toBe(false);
    });
  });

  describe('skipping setup (ADR-0038)', () => {
    it('lets the gate stay closed across a restart, and keeps pairing available', () => {
      const { repository, restart } = createTestRepository(database.db, undefined, gatewayThat());

      repository.skipAccountSetup();

      expect(repository.needsAccount()).toBe(false);
      expect(restart().needsAccount()).toBe(false);
      // Not paired, so the "You" screen still offers to connect.
      expect(repository.canLinkAccount()).toBe(true);
    });

    it('stops offering to connect once the device is paired', async () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());
      repository.skipAccountSetup();

      await repository.linkAccount('some-code');

      expect(repository.canLinkAccount()).toBe(false);
    });

    it('offers nothing in a build with no backend', () => {
      const { repository } = createTestRepository(database.db);

      expect(repository.canLinkAccount()).toBe(false);
    });

    it('makes a sync a quiet no-op while unpaired, rather than a refused request', async () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());
      repository.skipAccountSetup();

      expect((await repository.syncRoster()).ok).toBe(true);
    });
  });

  describe('createAccount', () => {
    it('stores the key and hands both secrets back for the screen to show once', async () => {
      const { repository, preferences } = createTestRepository(
        database.db,
        undefined,
        gatewayThat(),
      );

      const created = await repository.createAccount();

      expect(created).toEqual({
        ok: true,
        value: { accountId: ACCOUNT_ID, apiKey: 'minted-key', recoveryCode: 'minted-code' },
      });
      expect(preferences.getApiKey()).toBe('minted-key');
    });

    it('announces the change, so the gate is not the last to know', async () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());
      const listener = jest.fn();
      repository.subscribeAccount(listener);

      await repository.createAccount();

      expect(listener).toHaveBeenCalled();
    });

    it('stores nothing when the server refused, so the gate stays shut', async () => {
      const { repository, preferences } = createTestRepository(
        database.db,
        undefined,
        gatewayThat(failing({ reason: 'OFFLINE', message: 'no network' })),
      );

      const created = await repository.createAccount();

      if (created.ok) throw new Error('expected a failure');
      expect(created.error.reason).toBe('OFFLINE');
      expect(preferences.getApiKey()).toBeNull();
      expect(repository.needsAccount()).toBe(true);
    });

    it('refuses when there is no backend at all', async () => {
      const { repository } = createTestRepository(database.db);

      const created = await repository.createAccount();

      if (created.ok) throw new Error('expected a failure');
      expect(created.error.reason).toBe('FAILED');
    });
  });

  describe('linkAccount', () => {
    it('stores the fresh key and returns nothing the screen has to handle', async () => {
      const { repository, preferences } = createTestRepository(
        database.db,
        undefined,
        gatewayThat(),
      );

      const linked = await repository.linkAccount('a-recovery-code');

      expect(linked).toEqual({ ok: true, value: undefined });
      expect(preferences.getApiKey()).toBe('linked-key');
      expect(repository.needsAccount()).toBe(false);
    });

    it('passes the code through to the gateway unchanged', async () => {
      const linkAccount = jest
        .fn<ReturnType<AccountGateway['linkAccount']>, [string]>()
        .mockResolvedValue(ok({ accountId: ACCOUNT_ID, apiKey: 'linked-key' }));
      const { repository } = createTestRepository(
        database.db,
        undefined,
        gatewayThat({ linkAccount }),
      );

      await repository.linkAccount('a-recovery-code');

      expect(linkAccount).toHaveBeenCalledWith('a-recovery-code');
    });

    it('keeps the reason, which is the only thing the screen can act on', async () => {
      const { repository, preferences } = createTestRepository(
        database.db,
        undefined,
        gatewayThat(failing({ reason: 'UNRECOGNISED', message: 'nope' })),
      );

      const linked = await repository.linkAccount('wrong');

      if (linked.ok) throw new Error('expected a failure');
      expect(linked.error.reason).toBe('UNRECOGNISED');
      expect(preferences.getApiKey()).toBeNull();
    });

    it('refuses when there is no backend at all', async () => {
      const { repository } = createTestRepository(database.db);

      const linked = await repository.linkAccount('anything');

      if (linked.ok) throw new Error('expected a failure');
      expect(linked.error.reason).toBe('FAILED');
    });
  });

  describe('subscribeAccount', () => {
    it('stops calling a listener that unsubscribed', async () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());
      const listener = jest.fn();

      repository.subscribeAccount(listener)();
      await repository.createAccount();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not fire for a viewer change — the gate has nothing to re-read', () => {
      const { repository } = createTestRepository(database.db, undefined, gatewayThat());
      const listener = jest.fn();
      repository.subscribeAccount(listener);

      // A refused choice is enough: what matters is that the viewer's own listeners and
      // these are separate sets, so an id moving does not re-render the whole app.
      repository.setViewerId(repository.getViewerId() ?? ('nobody' as never));

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
