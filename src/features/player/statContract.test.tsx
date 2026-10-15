/**
 * The §2.1 contract test (ROADMAP.md Phase 5 exit criteria), end to end:
 *
 *     JSON text → RemoteRosterSource (Zod) → replaceRoster (SQLite) → repository (domain)
 *       → PlayerDetailScreen (UI)
 *
 * Every other test of this rule covers one layer. This one runs them all in a row, from the
 * bytes a server sends to the digits on screen, so a layer that quietly narrowed a value —
 * a driver reading 32 bits, a mapper through `parseInt`, a formatter through `toFixed` — has
 * nowhere to hide between two unit tests that each passed.
 *
 * The body is written as **text**, never as numbers passed through `JSON.stringify`. A value
 * above `Number.MAX_SAFE_INTEGER` cannot exist as a JavaScript number, so the only way to
 * send one is the way a server would: as characters, rounded by `JSON.parse` on arrival.
 * That rounding is what the second half proves the app refuses rather than stores.
 */

import { cleanup, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArenaDataProvider, type RosterRepository } from '@/core/data';
import { asPlayerId } from '@/core/model';
import {
  createStubLiveData,
  createTestDatabase,
  createTestRepository,
  serveRosterJson,
  type TestDatabase,
  type WireSource,
} from '@/core/testing';

import { PlayerDetailScreen } from './PlayerDetailScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));

const PLAYER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

/**
 * One player whose stats straddle every boundary that matters: one past `Int32.MAX`, `2^32`,
 * a twelve-digit value, and `Number.MAX_SAFE_INTEGER` itself — the top of the contract.
 * `atk` is a parameter so the rejection case can put a number past the top in its place.
 */
const snapshotJson = (atk: string): string => `{
  "season": 41,
  "viewerId": "${PLAYER_ID}",
  "players": [
    {
      "id": "${PLAYER_ID}",
      "name": "Skarn",
      "level": 488,
      "gameCode": "a984",
      "rank": 1,
      "combatPower": 3000000000,
      "score": 1712,
      "hp": 2147483648,
      "atk": ${atk},
      "def": 9007199254740991,
      "critBp": 584127,
      "hit": 4294967296,
      "spd": 12
    }
  ],
  "headToHead": []
}`;

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

describe('§2.1 — a stat travels from the wire to the screen unchanged', () => {
  let handle: TestDatabase;
  const served: WireSource[] = [];

  const serve = (body: string): WireSource => {
    const wire = serveRosterJson(body);
    served.push(wire);
    return wire;
  };

  const storedAtk = (repository: RosterRepository): number | undefined => {
    const live = repository.observePlayer(asPlayerId(PLAYER_ID));
    return live.map(live.query.all())?.player.atk;
  };

  beforeEach(() => {
    handle = createTestDatabase();
  });

  afterEach(async () => {
    await cleanup();
    while (served.length > 0) served.pop()?.restore();
    handle.close();
  });

  it('shows every value above Int32.MAX digit for digit, up to MAX_SAFE_INTEGER', async () => {
    const { repository } = createTestRepository(
      handle.db,
      serve(snapshotJson('987654321012')).source,
    );

    expect((await repository.refresh()).ok).toBe(true);
    await render(<PlayerDetailScreen id={asPlayerId(PLAYER_ID)} />, {
      wrapper: wrapWith(repository),
    });

    // The accessibility label carries the exact representation, one node per stat.
    const exact = (key: string): unknown =>
      screen.getByTestId(`stat-${key}`).props.accessibilityLabel;
    expect(exact('HP')).toBe('HP, 2.147.483.648');
    expect(exact('ATK')).toBe('ATK, 987.654.321.012');
    expect(exact('DEF')).toBe('DEF, 9.007.199.254.740.991');
    expect(exact('HIT')).toBe('HIT, 4.294.967.296');
    // Combat power, in the header, past Int32.MAX as well.
    expect(screen.getAllByText('3.000.000.000').length).toBeGreaterThan(0);
  });

  it('refuses a value above MAX_SAFE_INTEGER at parse time, and keeps the ladder it had', async () => {
    const first = serve(snapshotJson('987654321012'));
    const { repository, restart } = createTestRepository(handle.db, first.source);
    expect((await repository.refresh()).ok).toBe(true);

    // 2^53 + 1. `JSON.parse` turns it into 2^53, which is not a safe integer: storing that
    // would be a silently wrong stat, one off, that no screen could ever reveal.
    const next = restart(serve(snapshotJson('9007199254740993')).source);
    const refreshed = await next.refresh();

    expect(refreshed.ok).toBe(false);
    // Nothing was written: the last good value is still the one on disk.
    expect(storedAtk(next)).toBe(987_654_321_012);
  });
});
