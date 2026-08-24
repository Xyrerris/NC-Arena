/**
 * The add/edit player feature (ADR-0020).
 *
 * A third feature rather than a folder inside `roster` or `player`, because both of those
 * link to it: the roster's "new player" control and the detail screen's "edit" control open
 * the same screen. ARCHITECTURE.md §4 forbids one feature importing another, so a form
 * living in either would be unreachable from the other — the boundary rule turning a
 * naming question into a structural one, which is what it is for.
 *
 * This module may not import core/db or core/network. The repository arrives through
 * `ArenaDataProvider`.
 */

export { PlayerFormScreen, type PlayerFormScreenProps } from './PlayerFormScreen';
export {
  PLAYER_FORM_FIELDS,
  emptyFormValues,
  formTitle,
  submitLabel,
  toDraftValues,
  toFormValues,
  type PlayerFormEvent,
  type PlayerFormFieldSpec,
  type PlayerFormMode,
  type PlayerFormUiState,
  type PlayerFormValues,
} from './playerFormUiState';
export { usePlayerForm, type PlayerFormController, type PlayerFormOptions } from './usePlayerForm';
