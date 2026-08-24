/**
 * The add/edit form's state (ARCHITECTURE.md §8, the same contract the other two screens
 * honour: a discriminated union and pre-formatted strings).
 *
 * The one thing this file exists to keep straight is that **a form holds strings and the
 * domain holds integers**, and the conversion between them is a named, tested function
 * rather than an `onChangeText` that calls `Number()` and hopes. Half-typed input is a
 * normal state — `"1"` on the way to `"1500"`, `"-"` on the way to nothing — so the parse
 * has to be total, and validation runs on the parsed draft rather than on the keystroke.
 *
 * Note what this file does *not* do: it never scales a value. Crit is a whole percentage
 * everywhere above `core/db/write.ts`, so every field here is the same kind of thing — a
 * non-negative integer typed into a box.
 */

import {
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_DRAFT_NUMERIC_FIELDS,
  emptyPlayerDraft,
  type PlayerDraft,
  type PlayerDraftErrors,
  type PlayerDraftField,
  type PlayerId,
} from '@/core/model';

/**
 * Create, edit the player with this id, or edit **you** (ADR-0022).
 *
 * `viewer` is a third mode rather than a flag on `edit`, because the two differ in what
 * they are allowed to do, not in how they look: the viewer cannot be removed — you do not
 * delete yourself out of your own roster — and the screen renders no delete control to
 * hide. A boolean would have put that rule in the screen; a mode puts it in the type.
 */
export type PlayerFormMode =
  { kind: 'create' } | { kind: 'edit'; id: PlayerId } | { kind: 'viewer'; id: PlayerId };

/** What the inputs actually hold. One string per draft field, never a number. */
export type PlayerFormValues = Record<PlayerDraftField, string>;

export interface PlayerFormFieldSpec {
  field: PlayerDraftField;
  label: string;
  /** Static guidance — units, ranges. Hidden once an error replaces it. */
  hint?: string;
  numeric: boolean;
  maxLength?: number;
}

/**
 * Field order for the form. Name first, then the stat book in the order the detail screen
 * already renders it, so the two screens agree about what a player is made of.
 *
 * Crit is a **whole percentage** — 113 means 113 %, and values above 100 are real (see
 * `MAX_CRIT_PERCENT`). The column underneath stores basis points, but that is the storage
 * layer's business: a form that asked for 1130000 would be asking the user to do a unit
 * conversion by hand.
 */
export const PLAYER_FORM_FIELDS: readonly PlayerFormFieldSpec[] = [
  { field: 'name', label: 'Name', numeric: false, maxLength: MAX_PLAYER_NAME_LENGTH },
  { field: 'combatPower', label: 'Combat power', numeric: true },
  { field: 'score', label: 'Score', numeric: true },
  { field: 'atk', label: 'ATK', numeric: true },
  { field: 'def', label: 'DEF', numeric: true },
  {
    field: 'critPercent',
    label: 'Crit %',
    hint: 'A whole percentage — 113 means 113 %.',
    numeric: true,
  },
  { field: 'hit', label: 'HIT', numeric: true },
  { field: 'spd', label: 'SPD', numeric: true },
] as const;

/**
 * Numerics start empty rather than at "0", so the first keystroke does not have to delete
 * a zero the user never typed. `toDraftValues` reads an empty numeric field as 0, which is
 * what `emptyPlayerDraft` already says a stat with nothing in it is worth.
 */
export const emptyFormValues = (): PlayerFormValues => ({
  name: '',
  combatPower: '',
  score: '',
  atk: '',
  def: '',
  critPercent: '',
  hit: '',
  spd: '',
});

export const toFormValues = (draft: PlayerDraft): PlayerFormValues => ({
  name: draft.name,
  combatPower: String(draft.combatPower),
  score: String(draft.score),
  atk: String(draft.atk),
  def: String(draft.def),
  critPercent: String(draft.critPercent),
  hit: String(draft.hit),
  spd: String(draft.spd),
});

/**
 * Group separators and spaces are stripped before parsing, because every number this app
 * *displays* carries them — "2,418,904,113" is what the roster shows, so it is what gets
 * pasted back in. This is safe only while the app is English-only (open decision 9): in a
 * locale where the comma is a decimal separator, stripping it turns 1,5 into 15.
 */
const parseStat = (raw: string): number => {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (cleaned === '') return 0;
  // `Number` rather than `parseInt`: parseInt("12abc") is 12, which would silently accept
  // a typo. NaN here becomes a validation error the user can see and fix.
  return Number(cleaned);
};

export const toDraftValues = (values: PlayerFormValues): PlayerDraft => {
  const draft: PlayerDraft = { ...emptyPlayerDraft(), name: values.name };
  for (const field of PLAYER_DRAFT_NUMERIC_FIELDS) {
    draft[field] = parseStat(values[field]);
  }
  return draft;
};

export type PlayerFormUiState =
  /** Edit mode only, while the player is being read out of SQLite. */
  | { kind: 'loading' }
  /** Edit mode only: the id in the URL matches nothing, or matches a synced player. */
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'ready';
      mode: PlayerFormMode;
      /** `"New player"`, or the name the player had when the form opened. */
      title: string;
      values: PlayerFormValues;
      /** Per-field rejections. Empty until a submit has been refused. */
      errors: PlayerDraftErrors;
      /** A failure with no field to blame — a write that threw, for instance. */
      message: string | null;
      /** True between pressing Save and the write returning. Blocks a double submit. */
      isSaving: boolean;
    };

export type PlayerFormEvent =
  | { type: 'change'; field: PlayerDraftField; value: string }
  | { type: 'submit' }
  | { type: 'delete' };

export const formTitle = (mode: PlayerFormMode, name: string): string =>
  mode.kind === 'create' ? 'New player' : name;

/**
 * The viewer screen shows the player's name as its title like an edit does, and says whose
 * it is above it (`VIEWER_EYEBROW`). Naming the screen "You" instead would hide the one
 * thing worth confirming — *which* player the app currently believes is you.
 */
export const VIEWER_EYEBROW = 'YOUR AVATAR';

export const submitLabel = (mode: PlayerFormMode): string => {
  switch (mode.kind) {
    case 'create':
      return 'Add player';
    case 'edit':
      return 'Save changes';
    case 'viewer':
      return 'Save my stats';
  }
};
