/**
 * Sheets read as raw state from a node (ADR-0047). The addresses are the ones a Heimdall node
 * answered for on 2026-10-27.
 */

import { bytesToHex, encodeBencodex } from '../common/bencodex';
import { decodeSheetState, readNodeSheets, sheetAddress, SHEET_ACCOUNT } from './nodeSheets';

const NODE = 'https://node.test/graphql';

describe('sheetAddress', () => {
  it('is the HMAC-SHA1 of the name keyed the way Libplanet derives it', () => {
    expect(sheetAddress('EquipmentItemSheet')).toBe('0x2b3107c88e0978799f15631f008bd1ae21340682');
    expect(sheetAddress('EnhancementCostSheetV3')).toBe(
      '0x1596bc274f212afdaf67597c7c8c653abd6ed70e',
    );
  });
});

describe('decodeSheetState', () => {
  it('returns the text of a Bencodex text value and nothing else', () => {
    expect(decodeSheetState(bytesToHex(encodeBencodex('id,exp\r\n1,2')))).toBe('id,exp\r\n1,2');
    expect(decodeSheetState(bytesToHex(encodeBencodex(5n)))).toBeNull();
    expect(decodeSheetState(bytesToHex(encodeBencodex('   ')))).toBeNull();
    expect(decodeSheetState('ff')).toBeNull();
    expect(decodeSheetState('not hex')).toBeNull();
  });
});

describe('readNodeSheets', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const answer = (body: unknown): jest.Mock => {
    const mock = jest.fn(() => Promise.resolve(new Response(JSON.stringify(body))));
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  };

  it('asks for every sheet in one request, in the legacy account, and keys them by name', async () => {
    const fetchMock = answer({
      data: {
        s0: bytesToHex(encodeBencodex('a')),
        s1: bytesToHex(encodeBencodex('b')),
      },
    });

    const result = await readNodeSheets({ heimdall: NODE }, 'heimdall', ['One', 'Two'], 'node');

    expect(result).toEqual({ ok: true, value: { One: 'a', Two: 'b' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain(sheetAddress('One'));
    expect(body).toContain(sheetAddress('Two'));
    expect(body).toContain(SHEET_ACCOUNT);
  });

  it('fails whole, naming the sheet, when one is missing or is not a sheet', async () => {
    answer({ data: { s0: bytesToHex(encodeBencodex('a')), s1: null } });
    const missing = await readNodeSheets({ heimdall: NODE }, 'heimdall', ['One', 'Two'], 'node');

    answer({ data: { s0: 'ff', s1: 'ff' }, errors: [{ message: 'boom' }] });
    const garbled = await readNodeSheets({ heimdall: NODE }, 'heimdall', ['One'], 'node');

    expect(missing).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(!missing.ok && missing.error.message).toContain('Two');
    expect(!garbled.ok && garbled.error.message).toContain('boom');
  });

  it('fails without a request when the planet has no node, and OFFLINE when it is unreachable', async () => {
    const fetchMock = answer({});
    const none = await readNodeSheets({ heimdall: NODE }, 'thor', ['One'], 'node');

    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError('Network request failed')),
    ) as unknown as typeof fetch;
    const down = await readNodeSheets({ heimdall: NODE }, 'heimdall', ['One'], 'node');

    expect(none).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(down).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });
  });
});
