/**
 * ADR-0035 decision 2's client half: a device with no key can get one, and the three ways
 * that can fail are told apart — because the setup screen offers a different remedy for each
 * and there is no fourth screen to fall back to.
 */

import { RemoteAccountGateway } from './remoteAccountGateway';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status });

const apiError = (code: string, message: string, status: number): Response =>
  jsonResponse({ error: { code, message } }, status);

describe('RemoteAccountGateway', () => {
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

  describe('createAccount', () => {
    it('returns both secrets, and sends no Authorization header', async () => {
      const fetchMock = mockFetch(
        jsonResponse(
          { accountId: ACCOUNT_ID, apiKey: 'key-one', recoveryCode: 'recover-one' },
          201,
        ),
      );

      const result = await new RemoteAccountGateway('https://api.example.com').createAccount();

      expect(result).toEqual({
        ok: true,
        value: { accountId: ACCOUNT_ID, apiKey: 'key-one', recoveryCode: 'recover-one' },
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.com/v1/accounts');
      expect(init.method).toBe('POST');
      // The endpoint is `security: []` in the contract, and this device has nothing to send
      // anyway — a key here would be one belonging to a different account.
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('sends a JSON object rather than an empty body', async () => {
      // Fastify refuses `Content-Type: application/json` with no body
      // (FST_ERR_CTP_EMPTY_JSON_BODY) before the route runs, so an omitted body would 400
      // the one call a device cannot retry its way around.
      const fetchMock = mockFetch(
        jsonResponse({ accountId: ACCOUNT_ID, apiKey: 'k', recoveryCode: 'r' }, 201),
      );

      await new RemoteAccountGateway('https://api.example.com').createAccount();

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBe('{}');
      expect(JSON.parse(String(init.body))).toEqual({});
    });

    it('reports OFFLINE when fetch never reached the server', async () => {
      mockFetch(new TypeError('Network request failed'));

      const result = await new RemoteAccountGateway('https://api.example.com').createAccount();

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('OFFLINE');
    });

    it('reports FAILED for a 404 — a wrong base URL is not a wrong recovery code', async () => {
      mockFetch(apiError('NOT_FOUND', 'no route', 404));

      const result = await new RemoteAccountGateway('https://api.example.com').createAccount();

      if (result.ok) throw new Error('expected a failure');
      // UNRECOGNISED would send the user off to check a code they never typed.
      expect(result.error.reason).toBe('FAILED');
    });

    it('reports FAILED when the response does not match the contract', async () => {
      // A key the server forgot to send would otherwise be stored as `undefined`, and every
      // later request would go out unauthenticated with nothing saying why.
      mockFetch(jsonResponse({ accountId: ACCOUNT_ID, recoveryCode: 'r' }, 201));

      const result = await new RemoteAccountGateway('https://api.example.com').createAccount();

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('FAILED');
    });

    it('rejects an empty api key, which would parse as a string but authenticate nothing', async () => {
      mockFetch(jsonResponse({ accountId: ACCOUNT_ID, apiKey: '', recoveryCode: 'r' }, 201));

      const result = await new RemoteAccountGateway('https://api.example.com').createAccount();

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('FAILED');
    });
  });

  describe('linkAccount', () => {
    it('sends the code and returns the fresh key', async () => {
      const fetchMock = mockFetch(jsonResponse({ accountId: ACCOUNT_ID, apiKey: 'key-two' }, 201));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('abc');

      expect(result).toEqual({ ok: true, value: { accountId: ACCOUNT_ID, apiKey: 'key-two' } });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.com/v1/accounts/link');
      expect(JSON.parse(String(init.body))).toEqual({ recoveryCode: 'abc' });
    });

    it('reports UNRECOGNISED for the contract NOT_FOUND — the one failure a user can fix', async () => {
      mockFetch(apiError('NOT_FOUND', 'Recovery code not recognised.', 404));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('nope');

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('UNRECOGNISED');
    });

    it('refuses an empty code without a round trip', async () => {
      const fetchMock = mockFetch(jsonResponse({}, 201));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('');

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('UNRECOGNISED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports OFFLINE rather than UNRECOGNISED when the request never landed', async () => {
      // The difference matters: one says "you typed it wrong", the other says "try again".
      mockFetch(new TypeError('Network request failed'));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('abc');

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('OFFLINE');
    });

    it('reports FAILED for a server error', async () => {
      mockFetch(apiError('INTERNAL', 'boom', 500));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('abc');

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('FAILED');
    });

    it('reports FAILED when the response does not match the contract', async () => {
      mockFetch(jsonResponse({ accountId: 'not-a-uuid', apiKey: 'k' }, 201));

      const result = await new RemoteAccountGateway('https://api.example.com').linkAccount('abc');

      if (result.ok) throw new Error('expected a failure');
      expect(result.error.reason).toBe('FAILED');
    });
  });
});
