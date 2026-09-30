/**
 * Manual parity check: `npx tsx docs/research/nc-cp/check.ts`.
 * Not a Jest test on purpose — this folder is kept aside (README.md) and outside the app's suites.
 */
import { combatPower } from './combatPower';
import { adventure } from './fixture';

const result = combatPower(adventure.input);
const diff = result.total - adventure.expected;
const percent = ((diff / adventure.expected) * 100).toFixed(4);

console.log(result);
console.log(`expected ${adventure.expected}, got ${result.total}, diff ${diff} (${percent}%)`);

// Adventure matched to 0.0045 % when this was written; anything past 0.1 % means a formula moved.
if (Math.abs(diff / adventure.expected) > 0.001) {
  console.error('CP drifted from the game client.');
  process.exit(1);
}
