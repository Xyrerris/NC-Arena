/**
 * The words of the cart: the sheet that buys a selection of listings, one after the other. They live
 * with the sheet and not with a feature because more than one feature buys through it (the
 * collection's offers and the upgrade's materials), and a sentence written twice would be two
 * sentences to keep in step.
 */

export const purchaseStrings = {
  batchTry: 'TRY BUYING THE SELECTION (DRY RUN)',
  batchTryA11y: 'Check and sign every selected piece, sending nothing',
  batchBuy: (total: string) => `BUY THE SELECTION FOR REAL (${total} NCG)`,
  batchBuyA11y: 'Open the confirmation to pay for every selected piece',
  batchConfirm: (total: string) => `CONFIRM AND PAY ${total} NCG`,
  batchCancel: 'CANCEL',
  batchWarning: (count: number, total: string) =>
    `You are about to pay ${total} NCG for ${count} ${count === 1 ? 'piece' : 'pieces'}, one after ` +
    'the other. Each payment cannot be undone once it is sent. If one goes wrong the rest are not bought.',
  batchTitle: 'Buy the selection',
  batchClose: 'CLOSE',
  batchCloseA11y: 'Close the batch',
  batchTotalLine: (count: number, total: string) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} · ${total} NCG in all`,
  batchLimitLine: (limit: string | null) =>
    limit === null
      ? 'No batch limit is set, so no selection can be bought. Set one on the You tab.'
      : `Batch limit: ${limit} NCG`,
  batchExcluded: (count: number) =>
    `${count} selected ${count === 1 ? 'offer' : 'offers'} left out: only single pieces of ` +
    'equipment can be bought from here so far.',
  batchNothing: 'Nothing in the selection can be bought from here yet.',
  batchOrder:
    'Bought one at a time, in this order. Each is checked again and settled before the next.',
  batchRowWaiting: 'waiting',
  batchRowWorking: 'checking, signing, waiting for the chain…',
  batchRowNotAttempted: 'not attempted',
  batchSkipped: (why: string) => `Skipped, nothing moved: ${why}`,
  batchSigned: (id: string) => `Checked and signed, nothing sent (${id}).`,
  batchBought: (id: string) => `Bought (${id}).`,
  batchChainFailed: (reason: string) => `The chain refused it, nothing was bought: ${reason}`,
  batchUnknown: (message: string, id: string) =>
    `${message} Do not buy this piece again until you have looked at your inventory and your balance (${id}).`,
  batchNotAccepted: (message: string) =>
    `The node did not accept it, so nothing was bought: ${message}`,
  batchAllDry: (count: number) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} checked and signed. Nothing was sent.`,
  batchAllBought: (count: number, spent: string) =>
    `All ${count} ${count === 1 ? 'piece' : 'pieces'} bought for ${spent} NCG.`,
  batchStopped: (label: string, left: number) =>
    `The batch stopped at ${label}.` +
    (left === 0 ? '' : ` ${left} ${left === 1 ? 'piece was' : 'pieces were'} not attempted.`),
  batchSpent: (spent: string) => `Spent so far: ${spent} NCG.`,
} as const;
