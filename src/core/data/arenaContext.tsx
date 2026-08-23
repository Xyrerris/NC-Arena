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

import type { UseLiveData } from './liveData';
import type { RosterRepository } from './rosterRepository';

export interface ArenaData {
  repository: RosterRepository;
  useLiveData: UseLiveData;
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
