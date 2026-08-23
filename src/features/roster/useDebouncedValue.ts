/**
 * Keystroke latency must never wait on a query round-trip (ARCHITECTURE.md §8), so the
 * search field owns its own text and only the *settled* value reaches SQL.
 *
 * 250 ms is the number §8 names. It lives here rather than in the screen so the one place
 * that decides it is the one place that implements it.
 */

import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 250;

export const useDebouncedValue = <T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
};
