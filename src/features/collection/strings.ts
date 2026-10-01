/**
 * Every word the collection screen puts on screen or hands to a screen reader (ROADMAP.md
 * Phase 6, string externalisation). English only, a plain module, one per feature — the same
 * arrangement as the roster's, for the same reason (ARCHITECTURE.md §4).
 */

export const collectionStrings = {
  title: 'Collection',

  viewCollections: 'COLLECTIONS',
  viewItems: 'ITEMS',
  viewsA11y: 'Show collections or the items still to find',

  filterOpen: 'OPEN',
  filterDisputed: 'DISPUTED',
  filterUnlocked: 'UNLOCKED',
  filterAll: 'ALL',
  sortFewest: 'FEWEST ITEMS',
  sortSheet: 'LIST ORDER',

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
  itemList: (ids: readonly number[]) => ids.join(' · '),

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
