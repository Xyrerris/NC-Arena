/**
 * `GameSheetSource` (ADR-0044): the collection sheet is plain text from lib9c, the item sheets are
 * JSON from Mimir (one request, four sheets by alias), and the read is all of them or none.
 */

import { GameSheetSource, LIB9C_COLLECTION_SHEET_URL } from './gameSheetSource';

const MIMIR = 'https://mimir.nine-chronicles.dev/heimdall/graphql/';

describe('GameSheetSource', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const route = (answers: { lib9c: Response | Error; mimir: Response | Error }): jest.Mock => {
    const fetchMock = jest.fn((url: string) => {
      const answer = url === LIB9C_COLLECTION_SHEET_URL ? answers.lib9c : answers.mimir;
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone());
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const csv = (body: string) => new Response(body, { status: 200 });
  const sheetsJson = (sheets: Record<string, string | null> = {}) =>
    new Response(
      JSON.stringify({
        data: Object.fromEntries(
          ['equipment', 'costume', 'material', 'consumable'].map((alias) => {
            const body = alias in sheets ? sheets[alias] : `id,_name,${alias}`;
            return [alias, body === null ? null : { csv: body }];
          }),
        ),
      }),
      { status: 200 },
    );

  it('takes the collection sheet from lib9c as text and the item sheets from Mimir in one request', async () => {
    const fetchMock = route({
      lib9c: csv('id,item_id1\r\n1,10110000'),
      mimir: sheetsJson(),
    });

    const result = await new GameSheetSource().read('heimdall');

    expect(result).toEqual({
      ok: true,
      value: {
        collectionCsv: 'id,item_id1\r\n1,10110000',
        equipmentCsv: 'id,_name,equipment',
        costumeCsv: 'id,_name,costume',
        materialCsv: 'id,_name,material',
        consumableCsv: 'id,_name,consumable',
        source: 'lib9c+mimir',
      },
    });
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual(expect.arrayContaining([LIB9C_COLLECTION_SHEET_URL, MIMIR]));
    expect(urls.filter((url) => url === MIMIR)).toHaveLength(1);
    const mimirCall = fetchMock.mock.calls.find((call) => call[0] === MIMIR) as [
      string,
      RequestInit,
    ];
    for (const sheet of [
      'EquipmentItemSheet',
      'CostumeItemSheet',
      'MaterialItemSheet',
      'ConsumableItemSheet',
    ]) {
      expect(String(mimirCall[1].body)).toContain(sheet);
    }
  });

  it('reads the item sheets from Heimdall for a planet Mimir does not serve', async () => {
    const fetchMock = route({ lib9c: csv('id'), mimir: sheetsJson() });

    await new GameSheetSource().read('thor');

    expect(fetchMock.mock.calls.map((call) => call[0])).toContain(MIMIR);
  });

  it('fails whole when any sheet is missing, never half a list', async () => {
    route({
      lib9c: new Response('404: Not Found', { status: 404 }),
      mimir: sheetsJson(),
    });
    const noCollection = await new GameSheetSource().read('heimdall');

    route({ lib9c: csv('id'), mimir: new Response(JSON.stringify({ data: { equipment: null } })) });
    const noItems = await new GameSheetSource().read('heimdall');

    route({ lib9c: csv('id'), mimir: sheetsJson({ material: null }) });
    const noMaterials = await new GameSheetSource().read('heimdall');

    expect(noCollection.ok).toBe(false);
    expect(noItems.ok).toBe(false);
    expect(noMaterials.ok).toBe(false);
  });

  it('calls an unreachable host OFFLINE and an empty collection sheet FAILED', async () => {
    route({ lib9c: new TypeError('Network request failed'), mimir: sheetsJson() });
    const offline = await new GameSheetSource().read('heimdall');

    route({ lib9c: csv('   '), mimir: sheetsJson() });
    const empty = await new GameSheetSource().read('heimdall');

    expect(offline).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });
    expect(empty).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
  });
});
