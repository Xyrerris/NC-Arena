/**
 * The periodic sync (ROADMAP.md Phase 5; the owner's decision 1): the same push-then-pull a
 * pull-to-refresh fires, run by the OS every so often with nobody watching. On Android that is
 * WorkManager, through `expo-background-task`. **Device-only**, for the reason
 * `arenaRepository.ts` is — both packages are native modules plain Node cannot resolve — so it
 * is not re-exported from `index.ts`. What the task *does* is `runBackgroundSync`, which is
 * Node-testable; this file only hands it the device's repository and client.
 *
 * **The task is defined at module scope, and this module is imported from the app's entry
 * (`index.ts` at the repository root), not from a route.** When WorkManager wakes a closed app
 * it runs the JS bundle headless: no root component mounts, so no route module — not even
 * `_layout.tsx` — is ever evaluated. A `defineTask` that lived beside the layout would simply
 * not exist on the one run it is for, and the OS would drop the task as undefined.
 *
 * The same headless run is why the body waits for `arenaDbReady`. Migrations normally run
 * behind the splash screen; with no splash screen, an app update's new migration would
 * otherwise meet a sync that writes to the old schema.
 *
 * Best-effort by design (ARCHITECTURE.md §3): the OS decides when, the interval is a minimum
 * rather than a promise, and pull-to-refresh stays the path a user can count on.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { arenaDbReady } from '../db/client';
import { arenaQueryClient, arenaRepository, backendConfigured } from './arenaRepository';
import { runBackgroundSync } from './syncMutation';

export const BACKGROUND_SYNC_TASK = 'arena-roster-sync';

/**
 * Once an hour at most. A ladder moves when somebody plays, not by the minute, and the OS
 * stretches the interval anyway to batch wake-ups; asking for the 15-minute floor would buy
 * battery drain rather than freshness.
 */
const MINIMUM_INTERVAL_MINUTES = 60;

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await arenaDbReady;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
  const outcome = await runBackgroundSync(arenaRepository, arenaQueryClient);
  return outcome === 'failed'
    ? BackgroundTask.BackgroundTaskResult.Failed
    : BackgroundTask.BackgroundTaskResult.Success;
});

/**
 * Registers the periodic sync when this build has a backend, and withdraws it when it has
 * none. Registration is persisted by the OS, so this is idempotent across launches — and the
 * withdrawal is what keeps a build that turned the URL off from waking up to sync with nothing.
 */
export const scheduleBackgroundSync = async (): Promise<void> => {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

  if (!backendConfigured) {
    if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    return;
  }
  if (registered) return;

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
};
