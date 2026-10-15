/**
 * The staleness label's arithmetic, at its boundaries. Every case here is a minute, an hour
 * or a day either side of a bucket edge — which is the whole of what this formatter can get
 * wrong, and none of it is visible in a rendered screen test.
 */

import { nextChangeIn, timeSince } from './relativeTime';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** An arbitrary fixed "now", so no test depends on when it runs. */
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

const since = (elapsed: number): string => timeSince(NOW - elapsed, NOW);

describe('timeSince', () => {
  it('says "just now" for anything under a minute', () => {
    expect(since(0)).toBe('just now');
    expect(since(MINUTE - 1)).toBe('just now');
  });

  it('switches to minutes exactly on the minute', () => {
    expect(since(MINUTE)).toBe('1 min ago');
    expect(since(HOUR - 1)).toBe('59 min ago');
  });

  it('switches to hours exactly on the hour', () => {
    expect(since(HOUR)).toBe('1 h ago');
    expect(since(DAY - 1)).toBe('23 h ago');
  });

  it('switches to days exactly on the day, and keeps counting', () => {
    expect(since(DAY)).toBe('1 d ago');
    expect(since(9 * DAY)).toBe('9 d ago');
    expect(since(400 * DAY)).toBe('400 d ago');
  });

  it('floors rather than rounds, so a label never claims more time than has passed', () => {
    // 119 seconds is not "2 min ago" — it has not been two minutes.
    expect(since(2 * MINUTE - 1000)).toBe('1 min ago');
    expect(since(2 * HOUR - 1000)).toBe('1 h ago');
  });

  it('says "just now" for a timestamp in the future rather than counting backwards', () => {
    // A phone that corrects its clock against the network, or crosses a time zone, can
    // leave a stored value ahead of `now`. "updated in 2 h" reads as a bug.
    expect(timeSince(NOW + HOUR, NOW)).toBe('just now');
  });
});

describe('nextChangeIn', () => {
  it('waits out the remainder of the current minute, not a whole one', () => {
    // 90 s elapsed reads "1 min ago" and becomes "2 min ago" 30 s from now.
    expect(nextChangeIn(NOW - 90_000, NOW)).toBe(30_000);
  });

  it('slows to the hour once the label is counting hours', () => {
    expect(nextChangeIn(NOW - (HOUR + 10 * MINUTE), NOW)).toBe(HOUR - 10 * MINUTE);
  });

  it('slows to the day once the label is counting days', () => {
    // A label reading "3 d ago" cannot change for most of a day; waking to re-render it
    // every half minute is idle work a phone pays for.
    expect(nextChangeIn(NOW - (3 * DAY + 2 * HOUR), NOW)).toBe(DAY - 2 * HOUR);
  });

  it('never returns zero or less, which would spin a timer', () => {
    for (const elapsed of [0, MINUTE, HOUR, DAY, 5 * DAY, -HOUR]) {
      expect(nextChangeIn(NOW - elapsed, NOW)).toBeGreaterThan(0);
    }
  });

  it('holds "just now" until a clock that is ahead catches up', () => {
    expect(nextChangeIn(NOW + HOUR, NOW)).toBe(MINUTE + HOUR);
  });
});
