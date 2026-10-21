/**
 * The record of purchases, written **before** anything is signed or sent (ADR-0044, "Next: buying",
 * step D).
 *
 * Why before: a send whose answer is lost is not a send that did not happen. If the app dies between
 * "I asked the node to stage it" and "it said yes", the only trace that a purchase was begun is the
 * line written first — and that line is what stops the same offer from being bought a second time.
 * So a record exists from the moment a purchase is prepared, and moves forward from there:
 * `prepared` → `dry-run` | `sent` → `confirmed`, or `failed` when it is known not to have happened.
 *
 * Only **live** records that are not `failed` block a second purchase of the offer (see
 * `blocksPurchase`): a dry run buys nothing, and a failure is a fact that frees the offer. A record
 * left `prepared` by a crash blocks, deliberately — "it may have gone" is the safe reading, and the
 * person can see it and clear it.
 *
 * Stored as JSON text, validated on the way in: a log written by code that no longer exists reads as
 * *unreadable* and not as *empty*, because an empty log would say "nothing was bought" about a
 * purchase that may have been.
 */

import { z } from 'zod';

export type PurchaseStatus = 'prepared' | 'dry-run' | 'sent' | 'confirmed' | 'failed';

const recordSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  planet: z.string().min(1),
  itemId: z.number().int().safe(),
  /** NCG, the price that was confirmed. */
  price: z.number().finite().nonnegative(),
  mode: z.enum(['dry-run', 'live']),
  status: z.enum(['prepared', 'dry-run', 'sent', 'confirmed', 'failed']),
  /** Epoch milliseconds. */
  at: z.number().int().safe(),
  transactionId: z.string().nullable(),
  note: z.string().nullable(),
});

export type PurchaseRecord = z.infer<typeof recordSchema>;

/** Old entries past this many are dropped, oldest first, never one that blocks a purchase. */
export const MAX_RECORDS = 200;

export interface PurchaseLogRead {
  readonly records: readonly PurchaseRecord[];
  /** The stored text could not be understood. Not the same as "no purchases". */
  readonly unreadable: boolean;
}

export function parsePurchaseLog(json: string | null): PurchaseLogRead {
  if (json === null) return { records: [], unreadable: false };
  try {
    const parsed = z.array(recordSchema).safeParse(JSON.parse(json));
    return parsed.success
      ? { records: parsed.data, unreadable: false }
      : { records: [], unreadable: true };
  } catch {
    return { records: [], unreadable: true };
  }
}

export const serialisePurchaseLog = (records: readonly PurchaseRecord[]): string =>
  JSON.stringify(records);

const blocksLive = (record: PurchaseRecord): boolean =>
  record.mode === 'live' && record.status !== 'failed';

/** The log with `record` added, and the oldest harmless entries dropped past `MAX_RECORDS`. */
export function appendRecord(
  records: readonly PurchaseRecord[],
  record: PurchaseRecord,
): readonly PurchaseRecord[] {
  const all = [...records, record];
  let extra = all.length - MAX_RECORDS;
  if (extra <= 0) return all;
  return all.filter((entry) => {
    if (extra > 0 && !blocksLive(entry) && entry !== record) {
      extra -= 1;
      return false;
    }
    return true;
  });
}

export function updateRecord(
  records: readonly PurchaseRecord[],
  id: string,
  patch: Partial<Pick<PurchaseRecord, 'status' | 'transactionId' | 'note'>>,
): readonly PurchaseRecord[] {
  return records.map((record) => (record.id === id ? { ...record, ...patch } : record));
}

/**
 * The live purchases whose end is not known: written, and either never signed or sent with no
 * verdict. They block their offer, deliberately, and are what a person has to look at.
 */
export const unsettledRecords = (records: readonly PurchaseRecord[]): readonly PurchaseRecord[] =>
  records.filter(
    (record) =>
      record.mode === 'live' && (record.status === 'prepared' || record.status === 'sent'),
  );

/**
 * Frees an unsettled purchase the person has checked by hand (inventory and balance). It becomes
 * `failed` with a note that says how, because "failed" is what frees the offer; any other record is
 * left exactly as it is, so this cannot rewrite a purchase that is known.
 */
export function clearUnsettled(
  records: readonly PurchaseRecord[],
  id: string,
): readonly PurchaseRecord[] {
  const target = records.find((record) => record.id === id);
  if (target === undefined || unsettledRecords([target]).length === 0) return records;
  return updateRecord(records, id, {
    status: 'failed',
    note: 'cleared by hand after checking the inventory and the balance',
  });
}

/** Where the log text lives. Over preferences on a device, over a variable in a test. */
export interface PurchaseLogStore {
  read(): PurchaseLogRead;
  write(records: readonly PurchaseRecord[]): void;
}

export const purchaseLogOver = (raw: {
  get(): string | null;
  set(json: string): void;
}): PurchaseLogStore => ({
  read: () => parsePurchaseLog(raw.get()),
  write: (records) => raw.set(serialisePurchaseLog(records)),
});
