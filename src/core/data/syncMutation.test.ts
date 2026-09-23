/**
 * The periodic sync's body, without the OS. What the task adds on a device is only *when*
 * this runs; whether it syncs, when it stands aside, and how hard it tries are all here.
 */

import { MutationObserver, QueryClient } from '@tanstack/react-query';

import { err, ok, type Result } from '../common';
import { SYNC_MUTATION_KEY, runBackgroundSync, syncMutation } from './syncMutation';

/** No waiting between attempts: the backoff is TanStack's, and what is asserted is the count. */
const IMMEDIATE = { retry: 2, retryDelay: 0 };

const repositoryAnswering = (...answers: Result<void>[]) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    needsAccount: () => false,
    syncRoster: async (): Promise<Result<void>> => {
      const answer = answers[Math.min(calls, answers.length - 1)] ?? ok(undefined);
      calls += 1;
      return answer;
    },
  };
};

describe('runBackgroundSync', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it('runs one sync and reports it', async () => {
    const repository = repositoryAnswering(ok(undefined));

    await expect(runBackgroundSync(repository, client, IMMEDIATE)).resolves.toBe('synced');
    expect(repository.calls).toBe(1);
  });

  it('stands aside while the device has no key, rather than syncing unauthenticated', async () => {
    let calls = 0;
    const repository = {
      needsAccount: () => true,
      syncRoster: async (): Promise<Result<void>> => {
        calls += 1;
        return ok(undefined);
      },
    };

    await expect(runBackgroundSync(repository, client, IMMEDIATE)).resolves.toBe('skipped');
    expect(calls).toBe(0);
  });

  it('stands aside while another sync on the same client is in flight', async () => {
    let land = (): void => {};
    const held = new Promise<void>((resolve) => {
      land = resolve;
    });
    let calls = 0;
    const repository = {
      needsAccount: () => false,
      syncRoster: async (): Promise<Result<void>> => {
        calls += 1;
        await held;
        return ok(undefined);
      },
    };

    // A pull-to-refresh, started the way `useRoster` starts it.
    const pull = new MutationObserver(client, { ...syncMutation(repository), retry: 0 }).mutate();
    expect(client.isMutating({ mutationKey: SYNC_MUTATION_KEY })).toBe(1);

    await expect(runBackgroundSync(repository, client, IMMEDIATE)).resolves.toBe('skipped');

    land();
    await pull;
    expect(calls).toBe(1);
  });

  it('retries a failed sync, and recovers when a retry lands', async () => {
    const repository = repositoryAnswering(err(new Error('offline')), ok(undefined));

    await expect(runBackgroundSync(repository, client, IMMEDIATE)).resolves.toBe('synced');
    expect(repository.calls).toBe(2);
  });

  it('gives up after its retries and reports a failure rather than throwing', async () => {
    const repository = repositoryAnswering(err(new Error('offline')));

    await expect(runBackgroundSync(repository, client, IMMEDIATE)).resolves.toBe('failed');
    // The first attempt plus two retries — the policy, not TanStack's default of three.
    expect(repository.calls).toBe(3);
  });
});

describe('syncMutation', () => {
  it('turns a failed Result into a rejection, which is the only thing TanStack reads', async () => {
    const failure = new Error('backend: OFFLINE — no network');
    const { mutationFn } = syncMutation({ syncRoster: async () => err(failure) });

    await expect(mutationFn()).rejects.toBe(failure);
  });
});
