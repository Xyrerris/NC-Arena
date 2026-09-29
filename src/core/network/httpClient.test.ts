import { DEFAULT_TIMEOUT_MS, HttpClient } from './httpClient';

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

describe('HttpClient — the deadline', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  /** A server that accepts the connection and never answers — but honours an abort, as real fetch does. */
  const silentServer = () => {
    const signals: AbortSignal[] = [];
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    return signals;
  };

  const TIMED_OUT = {
    ok: false,
    error: { code: 'OFFLINE', message: 'The server did not answer within 20 s.' },
  };

  it('gives up on a server that never answers, as OFFLINE, and aborts the request', async () => {
    const signals = silentServer();

    const pending = new HttpClient('https://api.example.com', 'key').request('/v1/roster');
    await jest.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);

    await expect(pending).resolves.toEqual(TIMED_OUT);
    expect(signals[0]?.aborted).toBe(true);
  });

  it('does not give up a moment early', async () => {
    silentServer();
    let settled = false;

    void new HttpClient('https://api.example.com', 'key').request('/v1/roster').then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);

    expect(settled).toBe(false);
  });

  it('holds the deadline even against a fetch that ignores its signal', async () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;

    const pending = new HttpClient('https://api.example.com', 'key').request('/v1/roster');
    await jest.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);

    await expect(pending).resolves.toEqual(TIMED_OUT);
  });

  it('covers a body that stalls after the headers arrived', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined),
    }) as unknown as typeof fetch;

    const pending = new HttpClient('https://api.example.com', 'key').request('/v1/roster');
    await jest.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);

    await expect(pending).resolves.toEqual(TIMED_OUT);
  });

  it('takes a shorter deadline when given one', async () => {
    silentServer();

    const pending = new HttpClient('https://api.example.com', 'key', {
      timeoutMs: 1_000,
    }).request('/v1/roster');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({
      ok: false,
      error: { code: 'OFFLINE', message: 'The server did not answer within 1 s.' },
    });
  });

  it('leaves no timer behind once a request has answered', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 })) as unknown as typeof fetch;

    await new HttpClient('https://api.example.com', 'key').request('/v1/roster');

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('HttpClient — reading the key per request', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const captureAuth = () => {
    const sent: (string | undefined)[] = [];
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      sent.push((init.headers as Record<string, string> | undefined)?.['Authorization']);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    return sent;
  };

  it('picks up a key stored after the client was built', async () => {
    const sent = captureAuth();
    // What a device looks like across pairing: no key on the first request, a key on the
    // next one, with nothing rebuilt in between (ADR-0035, decision 2).
    let stored: string | null = null;
    const client = new HttpClient('https://api.example.com', () => stored);

    await client.request('/v1/roster');
    stored = 'paired-key';
    await client.request('/v1/roster');

    expect(sent).toEqual([undefined, 'Bearer paired-key']);
  });

  it('still accepts a fixed string, which is what a test holds', async () => {
    const sent = captureAuth();

    await new HttpClient('https://api.example.com', 'fixed').request('/v1/roster');

    expect(sent).toEqual(['Bearer fixed']);
  });
});
