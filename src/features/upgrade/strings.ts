/** The words of the Upgrade section (the upgrade plan, phase 3). */

export const upgradeStrings = {
  title: 'Upgrade',
  intro:
    'Equipment bought as material for raising another piece, ranked by NCG per billion experience ' +
    '(Gexp) against a ceiling for its grade. Nothing is read until you ask.',
  sheetLoading: 'Reading the equipment sheets…',
  sheetFailedOffline: 'Could not reach the sheets. Check the connection.',
  sheetFailedOther: 'The equipment sheets could not be read.',
  sheetMalformed: 'The equipment sheets came back in a form this app cannot read.',
  sheetNoExp: 'The experience sheet is missing, so nothing can be valued.',
  sheetRetry: 'TRY AGAIN',
  notOnChain:
    'The newest grade and today’s experience values are missing: the node could not be reached, ' +
    'so these sheets are older than the chain.',
  find: 'FIND MATERIAL',
  findA11y: 'Read the market for equipment worth buying as material',
  again: 'READ AGAIN',
  againA11y: 'Read the market again',
  stop: 'STOP',
  stopA11y: 'Stop reading the market',
  retryFailed: 'RETRY FAILED',
  retryFailedA11y: 'Read again only the items that failed',
  failed: (count: number) => `${count} ${count === 1 ? 'item' : 'items'} could not be read.`,
  status: (done: number, total: number, running: boolean) =>
    running ? `Reading the market: ${done} of ${total} items…` : `Read ${done} of ${total} items.`,
  withValkyrie: 'GRADE 7 ON',
  withoutValkyrie: 'GRADE 7 OFF',
  valkyrieA11y: 'Include grade 7 in the reading: it is the slowest and the least valuable',
  gradeAll: 'ALL GRADES',
  gradeAllA11y: 'Show every grade',
  gradeChip: (grade: number) => `GRADE ${grade}`,
  gradeChipA11y: (grade: number) => `Show only grade ${grade}`,
  slotAll: 'ALL SLOTS',
  slotAllA11y: 'Show every slot',
  slotChip: (slot: string) => slot.toUpperCase(),
  slotChipA11y: (slot: string) => `Show only ${slot}`,
  onlyRaised: 'ONLY RAISED',
  allLevels: 'ALL LEVELS',
  levelsA11y: 'Switch between only pieces raised above +0 and every piece',
  ceilings: 'CEILINGS',
  ceilingsA11y: 'Show or hide the ceilings in NCG per Gexp',
  ceilingLabel: (grade: number) => `Grade ${grade} ceiling, NCG per Gexp`,
  ceilingHint: (current: string) => `Now ${current}. Leave empty for the default.`,
  overCeiling: (count: number) =>
    `${count} ${count === 1 ? 'offer is' : 'offers are'} over the ceiling and not listed.`,
  leftOutAtZero: (count: number) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} at +0 qualify but are hidden by ONLY RAISED.`,
  nothingYet: 'Nothing is in range yet. Read the market, or raise a ceiling.',
  nothingInRange: 'Nothing on the market is under the ceilings right now.',
  select: 'SELECT',
  selected: 'SELECTED',
  selectA11y: (label: string) => `Select ${label} to buy`,
  unselectA11y: (label: string) => `Remove ${label} from the selection`,
  rowA11y: (label: string, price: string) => `${label}, ${price} NCG`,
  piece: (name: string, level: number, element: string) =>
    `${name} +${level}${element === '' ? '' : ` · ${element}`}`,
  price: (price: string) => `${price} NCG`,
  detail: (r: string, ng: string, gexp: string) =>
    `${ng} NCG per Gexp · ${gexp} Gexp · ${r} NCG per +0 piece`,
  bandOptimum: 'bargain',
  bandWithin: 'in range',
  barTitle: (count: number, total: string) =>
    `${count} ${count === 1 ? 'piece' : 'pieces'} selected · ${total} NCG`,
  barNote:
    'Asking prices, read a little while ago. Each piece is checked again before it is bought. ' +
    'Buy for the upgrade you have planned, not for a stock.',
  buy: 'BUY THE SELECTION',
  buyA11y: 'Review and buy the selected pieces',
  clear: 'CLEAR',
  clearA11y: 'Clear the selection',
} as const;
