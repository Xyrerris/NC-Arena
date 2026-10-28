/**
 * Game sheets read from a Nine Chronicles node, which is the chain's own copy (ADR-0047).
 *
 * Measured on 2026-10-27 on Heimdall: lib9c's `development` branch has neither the Ultimate (grade 9)
 * equipment nor the experience values the chain now uses (grade 8 base exp 1.2 G on chain, 0.8 G in
 * lib9c), and Mimir's copy stopped at grade 7. The node had all of it. The node's `cachedSheet`
 * answers null, so the sheet is read as raw state, like the collection state is:
 *
 * - the address is `TableSheet.Derive(name)`, an HMAC-SHA1 of the name's UTF-8 bytes — **the key is
 *   the name and the message is the address**, which is the other way round from what the C# reads
 *   like and was found by trying both against a node;
 * - it lives in the legacy account, `0x1000…0000`;
 * - the answer is Bencodex as hex, and a sheet is one Bencodex text value: the CSV.
 *
 * All the names asked for or none: an enhancement sheet beside the equipment sheet of another day is
 * how a level comes to carry the wrong exp.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { z } from 'zod';

import { bytesToHex, decodeBencodex, hexToBytes } from '../common/bencodex';
import { err, ok, type Result, type SheetError } from '../common';
import type { Planet } from '../model';
import { networkFailure, postGraphql, type GraphqlEndpoints } from './chainGraphql';

/** lib9c's `Addresses.TableSheet`. */
const TABLE_SHEET = hexToBytes('0000000000000000000000000000000000000003');

/** The account the sheets are in (`ReservedAddresses.LegacyAccount`). */
export const SHEET_ACCOUNT = '0x1000000000000000000000000000000000000000';

const encoder = new TextEncoder();

/** The state address of the sheet called `name`, as `0x` and 40 hex digits. */
export const sheetAddress = (name: string): string =>
  `0x${bytesToHex(hmac(sha1, encoder.encode(name), TABLE_SHEET))}`;

const answerSchema = z.record(z.string(), z.string().nullish());

/** The CSV a sheet's state decodes to, or null when it is not one non-empty Bencodex text value. */
export function decodeSheetState(hex: string): string | null {
  try {
    const value = decodeBencodex(hexToBytes(hex));
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The CSV of each sheet in `names`, keyed by name, from `planet`'s nodes in order (the first that
 * answers wins), or an error when any of them could not be read.
 */
export async function readNodeSheets(
  endpoints: GraphqlEndpoints,
  planet: Planet,
  names: readonly string[],
  source: string,
): Promise<Result<Readonly<Record<string, string>>, SheetError>> {
  const endpoint = endpoints[planet];
  if (endpoint === undefined) {
    return err({ reason: 'FAILED', message: `${source}: it has no node for ${planet}.` });
  }

  const fields = names.map(
    (name, index) =>
      `s${index}: state(address: "${sheetAddress(name)}", accountAddress: "${SHEET_ACCOUNT}")`,
  );
  const response = await postGraphql(endpoint, `{ ${fields.join(' ')} }`);
  if (!response.ok) return err(networkFailure(source, response.error));

  const parsed = answerSchema.safeParse(response.value.data ?? {});
  const answers = parsed.success ? parsed.data : {};
  const sheets: Record<string, string> = {};
  for (const [index, name] of names.entries()) {
    const hex = answers[`s${index}`];
    const csv = hex == null ? null : decodeSheetState(hex);
    if (csv === null) {
      const reason = response.value.errors[0]?.message;
      return err({
        reason: 'FAILED',
        message: `${source}: ${name} did not come back${reason === undefined ? '' : ` (${reason})`}.`,
      });
    }
    sheets[name] = csv;
  }
  return ok(sheets);
}
