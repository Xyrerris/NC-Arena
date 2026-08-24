/**
 * What the user types when they add or edit a player by hand.
 *
 * A draft is deliberately *not* a `Player`: it carries no `id` and no `rank`, because
 * neither is the user's to choose. The id is issued by whoever stores the row (today
 * `core/data`, tomorrow the server), and the rank is a position in one ranked list — the
 * exact inconsistency ARCHITECTURE.md §7 exists to prevent. Letting a form supply either
 * would put the prototype's "viewer ranked 12 in a 14-player roster" back on the table.
 *
 * Validation lives here rather than in the form because it is the same rule the repository
 * enforces before writing, and a rule that is stated twice is a rule that will disagree
 * with itself. Zod is not used: this module imports nothing (ARCHITECTURE.md §4), and Zod
 * belongs at the *network* boundary where the input genuinely comes from elsewhere.
 */

/** Basis points in one percentage point. The `crit_bp` column's unit is bp (§2.2). */
export const CRIT_BP_PER_PERCENT = 10_000;

/**
 * The largest crit that still scales to a safe integer. Above it `percent * 10_000` passes
 * 2^53 and stops being exact silently, which is the §2.1 ceiling arriving by the back door.
 *
 * There is deliberately **no 100 % cap**. An earlier draft of this file had one; the game's
 * crit values go above it (113, 178), so the cap was rejecting real data.
 */
export const MAX_CRIT_PERCENT = Math.floor(Number.MAX_SAFE_INTEGER / CRIT_BP_PER_PERCENT);

export interface PlayerDraft {
  name: string;
  combatPower: number;
  score: number;
  atk: number;
  def: number;
  /**
   * Crit as a **whole percentage** — 113 means 113 %.
   *
   * The column stores basis points, and the scaling happens once, at the storage boundary
   * in `core/db/write.ts`. Keeping the draft in percent is what lets crit be validated by
   * exactly the same rule as every other stat: "a non-negative whole number". Had the draft
   * carried bp instead, the form would have had to multiply — and `1.5 * 10_000` is 15000,
   * a perfectly valid bp, so a fractional percent would have laundered itself through the
   * conversion and no validator downstream could have seen it.
   */
  critPercent: number;
  hit: number;
  spd: number;
}

export type PlayerDraftField = keyof PlayerDraft;

export type PlayerDraftNumericField = Exclude<PlayerDraftField, 'name'>;

/** Field order for the form, and the list the validator walks. */
export const PLAYER_DRAFT_NUMERIC_FIELDS: readonly PlayerDraftNumericField[] = [
  'combatPower',
  'score',
  'atk',
  'def',
  'critPercent',
  'hit',
  'spd',
] as const;

/**
 * Long enough for every name in the design, short enough that a roster row cannot be
 * turned into a paragraph by one entry. The roster row ellipsises nothing, so an
 * unbounded name would push the CP column off the screen for everybody.
 */
export const MAX_PLAYER_NAME_LENGTH = 24;

export type PlayerDraftErrors = Partial<Record<PlayerDraftField, string>>;

export const emptyPlayerDraft = (): PlayerDraft => ({
  name: '',
  combatPower: 0,
  score: 0,
  atk: 0,
  def: 0,
  critPercent: 0,
  hit: 0,
  spd: 0,
});

/**
 * `Number.isSafeInteger` rather than a range check against `Int32`: the ceiling that
 * matters in JavaScript is 2^53 (ARCHITECTURE.md §2.1), and above it arithmetic stops
 * being exact silently. The formatter's guard would throw on such a value, so rejecting
 * it here is what keeps a hand-typed number from turning the roster into a crash.
 */
const numericProblem = (field: PlayerDraftNumericField, value: number): string | null => {
  if (!Number.isSafeInteger(value)) {
    return 'Enter a whole number below 9,007,199,254,740,991.';
  }
  if (value < 0) return 'Cannot be negative.';
  if (field === 'critPercent' && value > MAX_CRIT_PERCENT) {
    return 'That crit is too large to store exactly.';
  }
  return null;
};

export const validatePlayerDraft = (draft: PlayerDraft): PlayerDraftErrors => {
  const errors: PlayerDraftErrors = {};

  const name = draft.name.trim();
  if (name.length === 0) errors.name = 'A player needs a name.';
  else if (name.length > MAX_PLAYER_NAME_LENGTH) {
    errors.name = `At most ${MAX_PLAYER_NAME_LENGTH} characters.`;
  }

  for (const field of PLAYER_DRAFT_NUMERIC_FIELDS) {
    const problem = numericProblem(field, draft[field]);
    if (problem !== null) errors[field] = problem;
  }

  return errors;
};

export const isPlayerDraftValid = (errors: PlayerDraftErrors): boolean =>
  Object.keys(errors).length === 0;

/**
 * The name as it is stored. Trimming at the boundary rather than in the form is what
 * makes `" Skarn "` and `"Skarn"` the same player to the duplicate-name check, whichever
 * screen typed them.
 */
export const normalisePlayerName = (name: string): string => name.trim();
