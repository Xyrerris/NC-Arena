/**
 * Reading the costume, material and consumable sheets into one catalog of "what is this id".
 * The costume fixture has lib9c's real quirk: rows that describe the columns and are not items.
 */

import { parseOtherItems } from './otherItems';

const HEADER = 'id,_name,item_sub_type,grade,elemental_type';

describe('parseOtherItems', () => {
  const sheets = {
    costumeCsv: [
      HEADER,
      '_item_sub_type,FullCostume|HairCostume|Title,,,',
      '_elemental_type,Normal|Fire,,,',
      '40100015,Black Dress,FullCostume,2,Normal',
    ].join('\r\n'),
    materialCsv: [
      HEADER,
      '600201,Mithril Dust,EquipmentMaterial,0,Normal',
      '100000,보물상자,NormalMaterial,1,Normal',
    ].join('\r\n'),
    consumableCsv: [HEADER, '201000,Herbal Tea,Food,1,Normal'].join('\r\n'),
  };

  it('gives each id its name, its sheet name for the kind and the kind of sheet it came from', () => {
    const catalog = parseOtherItems(sheets);

    expect(catalog.get(40100015)).toEqual({
      id: 40100015,
      name: 'Black Dress',
      subType: 'FullCostume',
      kind: 'costume',
    });
    expect(catalog.get(600201)).toMatchObject({ subType: 'EquipmentMaterial', kind: 'material' });
    expect(catalog.get(201000)).toMatchObject({ name: 'Herbal Tea', kind: 'consumable' });
  });

  it('keeps a Korean name as it is, and skips the rows that only describe columns', () => {
    const catalog = parseOtherItems(sheets);

    expect(catalog.get(100000)?.name).toBe('보물상자');
    expect(catalog.size).toBe(4);
  });

  it('fails on a sheet that lost a column, so a list is not built from a file it cannot read', () => {
    expect(() => parseOtherItems({ ...sheets, materialCsv: 'id,_name' })).toThrow(
      'MaterialItemSheet has no "item_sub_type" column',
    );
    expect(() => parseOtherItems({ ...sheets, costumeCsv: '' })).toThrow(
      'CostumeItemSheet is empty',
    );
  });
});
