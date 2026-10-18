/**
 * How a screen reaches the repository.
 *
 * Passed through context rather than imported, because the wired-up instance
 * (`arenaRepository`) opens a real `expo-sqlite` handle and a real MMKV store at module
 * load. A screen that imported it directly could not be rendered in a test, and the Phase 3
 * exit criteria are component tests. The route layer owns the wiring — it is already the
 * only layer allowed to import core/db (ARCHITECTURE.md §7) — and everything below it
 * receives it.
 *
 * The live-data runner travels with the repository for the same reason: on device it is
 * `useLiveQuery` over `expo-sqlite`, and in a test it is a direct `.all()` (ADR-0012).
 */

import { createContext, useContext, type ReactNode } from 'react';

import type {
  AvatarSource,
  BalanceSource,
  InventorySource,
  TransactionSender,
  TransactionSource,
} from '../common';
import type { CollectionRepository } from './collectionRepository';
import type { UseLiveData } from './liveData';
import type { MarketLibrary } from './marketLibrary';
import type { RosterRepository } from './rosterRepository';
import type { SheetLibrary } from './sheetLibrary';

export interface ArenaData {
  repository: RosterRepository;
  useLiveData: UseLiveData;
  /**
   * Reads the name behind a typed-in avatar address, so it can be shown for confirmation
   * (ADR-0044). Optional because only the avatar block uses it: absent, that block saves an
   * address on its shape alone, which is what every other screen's test provider relies on.
   * `_layout.tsx` always supplies it.
   */
  avatarSource?: AvatarSource;
  /**
   * The collection tracker's ticks and chain read (ADR-0044). Optional for the same reason
   * `avatarSource` is — only the collection screen reads it — and that screen refuses to render
   * without it, loudly, rather than showing a tracker that cannot save.
   */
  collections?: CollectionRepository;
  /**
   * The game's collection and item sheets (ADR-0044). Optional like the two above: only the
   * collection screen reads it, and only when its route did not hand it a sheet directly.
   */
  sheets?: SheetLibrary;
  /**
   * What is on sale of an item, scanned and kept for a minute (ADR-0044, "Next: buying"). Optional
   * like the rest: only the market sheet reads it, and a build that forgot to wire it fails there.
   */
  market?: MarketLibrary;
  /**
   * What the active avatar owns, read from the chain so the collection screen can mark the pieces
   * it already has. Optional like the rest: without it the screen shows no ownership at all.
   */
  inventory?: InventorySource;
  /**
   * How much NCG an account holds, for the purchase card (ADR-0044, step A). Optional like the
   * rest; without it the card says the balance could not be read instead of guessing one.
   */
  balance?: BalanceSource;
  /**
   * The keystore the person imported, kept on the device (ADR-0044, step B). Optional like the
   * rest: only the keystore section reads it.
   */
  keystore?: KeystoreStore;
  /**
   * The per-purchase limit and the record of purchases (ADR-0044, step D). Optional like the rest:
   * only the wallet block and the purchase flow read it.
   */
  purchases?: PurchaseStore;
  /**
   * Asks a node about a transaction: nonce, currency, the unsigned form, the signed form. It has no
   * method that sends (ADR-0044, step C), so what holds it cannot spend. Optional like the rest.
   */
  transactions?: TransactionSource;
  /**
   * The one thing that can send a transaction (ADR-0044, step D). Optional, and only handed to a
   * purchase that resolved to `live`: a dry run is never given it.
   */
  sender?: TransactionSender;
}

/**
 * Where the purchase limit and the purchase record live. The limit is a number the person chose
 * (none means nothing can be bought); the record is JSON text, validated by `core/common/purchaseLog`.
 */
export interface PurchaseStore {
  getLimit(): number | null;
  setLimit(ncg: number | null): void;
  getLog(): string | null;
  setLog(json: string): void;
  /** `live` when the person has turned real purchases on, or null. Anything else is a dry run. */
  getMode(): string | null;
  setMode(mode: 'dry-run' | 'live'): void;
}

/**
 * Where the imported keystore text lives. A keystore is already encrypted with a passphrase this
 * app never keeps, so this is a locked file on disk and not a secret: no key is stored, and no
 * passphrase either.
 */
export interface KeystoreStore {
  get(): string | null;
  set(json: string): void;
  clear(): void;
}

const ArenaDataContext = createContext<ArenaData | null>(null);

export interface ArenaDataProviderProps {
  value: ArenaData;
  children: ReactNode;
}

export function ArenaDataProvider({ value, children }: ArenaDataProviderProps) {
  return <ArenaDataContext.Provider value={value}>{children}</ArenaDataContext.Provider>;
}

export const useArenaData = (): ArenaData => {
  const value = useContext(ArenaDataContext);
  if (value === null) {
    throw new Error(
      'useArenaData was called outside <ArenaDataProvider>. The provider belongs in ' +
        'src/app/_layout.tsx, and in a test it wraps the component under test.',
    );
  }
  return value;
};
