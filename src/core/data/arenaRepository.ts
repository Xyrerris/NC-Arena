/**
 * The app's single repository instance. **Device-only** — it wires the native-backed
 * implementations together, so it is not re-exported from `src/core/data/index.ts` for
 * the same reason `core/db/client.ts` and `core/prefs/mmkvPreferences.ts` are not: the
 * Node test project must stay able to import the repository itself (§10).
 *
 * Everything here is an argument to `createRosterRepository`, which is the point. Tests pass
 * a `better-sqlite3` database, an in-memory preference store and a stub source.
 *
 * **`EXPO_PUBLIC_API_URL` is the off switch.** Unset, nothing here builds a source, the
 * repository has no upstream, and the app behaves exactly as ADR-0021 describes it: a ladder
 * that starts empty, is filled by hand, and whose `refresh()` has genuinely nothing to do.
 * Set, the same object serves as both ports — `RemoteRosterSource` implements `RosterSource`
 * and `RosterSink`, because the backend answers in both directions (ADR-0035, decision 3).
 * Metro inlines `EXPO_PUBLIC_` variables at bundle time, so this is a build-time choice, the
 * same door `src/app/catalogue.tsx` uses for its own flag.
 *
 * The **key** is read per request rather than captured here, and that is not a detail: a
 * device has no API key until the user has created an account or entered a recovery code, so
 * a key read at module load would be `null` for the whole run and every request would go out
 * unauthenticated. Passing the getter means pairing takes effect on the next request rather
 * than on the next launch.
 *
 * The window where a URL is configured and no key is stored yet **is** guarded now: the
 * setup gate stands in front of the roster until one is (`needsAccount`), and the gateway
 * below is what lets it mint one. Both are built from the same flag, so a build with no URL
 * has no gate either — it is the hand-filled ladder ADR-0021 describes, and a sign-up screen
 * in front of it would be asking for an account the product does not have.
 */

import { QueryClient } from '@tanstack/react-query';

import type {
  AvatarSource,
  BalanceSource,
  CollectionSource,
  InventorySource,
  TransactionSender,
  TransactionSource,
} from '../common';
import {
  FallbackAvatarSource,
  FallbackCollectionSource,
  GameSheetSource,
  MarketServiceSource,
  MimirAvatarSource,
  MimirCollectionSource,
  NodeAvatarSource,
  NodeBalanceSource,
  NodeCollectionSource,
  NodeInventorySource,
  NodeTransactionSender,
  NodeTransactionSource,
  RemoteAccountGateway,
  RemoteRosterSource,
} from '../network';
import { arenaDb } from '../db/client';
import { mmkvPreferences } from '../prefs/mmkvPreferences';
import type { KeystoreStore, PurchaseStore } from './arenaContext';
import { createCollectionRepository } from './collectionRepository';
import { createMarketLibrary, type MarketLibrary } from './marketLibrary';
import { createSheetLibrary, type SheetLibrary } from './sheetLibrary';
import { createRosterRepository } from './rosterRepository';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

const configured = apiUrl === undefined || apiUrl === '' ? undefined : apiUrl;

/** Whether this build talks to a backend at all — what decides if the periodic sync is scheduled. */
export const backendConfigured = configured !== undefined;

const backend =
  configured === undefined
    ? undefined
    : new RemoteRosterSource(configured, () => mmkvPreferences.getApiKey());

/**
 * The account endpoints, which take no key because they are how this device gets one. Built
 * from the same flag as the source: a build with no backend has no accounts either, and
 * `needsAccount` reads its absence as "never gate this app".
 */
const accounts = configured === undefined ? undefined : new RemoteAccountGateway(configured);

export const arenaRepository = createRosterRepository({
  db: arenaDb,
  source: backend,
  sink: backend,
  gateway: accounts,
  preferences: mmkvPreferences,
});

/**
 * Where the unlocked collections are read from (ADR-0044): Mimir first, a plain node behind it.
 *
 * Unlike the sources above it is **not** gated by `EXPO_PUBLIC_API_URL`. Both are public chain
 * services that need no key and know nothing of the backend, so a build with no backend still
 * has a chain to read — the off switch is about the roster's upstream, not about Nine Chronicles.
 */
