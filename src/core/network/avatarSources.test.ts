/**
 * ADR-0044, "Not built yet" 2: the name behind a typed-in address. The distinction these tests
 * hold is the one the confirmation depends on — "there is no avatar there" is an answer, "the
 * lookup did not happen" is not, and telling a user their correct address is wrong because a
 * node hiccupped would be worse than not checking.
 */

import { err, ok, type AvatarSource } from '../common';
import type { ViewerAvatar } from '../model';
import { FallbackAvatarSource } from './fallbackAvatarSource';
import { MimirAvatarSource } from './mimirAvatarSource';
import { NodeAvatarSource } from './nodeAvatarSource';

const AVATAR: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
};

const IDENTITY = {
  name: 'Xyrerris',
  level: 494,
  agentAddress: '0xD7E47C36F676922985eD5ca079579234D0027875',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe('avatar sources', () => {
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

  describe('MimirAvatarSource', () => {
    it('returns who is at the address, asking the planet it was given', async () => {
      const fetchMock = mockFetch(jsonResponse({ data: { avatar: IDENTITY } }));

      const result = await new MimirAvatarSource().readAvatar({ ...AVATAR, planet: 'odin' });

      expect(result).toEqual({ ok: true, value: IDENTITY });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://mimir.nine-chronicles.dev/odin/graphql/');
      expect(String(init.body)).toContain(AVATAR.address);
    });

    it('reads "Document not found" on the avatar as nobody there', async () => {
      mockFetch(
        jsonResponse({
          data: { avatar: null },
          errors: [{ message: "Document not found in 'avatar' collection", path: ['avatar'] }],
        }),
      );

      expect(await new MimirAvatarSource().readAvatar(AVATAR)).toEqual({ ok: true, value: null });
    });

    it('does not read an unrelated error as nobody there', async () => {
      mockFetch(jsonResponse({ data: { avatar: null }, errors: [{ message: 'boom', path: [] }] }));

      expect(await new MimirAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'FAILED' },
      });
    });

    it('fails on an avatar without a level, rather than showing half of one', async () => {
      mockFetch(jsonResponse({ data: { avatar: { name: 'X', agentAddress: '0x1' } } }));

      expect(await new MimirAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'FAILED' },
      });
    });

    it('reports a dropped connection as OFFLINE', async () => {
      mockFetch(new TypeError('Network request failed'));

      expect(await new MimirAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'OFFLINE' },
      });
    });

    it('does not guess an endpoint for a planet it does not serve', async () => {
      const fetchMock = mockFetch(jsonResponse({}));

      const result = await new MimirAvatarSource().readAvatar({ ...AVATAR, planet: 'thor' });

      expect(result).toMatchObject({ ok: false, error: { reason: 'FAILED' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('NodeAvatarSource', () => {
    it('returns who is at the address', async () => {
      const fetchMock = mockFetch(jsonResponse({ data: { stateQuery: { avatar: IDENTITY } } }));

      const result = await new NodeAvatarSource().readAvatar(AVATAR);

      expect(result).toEqual({ ok: true, value: IDENTITY });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://heimdall-rpc-1.nine-chronicles.com/graphql');
      expect(String(init.body)).toContain(AVATAR.address);
    });

    it('reads a null avatar with errors only under it as nobody there', async () => {
      // What the node really sends: one NULL_REFERENCE per field that was asked for.
      mockFetch(
        jsonResponse({
          data: { stateQuery: { avatar: null } },
          errors: ['name', 'level', 'agentAddress'].map((field) => ({
            message: `Error trying to resolve field '${field}'.`,
            path: ['stateQuery', 'avatar', field],
          })),
        }),
      );

      expect(await new NodeAvatarSource().readAvatar(AVATAR)).toEqual({ ok: true, value: null });
    });

    it('does not read an error elsewhere as nobody there', async () => {
      mockFetch(
        jsonResponse({
          data: { stateQuery: { avatar: null } },
          errors: [{ message: 'state store unavailable', path: ['stateQuery'] }],
        }),
      );

      expect(await new NodeAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'FAILED' },
      });
    });

    it('fails when the whole stateQuery is missing', async () => {
      mockFetch(jsonResponse({ data: null, errors: [{ message: 'unavailable' }] }));

      expect(await new NodeAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'FAILED', message: expect.stringContaining('unavailable') as string },
      });
    });

    it('reports a gateway error page as FAILED, not as nobody there', async () => {
      mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

      expect(await new NodeAvatarSource().readAvatar(AVATAR)).toMatchObject({
        ok: false,
        error: { reason: 'FAILED' },
      });
    });
  });

  describe('FallbackAvatarSource', () => {
    const answering = (name: string, read: ReturnType<AvatarSource['readAvatar']>) =>
      ({ name, readAvatar: jest.fn().mockReturnValue(read) }) as AvatarSource & {
        readAvatar: jest.Mock;
      };

    it('takes the first avatar found and does not ask the rest', async () => {
      const second = answering('b', Promise.resolve(ok(IDENTITY)));

      const result = await new FallbackAvatarSource([
        answering('a', Promise.resolve(ok(IDENTITY))),
        second,
      ]).readAvatar(AVATAR);

      expect(result).toEqual({ ok: true, value: IDENTITY });
      expect(second.readAvatar).not.toHaveBeenCalled();
    });

    it('asks the node when Mimir has not indexed the avatar yet', async () => {
      const result = await new FallbackAvatarSource([
        answering('a', Promise.resolve(ok(null))),
        answering('b', Promise.resolve(ok(IDENTITY))),
      ]).readAvatar(AVATAR);

      expect(result).toEqual({ ok: true, value: IDENTITY });
    });

    it('says nobody is there only when every source did', async () => {
      const result = await new FallbackAvatarSource([
        answering('a', Promise.resolve(ok(null))),
        answering('b', Promise.resolve(ok(null))),
      ]).readAvatar(AVATAR);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('answers the failure when one said nobody and the other could not answer', async () => {
      const result = await new FallbackAvatarSource([
        answering('a', Promise.resolve(ok(null))),
        answering('b', Promise.resolve(err({ reason: 'OFFLINE' as const, message: 'down' }))),
      ]).readAvatar(AVATAR);

      expect(result).toEqual({ ok: false, error: { reason: 'OFFLINE', message: 'down' } });
    });
  });
});
