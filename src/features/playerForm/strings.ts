/**
 * Every word the add/edit form and the "who are you" picker put on screen or hand to a screen
 * reader (ROADMAP.md Phase 6, string externalisation). See `features/roster/strings.ts` for why
 * this is a plain per-feature module and not a shared file or a library.
 */

import type { PlayerDraftField } from '@/core/model';

export const playerFormStrings = {
  cancel: 'Cancel',
  cancelA11y: 'Cancel and go back',
  notYou: 'Not you?',
  notYouA11y: 'Choose a different player as your avatar',

  loading: 'One moment…',
  unavailableTitle: 'Not yours to edit',
  backToRoster: 'Back to the roster',
  viewerGone: 'The player you chose as your avatar is no longer on the ladder. Pick another.',
  playerGone: 'That player is no longer on the ladder.',

  viewerEyebrow: 'YOUR AVATAR',
  newPlayer: 'New player',

  addPlayer: 'Add player',
  updatePlayer: 'Update player',
  saveChanges: 'Save changes',
  saveMyStats: 'Save my stats',

  removePlayer: 'Remove player',
  removePlayerA11y: 'Remove this player from the roster',
  confirmRemoveTitle: 'Remove this player?',
  confirmRemoveBody:
    'They are removed from this device only, and the ranking closes up behind them.',
  confirmKeep: 'Keep',
  confirmRemove: 'Remove',

  scanLabel: 'Fill from screenshot',
  scanA11y: 'Fill the form from a screenshot of the game',
  // What the control is about to do, said before it is pressed — including the deleting
  // (ADR-0026).
  scanHint:
    'Reads a profile screenshot from your photos and then deletes it. Nothing is saved to ' +
    'the roster until you press save.',
  scanAllRead: 'Stats loaded — every field was read.',
  scanPartial: (found: number, total: number, missing: string) =>
    `Stats loaded — ${found} of ${total} fields. Still to type: ${missing}.`,
  screenshotDeleted: 'The screenshot has been deleted.',
  screenshotCopyOnly:
    'The screenshot is still in your photos — this app could not identify it there.',
  screenshotKept: 'The screenshot is still in your photos.',

  alreadyOnLadder: (who: string) =>
    `${who} is already on the ladder. Saving updates that player rather than adding a second row.`,

  fieldLabel: {
    name: 'Name',
    level: 'Level',
    gameCode: 'Game code',
    combatPower: 'Combat power',
    score: 'Score',
    hp: 'HP',
    atk: 'ATK',
    def: 'DEF',
    critPercent: 'Crit %',
    hit: 'HIT',
    spd: 'SPD',
  } satisfies Record<PlayerDraftField, string>,
  levelHint: 'The Lv. beside the name.',
  gameCodeHint: 'The #a984 beside the name. Optional — the # is added for you.',
  // The one field a screenshot cannot supply, said out loud (ADR-0024).
  scoreHint: 'Not on the profile screen — type this one in.',
  critHint: 'A whole percentage — 113 means 113 %.',

  // "Who are you?" — the picker.
  whoAreYou: 'Who are you?',
  whoAreYouBody:
    'Pick your own player. The roster marks them as your avatar, and their stats become the ones every comparison is made against.',
  cancelChoiceA11y: 'Cancel and keep the current avatar',
  choiceLoading: 'Reading the ladder…',
  choiceErrorTitle: 'The ladder could not be read',
  nobodyTitle: 'Nobody to pick yet',
  nobodyBody: 'Add yourself to the roster first — then come back and say which player you are.',
  addPlayerButton: '+ New player',
  addPlayerA11y: 'Add a player to the roster',
  combatPower: (exact: string) => `CP ${exact}`,
  thisIsYou: 'THIS IS YOU',
  candidateA11y: (name: string, rank: number, combatPower: string, isCurrent: boolean) =>
    `${name}, rank ${rank}, combat power ${combatPower}` +
    (isCurrent ? '. This is who you are now.' : ''),
} as const;
