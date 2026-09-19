/**
 * The preference port's own contract, exercised through the in-memory implementation.
 *
 * `mmkvPreferences` is not tested here and cannot be: it opens a native store, which is the
 * same reason it is not re-exported from the barrel (ARCHITECTURE.md §10). What is worth
 * pinning down is the shape both implementations promise — in particular that "absent" is a
 * state each nullable preference can actually return, because every caller branches on it.
 */

import { createMemoryPreferences } from './memoryPreferences';
import { DEFAULT_ROSTER_SORT, DEFAULT_SHORT_UNIT } from './types';

describe('createMemoryPreferences', () => {
  it('starts with no api key, and returns the one it was given', () => {
    expect(createMemoryPreferences().getApiKey()).toBeNull();
    expect(createMemoryPreferences({ apiKey: 'seeded' }).getApiKey()).toBe('seeded');
  });

  it('stores a key acquired during the run — pairing is not a restart', () => {
    const prefs = createMemoryPreferences();
    prefs.setApiKey('paired');
    expect(prefs.getApiKey()).toBe('paired');
  });

  it('clears the key back to absent, not to an empty string', () => {
    const prefs = createMemoryPreferences({ apiKey: 'paired' });
    prefs.clearApiKey();
    // Null rather than '' because every caller asks "is there a key", and a blank string is
    // a key that would be sent as `Bearer `.
    expect(prefs.getApiKey()).toBeNull();
  });

  it('falls back to the declared defaults for the two that have one', () => {
    const prefs = createMemoryPreferences();
    expect(prefs.getShortUnit()).toBe(DEFAULT_SHORT_UNIT);
    expect(prefs.getRosterSort()).toBe(DEFAULT_ROSTER_SORT);
  });

  it('round-trips the sort and the unit', () => {
    const prefs = createMemoryPreferences();
    prefs.setRosterSort('MY_WINS');
    prefs.setShortUnit('MILLIONS');
    expect(prefs.getRosterSort()).toBe('MY_WINS');
    expect(prefs.getShortUnit()).toBe('MILLIONS');
  });
});
