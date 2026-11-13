/**
 * `createSheetLibrary` (ADR-0044): one read per run on success, and a failure is not kept, so a
 * retry button asks again.
 */

import { err, ok, type SheetSource } from '../common';
import { createSheetLibrary } from './sheetLibrary';

describe('createSheetLibrary', () => {
  const sheets = {
    collectionCsv: 'a',
    equipmentCsv: 'b',
    costumeCsv: 'c',
    materialCsv: 'd',
    consumableCsv: 'e',
    source: 'test',
  };

  it('makes one read for two loads, and keeps a success', async () => {
    const read = jest.fn(() => Promise.resolve(ok(sheets)));
    const source: SheetSource = { name: 'test', read };
    const library = createSheetLibrary({ source });

    const [first, second] = await Promise.all([library.load('heimdall'), library.load('heimdall')]);
    await library.load('heimdall');

    expect(first).toBe(second);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure, so a retry asks again', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce(err({ reason: 'OFFLINE', message: 'down' }))
      .mockResolvedValueOnce(ok(sheets));
    const library = createSheetLibrary({ source: { name: 'test', read } });

    const first = await library.load('heimdall');
    const second = await library.load('heimdall');

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
