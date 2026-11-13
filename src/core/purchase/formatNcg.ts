/**
 * An NCG amount as the app writes it. Shared by the purchase sheets and the screens that list
 * prices, so a price reads the same wherever it is shown.
 */

import { statFormatter } from '../common';

/**
 * `142,5`, `1.250`, `0,25`: the app's punctuation (ADR-0025), two decimals at most and none when
 * the price is whole. Done in whole hundredths so no floating-point `toFixed` is involved
 * (ARCHITECTURE.md §2.2); a price under a hundredth is shown as such rather than as `0`.
 */
export const formatNcg = (price: number): string => {
  const hundredths = Math.round(price * 100);
  if (hundredths === 0 && price > 0) return '<0,01';
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  const grouped = statFormatter.exact(whole);
  if (fraction === 0) return grouped;
  const digits = String(fraction).padStart(2, '0').replace(/0$/, '');
  return `${grouped},${digits}`;
};
