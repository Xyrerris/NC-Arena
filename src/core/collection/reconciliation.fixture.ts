/**
 * An invented sheet, in lib9c's column layout, small enough to reason about by hand.
 *
 * Invented on purpose: the real sheet is not bundled yet (ADR-0044 leaves its licence to the
 * owner), and these tests are about the reconciliation rules, not about what the game currently
 * ships. The ids and stats are made up; what is real is the shape — the same header, the same
 * empty cells for an unused slot — so `parseCollectionSheet` reads it the way it reads the
 * real one.
 *
 * What each collection is for:
 *
 *   1  three items (weapon, armour, aura)        — the big one
 *   2  one weapon, shared with 3                 — a single-item collection
 *   3  the same weapon plus a belt               — shares item 10110000 with 2
 *   4  one grimoire                              — a different kind of item
 *   5  one costume
 *   6  one costume, the same one as 5            — two collections, one item
 */

const HEADER =
  'id,item_id1,count1,level1,skill1,item_id2,count2,level2,skill2,item_id3,count3,level3,skill3,' +
  'item_id4,count4,level4,skill4,item_id5,count5,level5,skill5,item_id6,count6,level6,skill6,' +
  'stat_type1,modify_type1,modify_value1,stat_type2,modify_type2,modify_value2,' +
  'stat_type3,modify_type3,modify_value3';

const EMPTY_SLOT = ',,,';
const slot = (itemId: number): string => `${itemId},1,0,TRUE`;
const slots = (...itemIds: number[]): string =>
  Array.from({ length: 6 }, (_, i) => {
    const id = itemIds[i];
    return id === undefined ? EMPTY_SLOT : slot(id);
  }).join(',');

const row = (id: number, items: number[], stats: string): string =>
  `${id},${slots(...items)},${stats}`;

export const FAKE_SHEET_CSV = [
  HEADER,
  row(1, [10110000, 10210000, 10660000], 'HP,Add,1000,ATK,Add,400,DEF,Add,80'),
  row(2, [10110000], 'ATK,Add,500,,,,,,'),
  row(3, [10110000, 10310000], 'ATK,Add,700,,,,,,'),
  row(4, [10750000], 'HP,Percentage,2,,,,,,'),
  row(5, [40100001], 'SPD,Add,10,,,,,,'),
  row(6, [40100001], 'HIT,Add,20,,,,,,'),
].join('\n');
