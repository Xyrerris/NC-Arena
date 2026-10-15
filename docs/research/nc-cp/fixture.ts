/**
 * Real inputs for one avatar (Xyrerris, Heimdall, 2026-09-30), captured from the public GraphQL node
 * and the lib9c sheets. Collections are pre-summed: 442 unlocked ids reduced to one modifier per
 * stat and operation, which is equivalent because `combatPower` sums them anyway.
 *
 * `expected` is what the game client showed for the Adventure battle type.
 */
import type { CombatPowerInput } from './combatPower';

export const adventure: { input: CombatPowerInput; expected: number } = {
  expected: 33_888_480_295,
  input: {
    level: 494,
    character: {
      base: { HP: 300, ATK: 20, DEF: 10, CRI: 10, HIT: 90, SPD: 70 },
      perLevel: { HP: 12, ATK: 0.8, DEF: 0.4, CRI: 0, HIT: 3.6, SPD: 2.8 },
    },
    equipment: [
      // WEAPON
      { stats: { ATK: 59874267, SPD: 51723025 }, skillCount: 1 },
      // ARMOR
      { stats: { HP: 625226855, ATK: 31414960, SPD: 32810722 }, skillCount: 1 },
      // BELT
      { stats: { ATK: 14452591, SPD: 300253925 }, skillCount: 1 },
      // NECKLACE
      { stats: { ATK: 11009417, HIT: 174760577, SPD: 26204784 }, skillCount: 1 },
      // RING
      { stats: { ATK: 20340901, DEF: 25121231, SPD: 24968633 }, skillCount: 1 },
      // RING
      { stats: { ATK: 49423399, DEF: 49627143, SPD: 37744148 }, skillCount: 1 },
      // AURA
      { stats: { ATK: 3082080, DEF: 2113766 }, skillCount: 1 },
      // GRIMOIRE
      { stats: { SPD: 20483634 }, skillCount: 1 },
    ],
    costumeStats: [
      { stat: 'SPD', value: 409111906 }, // 40100069
      { stat: 'ATK', value: 29222279 },
      { stat: 'SPD', value: 10405962 }, // 49900059
      { stat: 'ATK', value: 5671854 },
    ],
    runes: [
      // 10049
      {
        totalCp: 7803185,
        stats: [
          { stat: 'SPD', value: 1451883 },
          { stat: 'HIT', value: 1498929 },
        ],
      },
      // 10056
      {
        totalCp: 32365000,
        stats: [
          { stat: 'HIT', value: 6200000 },
          { stat: 'ATK', value: 1290000 },
          { stat: 'SPD', value: 1520000 },
        ],
      },
      // 10043
      {
        totalCp: 4782320,
        stats: [
          { stat: 'ATK', value: 112564 },
          { stat: 'DEF', value: 247657 },
        ],
      },
      // 10051
      {
        totalCp: 16214659,
        stats: [
          { stat: 'ATK', value: 1219747 },
          { stat: 'SPD', value: 1135772 },
        ],
      },
      // 10050
      {
        totalCp: 2489217,
        stats: [
          { stat: 'CRI', value: 29 },
          { stat: 'HP', value: 3454235 },
        ],
      },
      // 10021
      {
        totalCp: 587475,
        stats: [
          { stat: 'ATK', value: 36200 },
          { stat: 'DEF', value: 10425 },
        ],
      },
      // 10047
      {
        totalCp: 5108338,
        stats: [
          { stat: 'ATK', value: 349269 },
          { stat: 'SPD', value: 480338 },
        ],
      },
      // 10041
      {
        totalCp: 2769411,
        stats: [
          { stat: 'DEF', value: 114453 },
          { stat: 'HP', value: 1382064 },
          { stat: 'HIT', value: 103905 },
        ],
      },
    ],
    runeLevelBonus: 538723,
    collections: [
      { stat: 'HP', operation: 'Add', value: 116015429 },
      { stat: 'ATK', operation: 'Add', value: 29859707 },
      { stat: 'DEF', operation: 'Add', value: 13145221 },
      { stat: 'HIT', operation: 'Add', value: 35184449 },
      { stat: 'SPD', operation: 'Add', value: 96098092 },
      { stat: 'ATK', operation: 'Percentage', value: 417 },
      { stat: 'HP', operation: 'Percentage', value: 342 },
      { stat: 'HIT', operation: 'Percentage', value: 120 },
      { stat: 'SPD', operation: 'Percentage', value: 376 },
      { stat: 'DEF', operation: 'Percentage', value: 183 },
      { stat: 'CDMG', operation: 'Percentage', value: 341 },
    ],
  },
};
