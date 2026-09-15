import { offlineError, parseApiError } from './errors';

describe('parseApiError', () => {
  it('reads a well-formed error envelope', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no such id' } }),
      {
        status: 404,
      },
    );
    expect(await parseApiError(response)).toEqual({ code: 'NOT_FOUND', message: 'no such id' });
  });

  it('reports MALFORMED_RESPONSE for a body that is not JSON', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    const error = await parseApiError(response);
    expect(error.code).toBe('MALFORMED_RESPONSE');
  });

  it('reports MALFORMED_RESPONSE for JSON that does not match the taxonomy', async () => {
    const response = new Response(JSON.stringify({ oops: true }), { status: 500 });
    const error = await parseApiError(response);
    expect(error.code).toBe('MALFORMED_RESPONSE');
  });
});

describe('offlineError', () => {
  it("carries the cause's message", () => {
    expect(offlineError(new Error('network request failed'))).toEqual({
      code: 'OFFLINE',
      message: 'network request failed',
    });
  });

  it('falls back to a generic message for a non-Error cause', () => {
    expect(offlineError('boom')).toEqual({
      code: 'OFFLINE',
      message: 'The network request failed.',
    });
  });
});
