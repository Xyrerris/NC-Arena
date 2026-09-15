import { HttpClient } from './httpClient';

describe('HttpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends the bearer token and parses a JSON success body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', 'secret-key');
    const result = await client.request<{ ok: boolean }>('/v1/roster');

    expect(result).toEqual({ ok: true, value: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/roster');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
  });

  it('omits the Authorization header with no api key', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await new HttpClient('https://api.example.com', null).request('/v1/accounts', {
      method: 'POST',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('maps a non-OK response to the parsed API error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'bad key' } }), {
        status: 401,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new HttpClient('https://api.example.com', 'bad').request('/v1/roster');

    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: 'bad key' } });
  });

  it('reports MALFORMED_RESPONSE for a 2xx response with an invalid JSON body', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200 })) as unknown as typeof fetch;

    const result = await new HttpClient('https://api.example.com', null).request('/v1/roster');

    expect(result).toEqual({
      ok: false,
      error: { code: 'MALFORMED_RESPONSE', message: 'HTTP 200: invalid JSON body' },
    });
  });

  it('maps a rejected fetch to OFFLINE', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network request failed')) as unknown as typeof fetch;

    const result = await new HttpClient('https://api.example.com', null).request('/v1/roster');

    expect(result).toEqual({
      ok: false,
      error: { code: 'OFFLINE', message: 'network request failed' },
    });
  });
});
