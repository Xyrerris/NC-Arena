import { err, ok, type MarketListing } from '../common';
import {
  materialCandidates,
  readMaterialMarket,
  type MaterialCandidate,
  type MaterialOutcome,
} from './materialMarket';
import { parseBaseExp } from './upgradeExp';

const BASE = parseBaseExp(
  [
    'id,_name,item_sub_type,grade,exp',
    '10171000,Valkyrie Sword,Weapon,7,120000000',
    '10181000,Transcendent Sword,Weapon,8,1200000000',
    '10191000,Ultimate Sword,Weapon,9,9600000000',
    '10291000,Ultimate Armor,Armor,9,9600000000',
    '10691000,Ultimate Aura,Aura,9,6240000',
    '10151000,Mythic Sword,Weapon,6,100000000',
    '10192000,Broken,Weapon,9,0',
  ].join('\r\n'),
);

describe('materialCandidates', () => {
  it('lists equipment of grade 7 and up in a slot the market sells, highest grade first', () => {
    expect(materialCandidates(BASE).map((c) => [c.itemId, c.itemSubType, c.grade])).toEqual([
      [10191000, 6, 9],
      [10291000, 7, 9],
      [10181000, 6, 8],
      [10171000, 6, 7],
    ]);
  });

  it('leaves out Aura (no listings), lower grades and items that give nothing', () => {
    const ids = materialCandidates(BASE).map((c) => c.itemId);

    expect(ids).not.toContain(10691000);
    expect(ids).not.toContain(10151000);
    expect(ids).not.toContain(10192000);
  });

  it('can leave grade 7 out, and a new grade enters by itself', () => {
    const withTen = parseBaseExp(
      [
        'id,_name,item_sub_type,grade,exp',
        '1,Ten Ring,Ring,10,1000000000',
        '10171000,Valkyrie Sword,Weapon,7,120000000',
      ].join('\r\n'),
    );

    expect(materialCandidates(withTen, { minGrade: 8 }).map((c) => c.itemId)).toEqual([1]);
    expect(materialCandidates(withTen).map((c) => c.itemId)).toEqual([1, 10171000]);
  });
});

describe('readMaterialMarket', () => {
  const candidates: MaterialCandidate[] = [1, 2, 3, 4, 5].map((itemId) => ({
    itemId,
    itemSubType: 6,
    slot: 'Weapon',
    grade: 9,
  }));
  const listing = { productId: 'p' } as MarketListing;

  it('answers every candidate, at most three at a time', async () => {
    let running = 0;
    let peak = 0;
    const settled: number[] = [];

    await readMaterialMarket(
      candidates,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await Promise.resolve();
        await Promise.resolve();
        running -= 1;
        return ok([listing]);
      },
      {
        signal: new AbortController().signal,
        onSettled: (candidate, outcome) => {
          if (outcome.kind === 'ready') settled.push(candidate.itemId);
        },
      },
    );

    expect(settled.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(3);
  });

  it('reports a failed scan and goes on with the rest', async () => {
    const outcomes = new Map<number, MaterialOutcome['kind']>();

    await readMaterialMarket(
      candidates,
      async (candidate) =>
        candidate.itemId === 2 ? err({ reason: 'OFFLINE', message: 'down' }) : ok([listing]),
      {
        signal: new AbortController().signal,
        onSettled: (candidate, outcome) => outcomes.set(candidate.itemId, outcome.kind),
      },
    );

    expect(outcomes.get(2)).toBe('failed');
    expect([...outcomes.values()].filter((kind) => kind === 'ready')).toHaveLength(4);
  });

  it('ends quietly when stopped: no more scans, nothing reported for the stopped one', async () => {
    const controller = new AbortController();
    const asked: number[] = [];
    const settled: number[] = [];

    await readMaterialMarket(
      candidates,
      async (candidate) => {
        asked.push(candidate.itemId);
        if (candidate.itemId === 2) controller.abort();
        return ok([listing]);
      },
      {
        signal: controller.signal,
        concurrency: 1,
        onSettled: (candidate) => settled.push(candidate.itemId),
      },
    );

    expect(asked).toEqual([1, 2]);
    expect(settled).toEqual([1]);
  });

  it('treats a scan that says CANCELLED as the end, not a failure', async () => {
    const outcomes: string[] = [];

    await readMaterialMarket(
      candidates,
      async () => err({ reason: 'CANCELLED', message: 'stopped' }),
      {
        signal: new AbortController().signal,
        onSettled: (_, outcome) => outcomes.push(outcome.kind),
      },
    );

    expect(outcomes).toEqual([]);
  });

  it('does nothing for no candidates', async () => {
    const scan = jest.fn();

    await readMaterialMarket([], scan, {
      signal: new AbortController().signal,
      onSettled: jest.fn(),
    });

    expect(scan).not.toHaveBeenCalled();
  });
});
