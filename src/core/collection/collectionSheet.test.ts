import { parseCollectionSheet } from './collectionSheet';

const HEADER =
  'id,item_id1,count1,level1,skill1,item_id2,count2,level2,skill2,item_id3,count3,level3,skill3,' +
  'item_id4,count4,level4,skill4,item_id5,count5,level5,skill5,item_id6,count6,level6,skill6,' +
  'stat_type1,modify_type1,modify_value1,stat_type2,modify_type2,modify_value2,' +
  'stat_type3,modify_type3,modify_value3';

// Rows copied from lib9c's CollectionSheet.csv: one with three bonuses, one with a single item.
const ROW_1 =
  '1,10110000,1,0,TRUE,10211000,1,0,TRUE,10510000,1,0,TRUE,10120000,1,0,TRUE,10222000,1,0,TRUE,,,,,' +
  'HP,Add,1240,ATK,Add,440,DEF,Add,88';
const ROW_2 = '2,10110000,1,0,TRUE,10114000,1,0,TRUE,,,,,,,,,,,,,,,,,ATK,Add,708,,,,,,';

describe('parseCollectionSheet', () => {
  it('reads the required items and the bonuses of a row', () => {
    const [first] = parseCollectionSheet([HEADER, ROW_1].join('\n'));
    expect(first?.id).toBe(1);
    expect(first?.requirements.map((r) => r.itemId)).toEqual([
      10110000, 10211000, 10510000, 10120000, 10222000,
    ]);
    expect(first?.bonuses).toEqual([
      { stat: 'HP', operation: 'Add', value: 1240 },
      { stat: 'ATK', operation: 'Add', value: 440 },
      { stat: 'DEF', operation: 'Add', value: 88 },
    ]);
  });

  it('stops at the first empty slot and tolerates CRLF and a trailing newline', () => {
    const rows = parseCollectionSheet([HEADER, ROW_2, ''].join('\r\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requirements).toHaveLength(2);
    expect(rows[0]?.bonuses).toEqual([{ stat: 'ATK', operation: 'Add', value: 708 }]);
  });

  it('finds columns by name, so a reordered sheet still parses', () => {
    const reordered = 'modify_value1,' + HEADER.replace('modify_value1', 'extra');
    const rows = parseCollectionSheet([reordered, '999,' + ROW_2].join('\n'));
    expect(rows[0]?.requirements[0]?.itemId).toBe(10110000);
  });

  it('throws rather than dropping a row it cannot read', () => {
    expect(() => parseCollectionSheet([HEADER, '3,abc,1,0,TRUE'].join('\n'))).toThrow(/row 2/);
    expect(() =>
      parseCollectionSheet([HEADER, '4,,,,,,,,,,,,,,,,,,,,,,,,,ATK,Add,1'].join('\n')),
    ).toThrow(/no required item/);
    expect(() => parseCollectionSheet('id,foo\n1,2')).toThrow(/item_id1/);
    expect(() => parseCollectionSheet('')).toThrow(/empty/);
  });
});
