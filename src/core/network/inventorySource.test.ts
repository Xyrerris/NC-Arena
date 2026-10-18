/**
 * `NodeInventorySource`: a bag is complete or it is a failure, never a smaller bag. "No avatar at
 * this address" is a third answer and is not an empty bag either.
 */

import type { ViewerAvatar } from '../model';
import { NodeInventorySource } from './nodeInventorySource';

const AVATAR: ViewerAvatar = {
  planet: 'heimdall',
  address: '0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const inventoryBody = (inventory: unknown) => ({
  data: { stateQuery: { avatar: { inventory } } },
});

describe('NodeInventorySource', () => {
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

  const source = () => new NodeInventorySource(undefined, () => 1234);

  it('reads equipment with its skill state, and stacks without double counting equipment', async () => {
    const fetchMock = mockFetch(
      jsonResponse(
        inventoryBody({
          equipments: [
            { id: 10690003, level: 6, skills: [{ id: 110008 }], buffSkills: [] },
            { id: 10690000, level: 0, skills: [], buffSkills: [{ id: 1 }] },
            { id: 10180000, level: 23, skills: [], buffSkills: [] },
          ],
          items: [
            { id: 10690003, count: 1, itemType: 'EQUIPMENT' },
            { id: 383002, count: 4460, itemType: 'MATERIAL' },
            { id: 40100069, count: 1, itemType: 'COSTUME' },
            { id: 383002, count: 40, itemType: 'MATERIAL' },
          ],
        }),
      ),
    );

    const result = await source().readInventory(AVATAR);

    expect(result).toEqual({
      ok: true,
      value: {
        equipment: [
          { itemId: 10690003, level: 6, hasSkill: true },
          { itemId: 10690000, level: 0, hasSkill: true },
          { itemId: 10180000, level: 23, hasSkill: false },
        ],
        stackable: new Map([
          [383002, 4500],
          [40100069, 1],
        ]),
        source: 'node',
        readAt: 1234,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://heimdall-rpc-1.nine-chronicles.com/graphql');
    expect(String(init.body)).toContain(AVATAR.address);
  });

  it('answers ok(null) for an address that is no avatar', async () => {
    mockFetch(jsonResponse({ data: { stateQuery: { avatar: null } } }));
    expect(await source().readInventory(AVATAR)).toEqual({ ok: true, value: null });
  });

  it('fails, rather than return a smaller bag, when the shape is wrong', async () => {
    mockFetch(jsonResponse(inventoryBody({ equipments: [{ id: 'x' }], items: [] })));
    const result = await source().readInventory(AVATAR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('FAILED');
  });

  it('reports a node error message when there is no data', async () => {
    mockFetch(jsonResponse({ data: null, errors: [{ message: 'state is gone' }] }));
    const result = await source().readInventory(AVATAR);
    expect(result).toEqual({
      ok: false,
      error: { reason: 'FAILED', message: 'node: state is gone' },
    });
  });

  it('is OFFLINE when the node cannot be reached', async () => {
    mockFetch(new TypeError('Network request failed'));
    const result = await source().readInventory(AVATAR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('OFFLINE');
  });

  it('refuses a malformed address without asking the node', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const result = await source().readInventory({ ...AVATAR, address: '0x12"; drop' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
