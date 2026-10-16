/**
 * The rules a purchase must pass (ADR-0044, step D): each one refuses for its own reason, in the
 * order a person would want to be told, and the default mode cannot send.
 */

import type { MarketListing } from './marketSource';
import type { PurchaseRecord } from './purchaseLog';
import {
  DEFAULT_PURCHASE_MODE,
  LIVE_SENDING_BUILT,
  blocksPurchase,
  checkPurchase,
  resolveMode,
  toPurchaseOffer,
  type PolicyInput,
} from './purchasePolicy';

const KEY = '008aeeda4d805471df9b2a5b0f38a0c3bcba786b';

const listing = (overrides: Partial<MarketListing> = {}): MarketListing => ({
  productId: '00112233-4455-6677-8899-aabbccddeeff',
  itemId: 10110000,
  itemSubType: 6,
  level: 0,
  grade: 1,
  elementalType: 0,
  combatPoint: 1000,
  price: 701,
  quantity: 1,
  unitPrice: 701,
  hasSkill: true,
  sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
  sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
  tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
  legacy: false,
  registeredBlockIndex: 1,
  ...overrides,
});

const record = (overrides: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: 'r1',
  productId: '00112233-4455-6677-8899-aabbccddeeff',
  planet: 'heimdall',
  itemId: 10110000,
  price: 701,
  mode: 'live',
  status: 'sent',
  at: 1,
  transactionId: null,
  note: null,
  ...overrides,
});

const input = (overrides: Partial<PolicyInput> = {}): PolicyInput => ({
  planet: 'heimdall',
  shown: listing(),
  fresh: listing(),
  limitNcg: 1000,
  balanceNcg: 5000,
  keyAddress: KEY,
  avatarAgent: `0x${KEY.toUpperCase()}`,
  buyerAvatar: '1023d8f22c6f5a8701e56a95e18fb2dbe436b41f',
  log: [],
  ...overrides,
});

describe('checkPurchase', () => {
  it('lets through an offer that is still there, at the price shown, on the right account, within the limit and the money', () => {
    expect(checkPurchase(input())).toBeNull();
  });

  it('accepts a price exactly at the limit and a balance exactly at the price', () => {
    expect(checkPurchase(input({ limitNcg: 701, balanceNcg: 701 }))).toBeNull();
  });

  it.each([
    ['the offer is gone', { fresh: null }, 'GONE'],
    ['the price moved', { fresh: listing({ price: 700, unitPrice: 700 }) }, 'PRICE_MOVED'],
    ['the lot changed size', { fresh: listing({ quantity: 2 }) }, 'PRICE_MOVED'],
    [
      'it is a costume',
      { shown: listing({ itemSubType: 1 }), fresh: listing({ itemSubType: 1 }) },
      'NOT_EQUIPMENT',
    ],
    [
      'it is a lot',
      { shown: listing({ quantity: 3 }), fresh: listing({ quantity: 3 }) },
      'NOT_EQUIPMENT',
    ],
    ['the offer was already bought', { log: [record()] }, 'ALREADY'],
    [
      'a purchase of it is in flight after a crash',
      { log: [record({ status: 'prepared' })] },
      'ALREADY',
    ],
    ['the seller is the account', { fresh: listing({ sellerAgentAddress: KEY }) }, 'SELF'],
    [
      'the seller is the receiving avatar',
      { fresh: listing({ sellerAvatarAddress: '1023D8F22C6F5A8701E56A95E18FB2DBE436B41F' }) },
      'SELF',
    ],
    ['the avatar’s account is not known', { avatarAgent: null }, 'WRONG_ACCOUNT'],
    ['the keystore is another account', { avatarAgent: '0x' + '1'.repeat(40) }, 'WRONG_ACCOUNT'],
    ['no limit is set', { limitNcg: null }, 'NO_LIMIT'],
    ['it costs more than the limit', { limitNcg: 700 }, 'OVER_LIMIT'],
    ['the balance is unknown', { balanceNcg: null }, 'NO_BALANCE'],
    ['the balance is below the price', { balanceNcg: 700.99 }, 'SHORT'],
  ])('refuses when %s', (_what, change, code) => {
    const refusal = checkPurchase(input(change as Partial<PolicyInput>));

    expect(refusal?.code).toBe(code);
    expect(refusal?.message).not.toBe('');
  });

  it('does not count a dry run, a failure or another planet’s record against the offer', () => {
    const harmless = [
      record({ mode: 'dry-run', status: 'dry-run' }),
      record({ id: 'r2', status: 'failed' }),
      record({ id: 'r3', planet: 'odin' }),
      record({ id: 'r4', productId: '11111111-4455-6677-8899-aabbccddeeff' }),
    ];

    expect(checkPurchase(input({ log: harmless }))).toBeNull();
  });

  it('tells the person the first thing wrong, in the order they would want it', () => {
    // Gone beats everything; then the limit before the money.
    expect(checkPurchase(input({ fresh: null, limitNcg: null }))?.code).toBe('GONE');
    expect(checkPurchase(input({ limitNcg: null, balanceNcg: null }))?.code).toBe('NO_LIMIT');
    expect(checkPurchase(input({ limitNcg: 10, balanceNcg: null }))?.code).toBe('OVER_LIMIT');
  });
});

