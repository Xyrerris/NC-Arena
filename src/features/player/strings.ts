/**
 * Every word the player detail screen puts on screen or hands to a screen reader (ROADMAP.md
 * Phase 6, string externalisation). See `features/roster/strings.ts` for why this is a plain
 * per-feature module and not a shared file or a library.
 */

export const playerStrings = {
  backToRoster: '← ROSTER',
  backToRosterA11y: 'Back to the roster',
  edit: 'Edit',
  editA11y: 'Edit this player',

  loading: 'Reading the stat book…',
  notFoundTitle: 'No such player',
  notFoundBody:
    'This link points at someone who is not on the ladder. They may have left the season, or the link may be stale.',
  errorTitle: 'The stat book could not be read',
  tryAgain: 'TRY AGAIN',

  tabStats: 'STATS',
  tabVersus: 'VS YOU',
  tabsA11y: 'Stats or comparison',
  statsFooter: 'exact value left · rounded value right',

  combatPowerAbbr: 'CP',
  combatPowerA11y: (exact: string) => `Combat power ${exact}`,
  rank: (padded: string) => `RANK #${padded}`,
  level: (level: number) => `LV. ${level}`,

  noAvatarTitle: 'No avatar to compare against',
  noAvatarBody:
    'Once the roster knows which player is yours, this tab compares the two of you stat by stat.',

  headToHead: 'HEAD TO HEAD',
  neverFought: 'never fought',
  wonOf: (wins: number, matches: number) => `you won ${wins} of ${matches} matches`,
  verdict: (ahead: number, total: number) =>
    `you lead in ${ahead} of ${total} stats · delta shown from your values`,

  winsLabel: 'WINS',
  lossesLabel: 'LOSSES',
  // Spelled out, because "minus" is what a screen reader would otherwise say about a button
  // whose only content is a glyph.
  removeA11y: (noun: 'win' | 'loss') => `Remove a ${noun} against this player`,
  addA11y: (noun: 'win' | 'loss') => `Add a ${noun} against this player`,
} as const;
