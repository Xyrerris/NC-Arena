/**
 * How long ago something happened, as a short phrase — the "updated N ago" the staleness
 * policy asks for (ROADMAP.md Phase 5, "Conflict/staleness policy").
 *
 * It lives here rather than in the roster feature for the reason every other formatter does
 * (ARCHITECTURE.md §6, §10): it is pure arithmetic over two numbers, its edge cases are the
 * boundaries between buckets and a clock that moved, and those are proven in the fast Node
 * project rather than through a rendered screen.
 *
 * **`now` is a parameter, never `Date.now()` read inside.** A function that reads the clock
 * itself cannot be tested at a boundary without faking timers, and the caller has to own the
 * clock anyway: the label has to be recomputed on a tick to stay true, so something above
 * this already knows what time it thinks it is.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short by design — this sits in a header beside the season, and at 200 % font scale a
 * phrase like "about three hours ago" is a second line the layout has not got.
 *
 * A timestamp in the future returns "just now" rather than counting backwards. The device
 * clock is not authoritative and can move under a stored value: a phone that crosses a time
 * zone, or corrects itself against the network, would otherwise render "updated in 2 h",
 * which reads as a bug rather than as the clock skew it is.
 */
export const timeSince = (fromMs: number, nowMs: number): string => {
  const elapsed = nowMs - fromMs;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return `${Math.floor(elapsed / DAY)} d ago`;
};

/**
 * How long until `timeSince` would answer differently, in milliseconds — what a caller
 * ticking the label should wait before recomputing it.
 *
 * Returned rather than left to a fixed interval because the two are not the same cost. A
 * label reading "3 min ago" has to be revisited within the minute; one reading "6 d ago" has
 * a day of slack, and waking React every thirty seconds to re-render a string that cannot
 * have changed is exactly the kind of idle work a phone pays for in battery.
 */
export const nextChangeIn = (fromMs: number, nowMs: number): number => {
  const elapsed = nowMs - fromMs;
  // Ahead of the clock: "just now" holds until the clock catches up and a minute passes.
  if (elapsed < 0) return MINUTE - elapsed;
  if (elapsed < HOUR) return MINUTE - (elapsed % MINUTE);
  if (elapsed < DAY) return HOUR - (elapsed % HOUR);
  return DAY - (elapsed % DAY);
};
