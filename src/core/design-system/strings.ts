/**
 * The words the shared components carry with them (ROADMAP.md Phase 6, string externalisation).
 * See `features/roster/strings.ts` for why this is a plain module and not a library.
 *
 * Only defaults and fixed labels live here. Anything a screen passes in as a prop — a button's
 * label, a field's hint — belongs to that screen's own strings module.
 */

export const designStrings = {
  viewerCard: {
    eyebrow: 'YOUR AVATAR',
    rank: 'RANK',
    rankA11y: (rank: number) => `Rank ${rank}`,
    combatPower: 'COMBAT POWER',
    combatPowerA11y: (exact: string) => `Combat power ${exact}`,
    score: (score: number) => `Score ${score}`,
  },

  recordBadge: {
    neverFought: 'never fought',
    wonOf: (wins: number, played: number) =>
      `you won ${wins} of ${played} matches against this player`,
    record: (wins: number, losses: number) => `${wins}W · ${losses}L`,
  },

  searchField: {
    placeholder: 'Search players',
    a11y: 'Search players by name',
  },

  segmentedTabs: {
    a11y: 'View',
  },

  compareBar: {
    theyLead: 'they lead',
    youLead: 'you lead',
    you: 'you',
    them: 'them',
    a11y: (p: { label: string; mine: string; theirs: string; verdict: string; delta: string }) =>
      `${p.label}. You ${p.mine}, them ${p.theirs}. ${p.verdict}, ${p.delta}.`,
  },
} as const;
