/**
 * `GameSheetSource` (ADR-0044): the collection sheet is plain text from lib9c, the equipment sheet
 * is JSON from Mimir, and the read is both or neither.
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
  const sheetJson = (body: string) =>
    new Response(JSON.stringify({ data: { sheet: { csv: body } } }), { status: 200 });

  it('takes the collection sheet from lib9c as text and the equipment sheet from Mimir', async () => {
    const fetchMock = route({
      lib9c: csv('id,item_id1\r\n1,10110000'),
      mimir: sheetJson('id,_name'),
    });

    const result = await new GameSheetSource().read('heimdall');

    expect(result).toEqual({
      ok: true,
      value: {
        collectionCsv: 'id,item_id1\r\n1,10110000',
        equipmentCsv: 'id,_name',
        source: 'lib9c+mimir',
      },
    });
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual(expect.arrayContaining([LIB9C_COLLECTION_SHEET_URL, MIMIR]));
    const mimirCall = fetchMock.mock.calls.find((call) => call[0] === MIMIR) as [
      string,
      RequestInit,
    ];
    expect(String(mimirCall[1].body)).toContain('EquipmentItemSheet');
  });

  it('reads the item sheet from Heimdall for a planet Mimir does not serve', async () => {
    const fetchMock = route({ lib9c: csv('id'), mimir: sheetJson('id,_name') });

    await new GameSheetSource().read('thor');

    expect(fetchMock.mock.calls.map((call) => call[0])).toContain(MIMIR);
  });

  it('fails whole when either sheet is missing, never half a list', async () => {
    route({
      lib9c: new Response('404: Not Found', { status: 404 }),
      mimir: sheetJson('id,_name'),
    });
    const noCollection = await new GameSheetSource().read('heimdall');

    route({ lib9c: csv('id'), mimir: new Response(JSON.stringify({ data: { sheet: null } })) });
    const noEquipment = await new GameSheetSource().read('heimdall');

    expect(noCollection.ok).toBe(false);
    expect(noEquipment.ok).toBe(false);
  });

  it('calls an unreachable host OFFLINE and an empty collection sheet FAILED', async () => {
    route({ lib9c: new TypeError('Network request failed'), mimir: sheetJson('id,_name') });
    const offline = await new GameSheetSource().read('heimdall');

    route({ lib9c: csv('   '), mimir: sheetJson('id,_name') });
    const empty = await new GameSheetSource().read('heimdall');

    expect(offline).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });
    expect(empty).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
  });
});
