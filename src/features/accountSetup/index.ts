/**
 * The setup gate (ADR-0035, decision 2) — how a device gets an API key before anything can
 * reach the backend with one.
 *
 * Rendered by `src/app/_layout.tsx` rather than by a route of its own: it is not somewhere
 * the user navigates to, it is what there is instead of the app until it is done, and a
 * route would put it in a back stack it must not be possible to leave.
 */

export { AccountSetupScreen, type AccountSetupScreenProps } from './AccountSetupScreen';
export {
  API_KEY_LABEL,
  API_KEY_NOTE,
  CODE_HINT,
  CODE_LABEL,
  CONTINUE_LABEL,
  CREATE_LABEL,
  INTRO,
  LINK_LABEL,
  RECOVERY_CODE_LABEL,
  SECRETS_TITLE,
  SECRETS_WARNING,
  TITLE,
  actionLabel,
  failureMessage,
  type AccountSetupUiState,
} from './accountSetupUiState';
export { useAccountSetup, type AccountSetupController } from './useAccountSetup';
