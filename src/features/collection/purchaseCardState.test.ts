/**
 * The purchase card's sentences: what it says for an offer that is gone, an offer it could not
 * check, and an offer it can show, with a balance that is enough, short, or not known at all.
 */

import type { MarketListing } from '@/core/common';

import type { MarketPiece } from './marketUiState';
import { toPurchaseCardUi, type BalanceState } from './purchaseCardState';

const listing = (overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId: '00000000-0000-0000-0000-000000000001',
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 142.5,
  quantity: 1,
  unitPrice: 142.5,
  hasSkill: true,
  sellerAvatarAddress: 'ebb88102b3C561168aF72f71fdB9eA1469FDAA63',
  registeredBlockIndex: 1,
  ...overrides,
});

const piece = (label: string, count = 1): MarketPiece => ({
  key: 'k',
  requirement: { itemId: 10110000, count, level: 0, skillContains: true },
  route: { kind: 'route', itemSubType: 6 },
  label,
  needsSkill: true,
  count,
});

const ready = (balance: BalanceState, l: MarketListing = listing(), p = piece('Long Sword +0')) =>
  toPurchaseCardUi({ kind: 'ready', listing: l, balance }, p);

describe('toPurchaseCardUi', () => {
  it('says it is checking, with no offer and no balance to show yet', () => {
    expect(toPurchaseCardUi({ kind: 'checking' }, piece('x'))).toMatchObject({
      status: 'checking',
      message: 'Checking that the offer is still on sale…',
      offer: null,
      balanceLine: null,
    });
  });

  it('tells an offer that is gone from one that could not be checked', () => {
    const gone = toPurchaseCardUi({ kind: 'gone' }, piece('x'));
    const offline = toPurchaseCardUi({ kind: 'failed', reason: 'OFFLINE' }, piece('x'));
    const failed = toPurchaseCardUi({ kind: 'failed', reason: 'FAILED' }, piece('x'));

    expect(gone.message).toContain('no longer on sale');
    expect(offline.message).toContain('Check the connection');
    expect(failed.message).toContain('could not be read');
    expect([gone.status, offline.status, failed.status]).toEqual(['gone', 'failed', 'failed']);
  });

  it('shows the offer with the balance and what the buy would leave', () => {
    const ui = ready({ kind: 'known', ncg: 500 });

    expect(ui.offer).toEqual({
      sentence: 'This would buy Long Sword +0 for 142,5 NCG.',
      price: '142,5 NCG',
      detail: null,
      countNote: null,
    });
    expect(ui.balanceLine).toBe('You hold 500 NCG');
    expect(ui.afterLine).toBe('Would leave 357,5 NCG');
    expect(ui.enough).toBe('yes');
  });

  it('says how much is missing when the balance is below the price, and exactly enough is enough', () => {
    expect(ready({ kind: 'known', ncg: 100 })).toMatchObject({
      afterLine: '42,5 NCG short of the price',
      enough: 'short',
    });
    expect(ready({ kind: 'known', ncg: 142.5 })).toMatchObject({
      afterLine: 'Would leave 0 NCG',
      enough: 'yes',
    });
  });

  it('never calls an unknown balance zero, and says why it is unknown', () => {
    const none = ready({ kind: 'unknown', why: 'no-avatar' });
    const offline = ready({ kind: 'unknown', why: 'offline' });
    const failed = ready({ kind: 'unknown', why: 'failed' });

    expect(none.balanceLine).toContain('no avatar');
    expect(offline.balanceLine).toContain('could not be reached');
    expect(failed.balanceLine).toBe('Your balance could not be read.');
    for (const ui of [none, offline, failed]) {
      expect(ui.afterLine).toBeNull();
      expect(ui.enough).toBe('unknown');
    }
  });

  it('says a lot by its units, its unit price and what the collection asks for', () => {
    const lot = listing({ price: 20, quantity: 4, unitPrice: 5, combatPoint: 0 });

    const ui = ready({ kind: 'known', ncg: 100 }, lot, piece('Mithril Dust', 5));

    expect(ui.offer).toEqual({
      sentence: 'This would buy 4 × Mithril Dust for 20 NCG.',
      price: '5 NCG each',
      detail: '4 for 20 NCG',
      countNote: 'The lot holds 4; the collection asks for 5.',
    });
    expect(ready({ kind: 'known', ncg: 100 }, lot, piece('Mithril Dust', 4)).offer?.countNote).toBe(
      'The lot holds exactly the 4 the collection asks for.',
    );
  });
});
