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

import type { ScannedField, ScreenshotOutcome, StatSheetScan } from '@/core/ocr';
import {
  MAX_GAME_CODE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_DRAFT_NUMERIC_FIELDS,
  emptyPlayerDraft,
  normaliseGameCode,
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
  { field: 'level', label: 'Level', hint: 'The Lv. beside the name.', numeric: true },
  {
    field: 'gameCode',
    label: 'Game code',
    hint: 'The #a984 beside the name. Optional — the # is added for you.',
    numeric: false,
    maxLength: MAX_GAME_CODE_LENGTH + 1,
  },
  { field: 'combatPower', label: 'Combat power', numeric: true },
  {
    field: 'score',
    label: 'Score',
    // The one field a screenshot cannot supply, said out loud: the game's profile panel
    // does not show it, so a scan leaves this box exactly as it found it (ADR-0024).
    hint: 'Not on the profile screen — type this one in.',
    numeric: true,
  },
  { field: 'hp', label: 'HP', numeric: true },
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
  level: '',
  gameCode: '',
  combatPower: '',
  score: '',
  hp: '',
  atk: '',
  def: '',
  critPercent: '',
  hit: '',
  spd: '',
});

export const toFormValues = (draft: PlayerDraft): PlayerFormValues => ({
  name: draft.name,
  level: String(draft.level),
  gameCode: draft.gameCode,
  combatPower: String(draft.combatPower),
  score: String(draft.score),
  hp: String(draft.hp),
  atk: String(draft.atk),
  def: String(draft.def),
  critPercent: String(draft.critPercent),
  hit: String(draft.hit),
  spd: String(draft.spd),
});

/**
 * A separator only counts as a group separator when it is followed by **exactly three
 * digits**, and the app's own is a dot (ADR-0025).
 *
 * Stripping every `.` and `,` unconditionally was the obvious version and it is wrong in a
 * way nobody would notice: `1.5` would arrive as `15`, a perfectly valid stat that the
 * validator has no reason to reject. Requiring the run of three is what keeps a mistyped
 * decimal a *visible* rejection — `1.5` parses as 1.5 and `validatePlayerDraft` says "enter
 * a whole number" — while `2.418.904.113`, which is what the roster displays and therefore
 * what gets pasted back in, is read as the integer it is.
 *
 * Both punctuation marks are accepted, not just the app's own: a value copied out of
 * somewhere else is still a number the user means.
 */
const GROUP_SEPARATOR = /[.,](?=\d{3}(?:\D|$))/g;

const parseStat = (raw: string): number => {
  const cleaned = raw.replace(/[\s\u00a0]/g, '').replace(GROUP_SEPARATOR, '');
  if (cleaned === '') return 0;
  // `Number` rather than `parseInt`: parseInt("12abc") is 12, which would silently accept
  // a typo. NaN here becomes a validation error the user can see and fix.
  return Number(cleaned);
};

export const toDraftValues = (values: PlayerFormValues): PlayerDraft => {
  const draft: PlayerDraft = {
    ...emptyPlayerDraft(),
    name: values.name,
    // Normalised on the way *out* of the form rather than on every keystroke, so a user
    // who types `#` sees the `#` they typed instead of watching it disappear.
    gameCode: normaliseGameCode(values.gameCode),
  };
  for (const field of PLAYER_DRAFT_NUMERIC_FIELDS) {
    draft[field] = parseStat(values[field]);
  }
  return draft;
};

/**
 * A scan's values, as form strings — and **only** the fields it actually read.
 *
 * Merging rather than replacing is what makes a partial scan useful: a screenshot that
 * gave up everything but the name leaves the name the user already typed alone, instead of
 * blanking it in exchange for the eight stats it did find. `score` is never in `values` at
 * all (see `ScannedField`), so it is never touched.
 */
export const applyScan = (values: PlayerFormValues, scan: StatSheetScan): PlayerFormValues => {
  const next = { ...values };
  for (const field of scan.found) {
    const read = scan.values[field];
    if (read === undefined) continue;
    next[field] = String(read);
  }
  return next;
};

/**
 * The screenshot import's own state, beside the form rather than inside it (ADR-0024).
 *
 * It is a separate axis because the two really are independent: a scan can be running
 * while the user edits a field, and a scan that failed must not clear the values the last
 * one filled in. Folding it into `PlayerFormUiState['kind']` would have made "scanning"
 * a state in which the form does not exist.
 */
export type StatScanUiState =
  | { kind: 'idle' }
  /** The picker is open, or the image is being read. One state: the user cannot tell them apart. */
  | { kind: 'scanning' }
  /** A scan landed. `note` says how much of it did, because a partial read looks like a full one. */
  | { kind: 'applied'; note: string }
  | { kind: 'failed'; message: string };

/** The control that opens the picker. */
export const SCAN_LABEL = 'Fill from screenshot';

/**
 * What the control is about to do, said **before** it is pressed — including the deleting,
 * because a picture removed from someone's photo library is not something to mention
 * afterwards (ADR-0026).
 */
export const SCAN_HINT =
  'Reads a profile screenshot from your photos and then deletes it. Nothing is saved to ' +
  'the roster until you press save.';

const FIELD_LABELS: Readonly<Record<PlayerDraftField, string>> = Object.fromEntries(
  PLAYER_FORM_FIELDS.map((spec) => [spec.field, spec.label]),
) as Record<PlayerDraftField, string>;

/**
 * What became of the picture, in the user's terms.
 *
 * Every outcome is stated, including the two where the screenshot survived. The control
 * promises to delete it, so silence after a failed deletion would be the app appearing to
 * have done something it did not — and "check your gallery" is not a job to leave to the
 * person who trusted the promise (ADR-0026).
 */
const SCREENSHOT_NOTES: Readonly<Record<ScreenshotOutcome, string>> = {
  DELETED: 'The screenshot has been deleted.',
  COPY_ONLY: 'The screenshot is still in your photos — this app could not identify it there.',
  KEPT: 'The screenshot is still in your photos.',
};

/**
 * What the scan managed, in one line the user can act on.
 *
 * It opens by confirming the load, because that is the question being asked at the moment
 * the picker closes and nine boxes change at once. It then names what is *missing* rather
 * than what was found — the found values are already visible in the boxes above it, and a
 * scan that quietly dropped SPD is exactly the failure a "read 9 fields" success message
 * would hide.
 */
export const scanNote = (
  found: readonly ScannedField[],
  missing: readonly ScannedField[],
  screenshot: ScreenshotOutcome,
): string => {
  const loaded =
    missing.length === 0
      ? 'Stats loaded — every field was read.'
      : `Stats loaded — ${found.length} of ${found.length + missing.length} fields. ` +
        `Still to type: ${missing.map((field) => FIELD_LABELS[field]).join(', ')}.`;
  return `${loaded} ${SCREENSHOT_NOTES[screenshot]}`;
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
      scan: StatScanUiState;
    };

export type PlayerFormEvent =
  | { type: 'change'; field: PlayerDraftField; value: string }
  | { type: 'scan' }
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
