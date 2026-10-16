/**
 * What the card says after "try buying" (ADR-0044, step D): one sentence for every way it can end,
 * and none of them claims anything was sent.
 */

import type { PurchaseOutcome } from '@/core/common/purchaseFlow';

import {
  BUY_LABEL,
  CONFIRM_LABEL,
  CONFIRM_WARNING,
  DRY_RUN_NOTE,
  UNAVAILABLE_NOTE,
  WORKING_NOTE,
  WRONG_NOTE,
  describeAttempt,
  shortTransactionId,
} from './purchaseAttemptState';

const TX = '3f1a2b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f10';

describe('shortTransactionId', () => {
  it('keeps the ends of an id, and a short one whole', () => {
    expect(shortTransactionId(TX)).toBe('0x3f1a2b…2f10');
    expect(shortTransactionId('abc')).toBe('0xabc');
  });
});

describe('describeAttempt', () => {
  it('is silent until something is tried, and says it is working while it does', () => {
    expect(describeAttempt({ kind: 'idle' })).toEqual({ tone: 'subtle', text: null });
    expect(describeAttempt({ kind: 'working' })).toEqual({ tone: 'subtle', text: WORKING_NOTE });
  });

  it('says a wrong passphrase, and any other problem, in the negative tone', () => {
    expect(describeAttempt({ kind: 'wrong' })).toEqual({ tone: 'negative', text: WRONG_NOTE });
    expect(describeAttempt({ kind: 'problem', message: UNAVAILABLE_NOTE })).toEqual({
      tone: 'negative',
      text: UNAVAILABLE_NOTE,
    });
  });

  it.each<[string, PurchaseOutcome, string]>([
    [
      'a refusal, with its reason',
      { kind: 'refused', refusal: { code: 'NO_LIMIT', message: 'Set a limit first.' } },
      'Set a limit first.',
    ],
    [
      'a live request',
      { kind: 'live-unavailable' },
      'Buying for real is not available in this build.',
    ],
    [
      'a failure, with where it stopped',
      { kind: 'failed', recordId: 'r', error: { stage: 'unsigned', message: 'node said no' } },
      'Stopped at "unsigned": node said no',
    ],
  ])('says %s as a problem', (_what, outcome, text) => {
    expect(describeAttempt({ kind: 'done', outcome })).toEqual({ tone: 'negative', text });
  });

  it('says a dry run signed the transaction, gives its id, and says nothing was sent', () => {
    const outcome: PurchaseOutcome = {
      kind: 'dry-run',
      recordId: 'r',
      run: {
        agentAddress: '0x1',
        nonce: 7n,
        actionHex: '',
        unsignedHex: '',
        signatureHex: '',
        signedHex: '',
        transactionId: TX,
      },
    };

    const ui = describeAttempt({ kind: 'done', outcome });

    expect(ui.tone).toBe('accent');
    expect(ui.text).toBe(
      'Checked and signed, nothing sent. The transaction would have the id 0x3f1a2b…2f10.',
    );
  });

  it('says a node that refused the send did not buy anything, and a send that is in flight is waiting', () => {
    expect(
      describeAttempt({
        kind: 'done',
        outcome: { kind: 'not-accepted', message: 'nonce too old', recordId: 'r' },
      }),
    ).toEqual({
      tone: 'negative',
      text: 'The node did not accept it, so nothing was bought: nonce too old',
    });
    expect(
      describeAttempt({
        kind: 'done',
        outcome: { kind: 'sent', recordId: 'r', transactionId: TX, uncertain: false },
      }).text,
    ).toBe('Sent (0x3f1a2b…2f10). Waiting for the chain…');
  });

  it('says a send with no clear answer may have gone through, never that it failed', () => {
    const ui = describeAttempt({ kind: 'waiting', transactionId: TX, uncertain: true });

    expect(ui.text).toContain('may have gone through');
    expect(ui.text).not.toContain('failed');
    expect(describeAttempt({ kind: 'waiting', transactionId: TX, uncertain: false }).text).toBe(
      'Sent (0x3f1a2b…2f10). Waiting for the chain…',
    );
  });

  it('says how a purchase ended: bought, refused by the chain, or not known — and warns on the last', () => {
    const bought = describeAttempt({
      kind: 'settled',
      transactionId: TX,
      outcome: { kind: 'confirmed', blockIndex: 5 },
    });
    const refused = describeAttempt({
      kind: 'settled',
      transactionId: TX,
      outcome: { kind: 'failed', reason: 'the piece was already sold or withdrawn.' },
    });
    const unknown = describeAttempt({
      kind: 'settled',
      transactionId: TX,
      outcome: { kind: 'unknown', message: 'still waiting for the chain; check again later.' },
    });

    expect(bought).toMatchObject({ tone: 'accent' });
    expect(bought.text).toContain('Bought');
    expect(refused.text).toBe(
      'The chain refused it, so nothing was bought: the piece was already sold or withdrawn.',
    );
    expect(unknown.tone).toBe('negative');
    expect(unknown.text).toContain('Do not buy this piece again');
    expect(unknown.text).toContain('0x3f1a2b…2f10');
  });

  it('puts the price in the buttons that spend, and says it cannot be undone', () => {
    expect(BUY_LABEL('142,5')).toBe('BUY FOR REAL (142,5 NCG)');
    expect(CONFIRM_LABEL('142,5')).toBe('CONFIRM AND PAY 142,5 NCG');
    expect(CONFIRM_WARNING('Long Sword +0', '142,5')).toBe(
      'You are about to pay 142,5 NCG for Long Sword +0. The payment cannot be undone once it is sent.',
    );
  });

  it('keeps the standing note about a dry run', () => {
    expect(DRY_RUN_NOTE).toContain('nothing is sent');
  });
});
