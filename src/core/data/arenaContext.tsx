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

import type { AvatarSource } from '../common';
import type { CollectionRepository } from './collectionRepository';
import type { UseLiveData } from './liveData';
import type { RosterRepository } from './rosterRepository';

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
