/**
 * What the card says after "try buying" (ADR-0044, step D): one sentence for every way it can end,
 * and none of them claims anything was sent.
 */

import type { PurchaseOutcome } from '@/core/common/purchaseFlow';

import {
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
    ['a live request', { kind: 'live-unavailable' }, 'Buying for real is not available yet.'],
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

  it('keeps the standing note about a dry run', () => {
    expect(DRY_RUN_NOTE).toContain('nothing is sent');
  });
});
