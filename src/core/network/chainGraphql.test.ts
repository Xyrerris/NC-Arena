/**
 * `postGraphql` over a list of nodes: a transport failure moves on to the next one, a GraphQL
 * `errors` answer does not, and when every node fails the last failure is the one reported.
 */

import { postGraphql } from './chainGraphql';

const A = 'https://a.example/graphql';
const B = 'https://b.example/graphql';
const C = 'https://c.example/graphql';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe('postGraphql', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** Answers per URL, in the order the URLs are asked. */
  const mockNodes = (answers: Record<string, Response | Error>): jest.Mock => {
    const fetchMock = jest.fn(async (url: string) => {
      const answer = answers[url];
      if (answer === undefined) throw new Error(`unexpected ${url}`);
      if (answer instanceof Error) throw answer;
      return answer;
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  const asked = (fetchMock: jest.Mock): string[] =>
    fetchMock.mock.calls.map((call) => call[0] as string);

  it('uses a single endpoint as before', async () => {
    const fetchMock = mockNodes({ [A]: json({ data: { x: 1 } }) });

    const result = await postGraphql(A, '{ x }');

    expect(result).toEqual({ ok: true, value: { data: { x: 1 }, errors: [] } });
    expect(asked(fetchMock)).toEqual([A]);
  });

  it('falls over past a node that answers 502, then stops at the first that answers', async () => {
    const fetchMock = mockNodes({
      [A]: new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      [B]: json({ data: { x: 2 } }),
      [C]: json({ data: { x: 3 } }),
    });

    const result = await postGraphql([A, B, C], '{ x }');

    expect(result).toEqual({ ok: true, value: { data: { x: 2 }, errors: [] } });
    expect(asked(fetchMock)).toEqual([A, B]);
  });

  it('falls over past an unreachable node', async () => {
    mockNodes({ [A]: new TypeError('Network request failed'), [B]: json({ data: { x: 2 } }) });

    const result = await postGraphql([A, B], '{ x }');

    expect(result.ok).toBe(true);
  });

  it('does not ask another node when the query itself was answered with errors', async () => {
    const fetchMock = mockNodes({
      [A]: json({ data: null, errors: [{ message: 'bad address' }] }),
      [B]: json({ data: { x: 2 } }),
    });

    const result = await postGraphql([A, B], '{ x }');

    expect(result).toEqual({
      ok: true,
      value: { data: null, errors: [{ message: 'bad address' }] },
    });
    expect(asked(fetchMock)).toEqual([A]);
  });

  it('reports the last failure when every node fails', async () => {
    mockNodes({ [A]: new TypeError('Network request failed'), [B]: json({ nope: true }, 502) });

    const result = await postGraphql([A, B], '{ x }');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe('OFFLINE');
  });

  it('is a failure, not a crash, for an empty list', async () => {
    const result = await postGraphql([], '{ x }');

    expect(result.ok).toBe(false);
  });
});