export const collectionSource: CollectionSource = new FallbackCollectionSource([
  new MimirCollectionSource(),
  new NodeCollectionSource(),
]);

/**
 * The collection tracker's ticks and last chain read, over the same database. Not on
 * `ArenaData` yet: the screen that reads it does not exist, and a context field nothing
 * consumes would be a name for later to inherit.
 */
export const collectionRepository = createCollectionRepository({
  db: arenaDb,
  source: collectionSource,
});

/**
 * The collection sheet (lib9c) and the equipment names (Mimir), fetched when the collection tab
 * opens and kept for the run. Not bundled: that waits on a licence decision (ADR-0044).
 */
export const sheetLibrary: SheetLibrary = createSheetLibrary({ source: new GameSheetSource() });

/**
 * What is on sale of an item, read from Planetarium's market service and kept for a minute. Like
 * the chain sources it is not behind the backend flag: it is a public service that knows nothing
 * of the backend, so a build with no backend still has a market to read.
 */
export const marketLibrary: MarketLibrary = createMarketLibrary({
  source: new MarketServiceSource(),
});

/**
 * What an avatar owns, read from a plain node (docs/AVATAR_INVENTORY.md). Mimir has an
 * `inventory` query too, but on 2026-10-18 it held no document for a live avatar, so the node —
 * which is never behind — is the only source. Public, like the chain sources, so not behind the
 * backend flag.
 */
export const inventorySource: InventorySource = new NodeInventorySource();

/** Who is at an avatar address, read from the same two public services. */
export const avatarSource: AvatarSource = new FallbackAvatarSource([
  new MimirAvatarSource(),
  new NodeAvatarSource(),
]);

/** The imported keystore (a passphrase-locked file), over the device's preferences. */
export const keystoreStore: KeystoreStore = {
  get: () => mmkvPreferences.getKeystore(),
  set: (json) => mmkvPreferences.setKeystore(json),
  clear: () => mmkvPreferences.clearKeystore(),
};

/** Nonce, currency and the unsigned and signed forms of a transaction, from a public node. It cannot send. */
export const transactionSource: TransactionSource = new NodeTransactionSource();

/** The per-purchase limit and the record of purchases, over the device's preferences. */
export const purchaseStore: PurchaseStore = {
  getLimit: () => mmkvPreferences.getPurchaseLimit(),
  setLimit: (ncg) =>
    ncg === null ? mmkvPreferences.clearPurchaseLimit() : mmkvPreferences.setPurchaseLimit(ncg),
  getLog: () => mmkvPreferences.getPurchaseLog(),
  setLog: (json) => mmkvPreferences.setPurchaseLog(json),
  getMode: () => mmkvPreferences.getPurchaseMode(),
  setMode: (mode) => mmkvPreferences.setPurchaseMode(mode),
};

/**
 * The one thing that can stage a transaction. Built here and handed down, but only a purchase that
 * resolved to `live` (which needs `LIVE_SENDING_BUILT` and the person's own setting) ever uses it.
 */
export const transactionSender: TransactionSender = new NodeTransactionSender();

/** NCG held by an account, from a public node (the purchase card's balance line). */
export const balanceSource: BalanceSource = new NodeBalanceSource();

/**
 * TanStack Query's one client, which §4 puts among the providers and §7 explains the job of:
 * it owns the sync call's lifecycle, and nothing else. There is no `useQuery` in this app, so
 * there is no cache here for a component to read from.
 *
 * It lives here, beside the repository, rather than in the root layout where it started,
 * because the layout is not the only caller any more. The periodic task
 * (`backgroundSync.ts`) runs its sync through this same client, and it has to be the *same*
 * one: sharing it is what lets the roster's badge see a background sync and what queues a
 * pull behind one rather than beside it (`syncMutation.ts`). A task started with the app
 * closed gets this module fresh, which is exactly as much sharing as there is to have.
 */
export const arenaQueryClient = new QueryClient();
