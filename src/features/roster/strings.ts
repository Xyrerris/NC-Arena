/**
 * Every word the roster puts on screen or hands to a screen reader (ROADMAP.md Phase 6,
 * string externalisation).
 *
 * English only, and a plain module rather than an i18n library: the owner's call is that the app
 * ships in English, so the point of this file is that a translation would have exactly one place
 * per feature to start from, not that one is planned. Functions where a string carries a value,
 * so word order stays the translator's problem and not the caller's.
 *
 * It lives in the feature, not in one shared file, because a feature may not import another
 * feature (ARCHITECTURE.md §4).
 */

export const rosterStrings = {
  title: 'Arena',

  syncing: 'Syncing…',
  syncRetry: 'RETRY',
  // The accessible name of a control starts from what it says on screen (WCAG 2.5.3, "Label in
  // Name"), so a voice-control user can say what they read: "tap update my stats".
  syncRetryA11y: 'Retry syncing',

  addPlayer: '+ New player',
  addPlayerA11y: 'Add a new player to the roster',
  addFirstPlayerA11y: 'New player — add the first player to the roster',

  whoAreYou: 'Who are you?',
  whoAreYouA11y: 'Who are you? Choose which player is your avatar',
  updateMyStats: 'Update my stats',
  updateMyStatsA11y: (name: string) => `Update my stats — ${name}`,

  loading: 'Reading the ladder…',
  errorTitle: 'The ladder could not be read',
  tryAgain: 'TRY AGAIN',

  emptyRosterTitle: 'No players yet',
  emptyRosterBody: 'Add the players you want to track. Everything stays on this device.',
  emptySearchTitle: 'No player by that name',
  emptySearchBody: (needle: string) => `Nothing in the roster matches "${needle}".`,

  season: (season: number) => `SEASON ${season}`,
  updated: (since: string) => `Updated ${since}`,
  playerCount: (total: number) => `${total} registered ${total === 1 ? 'player' : 'players'}`,
  score: (points: number) => `${points} pts`,

  sortRank: 'RANK',
  sortCombatPower: 'CP',
  sortMyWins: 'MY WINS',

  combatPower: (exact: string) => `CP ${exact}`,
  winLabel: '+1 WIN',
  lossLabel: '+1 LOSS',
  recordWinAction: 'Record a win against this player',
  recordLossAction: 'Record a loss against this player',
  swipeHint: 'Swipe left to add a win, right to add a loss.',
  rowAnnouncement: (p: {
    rank: number;
    name: string;
    isViewer: boolean;
    isLocal: boolean;
    combatPower: string;
    score: string;
    record: { wins: number; losses: number } | null;
  }): string => {
    const record =
      p.record === null ? '' : `, your record ${p.record.wins} wins ${p.record.losses} losses`;
    const you = p.isViewer ? ', your avatar' : '';
    // Announced but not drawn — see the note on `RosterRowUi.isLocal`.
    const added = p.isLocal ? ', added on this device' : '';
    // "CP" as it is written on the row, not "combat power": the row is a button, and its name
    // has to contain the text on it.
    return `Rank ${p.rank}, ${p.name}${you}${added}, CP ${p.combatPower}, ${p.score}${record}`;
  },
} as const;