describe('blocksPurchase', () => {
  it('is true only for a live record that did not fail', () => {
    expect(blocksPurchase(record({ status: 'prepared' }))).toBe(true);
    expect(blocksPurchase(record({ status: 'sent' }))).toBe(true);
    expect(blocksPurchase(record({ status: 'confirmed' }))).toBe(true);
    expect(blocksPurchase(record({ status: 'failed' }))).toBe(false);
    expect(blocksPurchase(record({ mode: 'dry-run', status: 'dry-run' }))).toBe(false);
  });
});

describe('the mode', () => {
  it('is a dry run by default, and sending is not built', () => {
    expect(DEFAULT_PURCHASE_MODE).toBe('dry-run');
    expect(LIVE_SENDING_BUILT).toBe(false);
    expect(resolveMode(null)).toBe('dry-run');
  });

  it('cannot be made live by asking while sending does not exist', () => {
    expect(resolveMode('live')).toBe('dry-run');
    expect(resolveMode('LIVE')).toBe('dry-run');
    expect(resolveMode('anything')).toBe('dry-run');
  });

  it('would honour exactly the word live once sending exists', () => {
    expect(resolveMode('live', true)).toBe('live');
    expect(resolveMode('Live', true)).toBe('dry-run');
    expect(resolveMode(null, true)).toBe('dry-run');
  });
});

describe('toPurchaseOffer', () => {
  it('names what the action needs of a single piece of equipment', () => {
    expect(toPurchaseOffer(listing({ itemSubType: 9 }))).toEqual({
      productId: '00112233-4455-6677-8899-aabbccddeeff',
      sellerAgentAddress: '0aa07AbEb5791302C14F9B1F633af96A4c05C7cB',
      sellerAvatarAddress: 'C6e87ae0fCb89d16C339149Da0044812f6eb0a79',
      price: 701,
      legacy: false,
      equipmentType: 'Necklace',
      tradableId: 'ffeeddcc-bbaa-9988-7766-554433221100',
    });
  });

  it('maps each equipment route to its name, and refuses everything else', () => {
    expect(
      [6, 7, 8, 9, 10].map((sub) => toPurchaseOffer(listing({ itemSubType: sub }))?.equipmentType),
    ).toEqual(['Weapon', 'Armor', 'Belt', 'Necklace', 'Ring']);
    expect(toPurchaseOffer(listing({ itemSubType: 1 }))).toBeNull();
    expect(toPurchaseOffer(listing({ itemSubType: 11 }))).toBeNull();
    expect(toPurchaseOffer(listing({ quantity: 2 }))).toBeNull();
  });
});
