/**
 * ADR-0044, decision 4: a collection read is complete or it is nothing. These tests pin the
 * three ways a source can answer — ids, "no state", failure — and that the three are never
 * confused, because the screen shows an owned collection as missing if a short list gets through.
 */

import { err, ok, type CollectionSource } from '../common';
import type { ViewerAvatar } from '../model';
import { FallbackCollectionSource } from './fallbackCollectionSource';
import { MimirCollectionSource } from './mimirCollectionSource';
import { NodeCollectionSource } from './nodeCollectionSource';

const AVATAR: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const hexOf = (text: string): string => Buffer.from(text, 'latin1').toString('hex');

describe('collection sources', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockFetch = (response: Response | Error): jest.Mock => {
    const fetchMock = jest.fn();
    if (response instanceof Error) fetchMock.mockRejectedValue(response);
    else fetchMock.mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  describe('MimirCollectionSource', () => {
    it('returns the ids and how far the index had got', async () => {
      const fetchMock = mockFetch(
        jsonResponse({
          data: { collection: { ids: [3, 1, 2] }, metadata: { latestBlockIndex: 11339117 } },
        }),
      );

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toEqual({
        ok: true,
        value: { ids: new Set([1, 2, 3]), source: 'mimir', blockIndex: 11339117 },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://mimir.nine-chronicles.dev/heimdall/graphql/');
      expect(init.method).toBe('POST');
      expect(String(init.body)).toContain(AVATAR.address);
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('keeps the ids when only the metadata is missing', async () => {
      mockFetch(
        jsonResponse({
          data: { collection: { ids: [1] }, metadata: null },
          errors: [{ message: 'boom', path: ['metadata'] }],
        }),
      );

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toEqual({
        ok: true,
        value: { ids: new Set([1]), source: 'mimir', blockIndex: null },
      });
    });

    it('reads "Document not found" on the collection as no state, not as a failure', async () => {
      mockFetch(
        jsonResponse({
          data: { collection: null },
          errors: [
            { message: "Document not found in 'collection' collection", path: ['collection'] },
          ],
        }),
      );

      expect(await new MimirCollectionSource().readUnlocked(AVATAR)).toEqual({
        ok: true,
        value: null,
      });
    });

    it('does not read another resolver failing as no state', async () => {
      mockFetch(
        jsonResponse({
          data: { collection: null },
          errors: [{ message: 'Document not found in somewhere else', path: ['metadata'] }],
        }),
      );

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });

    it('fails on ids that are not safe integers, rather than dropping them', async () => {
      mockFetch(jsonResponse({ data: { collection: { ids: [1, 'two', 3] } } }));

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });

    it('fails on an answer with neither ids nor an error', async () => {
      mockFetch(jsonResponse({ data: {} }));

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });

    it('reports a dropped connection as OFFLINE', async () => {
      mockFetch(new TypeError('Network request failed'));

      const result = await new MimirCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'OFFLINE' } });
    });

    it('does not guess an endpoint for a planet it does not serve', async () => {
      const fetchMock = mockFetch(jsonResponse({}));

      const result = await new MimirCollectionSource().readUnlocked({ ...AVATAR, planet: 'thor' });

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never puts an unchecked address into the query text', async () => {
      const fetchMock = mockFetch(jsonResponse({}));

      const result = await new MimirCollectionSource().readUnlocked({
        ...AVATAR,
        address: '0x1") { x } #',
      });

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('NodeCollectionSource', () => {
    it('decodes the raw state into ids', async () => {
      const fetchMock = mockFetch(jsonResponse({ data: { state: hexOf('lli1ei2ei3eee') } }));

      const result = await new NodeCollectionSource().readUnlocked(AVATAR);

      expect(result).toEqual({
        ok: true,
        value: { ids: new Set([1, 2, 3]), source: 'node', blockIndex: null },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://heimdall-rpc-1.nine-chronicles.com/graphql');
      expect(String(init.body)).toContain('0x000000000000000000000000000000000000001f');
    });

    it('reads a null state as no state', async () => {
      mockFetch(jsonResponse({ data: { state: null } }));

      expect(await new NodeCollectionSource().readUnlocked(AVATAR)).toEqual({
        ok: true,
        value: null,
      });
    });

    it('fails on a state the decoder refuses, rather than returning what parsed', async () => {
      // A byte string where an id belongs — a shape change on the chain.
      mockFetch(jsonResponse({ data: { state: hexOf('lli1e1:aee') } }));

      const result = await new NodeCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });

    it('fails when the node reports an error', async () => {
      mockFetch(jsonResponse({ errors: [{ message: 'Address hex must be 42 chars' }] }));

      const result = await new NodeCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });

    it('reports a gateway error page as FAILED, not as no state', async () => {
      mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

      const result = await new NodeCollectionSource().readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
    });
  });

  describe('FallbackCollectionSource', () => {
    const answering = (name: string, read: ReturnType<CollectionSource['readUnlocked']>) => {
      const readUnlocked = jest.fn().mockReturnValue(read);
      return { name, readUnlocked } as CollectionSource & { readUnlocked: jest.Mock };
    };
    const ids = (source: string) =>
      Promise.resolve(ok({ ids: new Set([7]), source, blockIndex: null }));
    const none = () => Promise.resolve(ok(null));
    const failed = (message: string) =>
      Promise.resolve(err({ reason: 'FAILED' as const, message }));

    it('takes the first source that has ids and does not ask the rest', async () => {
      const first = answering('a', ids('a'));
      const second = answering('b', ids('b'));

      const result = await new FallbackCollectionSource([first, second]).readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: true, value: { source: 'a' } });
      expect(second.readUnlocked).not.toHaveBeenCalled();
    });

    it('falls through a failure to the next source', async () => {
      const result = await new FallbackCollectionSource([
        answering('a', failed('down')),
        answering('b', ids('b')),
      ]).readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: true, value: { source: 'b' } });
    });

    it('falls through "no state" too, since the first source may only be behind', async () => {
      const result = await new FallbackCollectionSource([
        answering('a', none()),
        answering('b', ids('b')),
      ]).readUnlocked(AVATAR);

      expect(result).toMatchObject({ ok: true, value: { source: 'b' } });
    });

    it('answers no state only when every source did', async () => {
      const result = await new FallbackCollectionSource([
        answering('a', none()),
        answering('b', none()),
      ]).readUnlocked(AVATAR);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('answers the failure when one source said no state and another could not answer', async () => {
      const result = await new FallbackCollectionSource([
        answering('a', none()),
        answering('b', failed('node down')),
      ]).readUnlocked(AVATAR);

      expect(result).toEqual({ ok: false, error: { reason: 'FAILED', message: 'node down' } });
    });

    it('names the chain it reads', () => {
      const source = new FallbackCollectionSource([
        new MimirCollectionSource(),
        new NodeCollectionSource(),
      ]);

      expect(source.name).toBe('mimir → node');
    });
  });
});
