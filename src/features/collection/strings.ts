/**
 * Every word the collection screen puts on screen or hands to a screen reader (ROADMAP.md
 * Phase 6, string externalisation). English only, a plain module, one per feature — the same
 * arrangement as the roster's, for the same reason (ARCHITECTURE.md §4).
 */

export const collectionStrings = {
  title: 'Collection',

  viewCollections: 'COLLECTIONS',
  viewItems: 'ITEMS',
  viewOffers: 'OFFERS',
  viewsA11y: 'Show collections, the items still to find, or the best offers for them',

  filterOpen: 'OPEN',
  filterDisputed: 'DISPUTED',
  filterUnlocked: 'UNLOCKED',
  filterAll: 'ALL',
  sortFewest: 'FEWEST ITEMS',
  sortSheet: 'LIST ORDER',

  statsLabel: 'REWARDS — all of the ones selected',

  filtersTitle: 'FILTERS',
  filtersToggleA11y: (open: boolean) => (open ? 'Hide the filters' : 'Show the filters'),
  sectionStatus: 'STATUS',
  sectionCategory: 'CATEGORY',
  sectionEquipment: 'EQUIPMENT TYPE',
  sectionStats: 'REWARDS',
  sectionToggleA11y: (name: string, open: boolean) => `${open ? 'Hide' : 'Show'} ${name}`,
  categoryHint: 'Collections that ask for any of the selected',
  statsHint: 'Collections that give all of the selected',
  filtersReset: 'RESET',
  filtersResetA11y: 'Put every filter back to its default',
  filtersNone: 'any',
  categoryEquipment: 'EQUIPMENT',
  categoryGrimoire: 'GRIMOIRE',
  categoryCostume: 'COSTUME',
  categoryTitle: 'TITLE',
  categoryFood: 'FOOD',
  categoryOther: 'OTHER',

  noAvatarTitle: 'No avatar yet',
  noAvatarBody: 'Say which Nine Chronicles avatar is yours, and its collections show up here.',
  noAvatarAction: 'OPEN YOU',

  progress: (unlocked: number, total: number) => `${unlocked} of ${total} unlocked`,
  progressA11y: (unlocked: number, total: number) => `${unlocked} of ${total} collections unlocked`,
  neverRead: 'Not checked against the chain yet',
  updated: (since: string, source: string) => `Updated ${since} · ${source}`,
  unknownNote: (count: number) =>
    `The chain lists ${count} unlocked ${count === 1 ? 'collection' : 'collections'} that this ` +
    'list does not include, so the progress above is at least what it shows.',
  sampleNote: 'Sample data. The real collection list is not part of this build yet.',

  reading: 'Reading the chain…',
  noState: 'The chain has no collections for this avatar yet.',
  failedOffline: 'Could not reach the chain. Showing what was read last.',
  failedOther: 'The chain could not be read right now. Showing what was read last.',
  retry: 'RETRY',
  retryA11y: 'Read the chain again',

  collectionTitle: (id: number) => `Collection ${id}`,
  itemCount: (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`,
  itemNeedsSkill: (label: string) => `${label}, needs a skill`,
  skillLegend: 'Marks a piece that needs a skill',
  piece: (name: string, level: number, element: string) => `${name} +${level} · ${element}`,
  withSkill: 'with skill',
  noSkill: 'no skill',
  helps: (count: number) => `helps ${count} ${count === 1 ? 'collection' : 'collections'}`,
  unlistedNote: (slots: number) =>
    `${slots} costume and material ${slots === 1 ? 'slot is' : 'slots are'} not in this list yet.`,

  marketButton: 'FIND ON MARKET',
  marketButtonA11y: (id: number) => `Find the pieces of collection ${id} on the market`,
  marketNotSold: 'Not sold on the market',

  ownedTag: 'IN BAG',
  ownedTagMany: (count: number) => `IN BAG ×${count}`,
  ownedPartial: (owned: number, needed: number) => `${owned} OF ${needed} IN BAG`,
  missingTag: 'TO FIND',
  ownedA11y: (label: string, tag: string) => `${label}, ${tag.toLowerCase()}`,
  ownedSummary: (have: number, total: number) => `${have} of ${total} already in your bag`,
  itemYouHave: (count: number) => `you have ${count}`,
  inventoryReading: 'Reading your inventory…',
  inventoryUpdated: (since: string, source: string) => `Inventory read ${since} · ${source}`,
  inventoryNone: 'The chain has no avatar at this address, so what you own is not shown.',
  inventoryFailedOffline: 'Could not read your inventory. The pieces you own are not marked.',
  inventoryFailedOther:
    'Your inventory could not be read right now. The pieces you own are not marked.',

  marketTitle: (id: number) => `Market · Collection ${id}`,
  marketClose: 'CLOSE',
  marketCloseA11y: 'Close the market list',
  marketPiecesA11y: 'Choose which piece to look for',
  marketReading: (scanned: string) =>
    scanned === '0' ? 'Reading the market…' : `Reading the market… ${scanned} listings read`,
  marketWaiting: 'Waiting for its turn…',
  marketNothing: 'Nothing of this piece is on sale right now.',
  marketPieceNotSold: 'This piece is not sold on the market.',
  marketSummary: (count: string, total: number, from: string) =>
    `${count} ${total === 1 ? 'listing' : 'listings'} · from ${from}`,
  marketNeeds: (count: number) => `needs ${count}`,
  listingEach: (price: string) => `${price} NCG each`,
  listingLot: (quantity: string, total: string) => `${quantity} for ${total} NCG`,
  marketFreshness: (scanned: string, since: string) =>
    `Asking prices, not what was paid · ${scanned} of this item read ${since}`,
  marketShowing: (shown: number, total: string) => `Showing the cheapest ${shown} of ${total}`,
  marketFailedOffline: 'Could not reach the market. Check the connection and try again.',
  marketFailedOther: 'The market could not be read right now.',
  marketRetry: 'TRY AGAIN',
  marketRetryA11y: 'Read the market again for this piece',
  marketUnlisted: (count: number) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} of this collection ` +
    'cannot be searched (not in the game data, or not on the market).',
  purchaseTitle: 'Before buying',
  purchaseBack: 'BACK',
  purchaseBackA11y: 'Back to the listings',
  purchaseReviewA11y: (summary: string) => `${summary}. Review this purchase`,
  purchaseChecking: 'Checking that the offer is still on sale…',
  purchaseGone: 'This listing is no longer on sale: it was sold or withdrawn.',
  purchaseFailedOffline: 'Could not reach the market to check the offer. Check the connection.',
  purchaseFailedOther: 'The market could not be read to check the offer.',
  purchaseWouldBuy: (what: string, total: string) => `This would buy ${what} for ${total} NCG.`,
  purchaseCount: (inLot: number, needed: number) =>
    inLot === needed
      ? `The lot holds exactly the ${needed} the collection asks for.`
      : `The lot holds ${inLot}; the collection asks for ${needed}.`,
  purchaseBalance: (ncg: string) => `You hold ${ncg} NCG`,
  purchaseBalanceNoAvatar: 'Your balance is unknown: no avatar is set.',
  purchaseBalanceOffline: 'Your balance is unknown: the chain could not be reached.',
  purchaseBalanceFailed: 'Your balance could not be read.',
  purchaseLeft: (ncg: string) => `Would leave ${ncg} NCG`,
  purchaseShort: (ncg: string) => `${ncg} NCG short of the price`,
  purchaseNotBuilt: 'Buying for real is not available yet. Nothing is ever sent from here.',
  listingCp: (cp: string) => `CP ${cp}`,
  listingSeller: (seller: string) => `seller ${seller}`,

  offersIntro: (pieces: number, collections: number) =>
    `${pieces} ${pieces === 1 ? 'piece' : 'pieces'} still to find in ` +
    `${collections} ${collections === 1 ? 'collection' : 'collections'}. ` +
    'The cheapest offer for each, by asking price. The list follows the filters above.',
  offersNoInventory:
    'Your inventory is not read, so pieces you already own may be listed as missing.',
  offersUnsearchable: (count: number) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} cannot be searched ` +
    '(not in the game data, or not on the market).',
  offersFind: 'FIND OFFERS',
  offersFindA11y: 'Read the market for every piece still to find',
  offersStop: 'STOP',
  offersStopA11y: 'Stop reading the market',
  offersReading: (done: number, total: number) =>
    `Reading the market… ${done} of ${total} ${total === 1 ? 'piece' : 'pieces'}. ` +
    'The order can change until it is done.',
  offersStopped: (done: number, total: number, found: number) =>
    `Stopped after ${done} of ${total} ${total === 1 ? 'piece' : 'pieces'}: ` +
    `${found} ${found === 1 ? 'offer' : 'offers'} found so far, the rest not read.`,
  offersDone: (found: number, nothing: number) =>
    `${found} ${found === 1 ? 'offer' : 'offers'} found` +
    (nothing === 0 ? '.' : `, ${nothing} with nothing on sale.`),
  offersFailed: (count: number) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} could not be read.`,
  offersRetryFailed: 'READ THEM AGAIN',
  offersRetryFailedA11y: 'Read the pieces that failed again',
  offersAgain: 'READ AGAIN',
  offersAgainA11y: 'Read the market again for every piece',
  offersNothingToFind: 'Nothing left to find',
  offersNothingToFindBody: 'Every piece these collections ask for is already in the bag.',
  offersHelps: (count: number) => `helps ${count} ${count === 1 ? 'collection' : 'collections'}`,
  offersUnits: (units: string, lots: number) =>
    `${units} units in ${lots} ${lots === 1 ? 'lot' : 'lots'}`,
  offersTotal: (price: string) => `${price} NCG`,
  offersRaise: (from: number, to: number, listed: string, ncg: string) =>
    `listed +${from} at ${listed} NCG · +${ncg} NCG to raise it to +${to}`,
  offersVerdictGood: 'good price',
  offersVerdictFair: 'fair price',
  offersVerdictDear: 'above the standard price',
  offersOverpriced: (count: number, shown: boolean) =>
    `${count} ${count === 1 ? 'offer is' : 'offers are'} above the standard price` +
    (shown ? ' and shown at the end.' : ' and left out.'),
  offersOverpricedShow: 'SHOW THEM',
  offersOverpricedShowA11y: 'Show the offers above the standard price',
  offersOverpricedHide: 'HIDE THEM',
  offersOverpricedHideA11y: 'Leave out the offers above the standard price',
  offersBarRaise: (ncg: string) =>
    `Plus ${ncg} NCG still to spend raising the pieces after buying them.`,
  offersSelect: 'SELECT',
  offersSelected: 'SELECTED',
  offersSelectA11y: (label: string) => `Select ${label} for the total`,
  offersUnselectA11y: (label: string) => `Remove ${label} from the total`,
  offersBarTitle: (count: number, total: string) =>
    `${count} ${count === 1 ? 'offer' : 'offers'} selected · ${total} NCG`,
  offersBarUnits: (units: string) => `${units} units in all`,
  offersBarReading: 'Reading your balance…',
  offersBarNote:
    'Asking prices, read a little while ago. Nothing is bought from here: ' +
    'each offer is bought on its own card, which checks the price again.',
  offersBuySelection: 'BUY THE SELECTION',
  offersBuySelectionA11y: 'Review and buy the selected offers',
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
  offersClear: 'CLEAR',
  offersClearA11y: 'Clear the selection',
  offersPicksTitle: 'This takes more than one lot. Buy them one at a time:',
  offersClose: 'CLOSE',
  offersCloseA11y: 'Close the offer',
  offersSheetTitle: 'Offer',

  sheetLoading: 'Loading the collection list…',
  sheetFailedOffline: 'Could not reach the game data. Check the connection and try again.',
  sheetFailedOther: 'The game data could not be read right now.',
  sheetMalformed: 'The game data came back in a shape this app does not understand.',
  sheetRetry: 'TRY AGAIN',

  statusUnlocked: 'Unlocked',
  statusClaimed: 'Marked by you, not checked yet',
  statusDisputed: 'Marked by you, but the chain does not list it',
  statusMissing: 'Missing',

  tick: 'I HAVE THIS',
  tickA11y: (id: number) => `Mark collection ${id} as unlocked`,
  dropTick: 'DROP MY MARK',
  dropTickA11y: (id: number) => `Remove your mark from collection ${id}`,

  emptyFilterTitle: 'Nothing here',
  emptyFilterBody: 'No collection matches this filter.',
  emptyItemsTitle: 'Nothing left to find',
  emptyItemsBody: 'Every collection in the list is unlocked.',

  family: (family: string) => `Items ${family}…`,
  itemUnlocks: (itemId: number, count: number) =>
    `${itemId} · helps ${count} ${count === 1 ? 'collection' : 'collections'}`,
} as const;
