/**
 * The record of purchases (ADR-0044, step D): what is stored, how it is read back, and that a log
 * that cannot be understood is never mistaken for an empty one.
 */

import {
  MAX_RECORDS,
  appendRecord,
  parsePurchaseLog,
  purchaseLogOver,
  serialisePurchaseLog,
  updateRecord,
  type PurchaseRecord,
} from './purchaseLog';

const record = (n: number, overrides: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: `r${n}`,
  productId: `p${n}`,
  planet: 'heimdall',
  itemId: 10110000,
  price: 10,
  mode: 'dry-run',
  status: 'dry-run',
  at: n,
  transactionId: null,
  note: null,
  ...overrides,
});

describe('parsePurchaseLog', () => {
  it('reads nothing stored as an empty log', () => {
    expect(parsePurchaseLog(null)).toEqual({ records: [], unreadable: false });
  });

  it('reads back what was written', () => {
    const records = [record(1), record(2, { mode: 'live', status: 'sent', transactionId: 'abc' })];

    expect(parsePurchaseLog(serialisePurchaseLog(records))).toEqual({ records, unreadable: false });
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON that is not a list', '{"a":1}'],
    ['a record with an unknown status', JSON.stringify([{ ...record(1), status: 'bought' }])],
    ['a record missing its product', JSON.stringify([{ ...record(1), productId: undefined }])],
  ])('calls %s unreadable, not empty', (_what, text) => {
    expect(parsePurchaseLog(text)).toEqual({ records: [], unreadable: true });
  });
});

describe('appendRecord and updateRecord', () => {
  it('adds a record at the end and changes one by id, leaving the rest', () => {
    const log = appendRecord([record(1)], record(2, { status: 'prepared' }));

    expect(log.map((r) => r.id)).toEqual(['r1', 'r2']);
    const updated = updateRecord(log, 'r2', {
      status: 'dry-run',
      transactionId: 'abc',
      note: 'ok',
    });
    expect(updated[1]).toMatchObject({ status: 'dry-run', transactionId: 'abc', note: 'ok' });
    expect(updated[0]).toEqual(record(1));
    expect(updateRecord(log, 'missing', { status: 'failed' })).toEqual(log);
  });

  it('keeps the log to its size by dropping the oldest harmless entries, never one that blocks', () => {
    const blocking = record(0, { id: 'live', mode: 'live', status: 'sent' });
    const full = [blocking, ...Array.from({ length: MAX_RECORDS - 1 }, (_, i) => record(i + 1))];

    const log = appendRecord(full, record(999));

    expect(log).toHaveLength(MAX_RECORDS);
    expect(log[0]).toEqual(blocking);
    expect(log.find((r) => r.id === 'r1')).toBeUndefined();
    expect(log[log.length - 1]?.id).toBe('r999');
  });
});

describe('purchaseLogOver', () => {
  it('reads and writes through the text store', () => {
    let kept: string | null = null;
    const store = purchaseLogOver({
      get: () => kept,
      set: (json) => {
        kept = json;
      },
    });

    expect(store.read().records).toEqual([]);
    store.write([record(1)]);
    expect(store.read().records).toEqual([record(1)]);
    kept = 'garbage';
    expect(store.read().unreadable).toBe(true);
  });
});
