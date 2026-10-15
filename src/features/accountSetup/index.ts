/**
 * The setup gate (ADR-0035, decision 2) — how a device gets an API key before anything can
 * reach the backend with one.
 *
 * Rendered by `src/app/_layout.tsx` in front of the app on a first launch. After the user
 * skipped it (ADR-0038) it is also reachable from the "You" screen, through
 * `AccountConnectPrompt` and the `/account` route.
 */

export { AccountConnectPrompt, type AccountConnectPromptProps } from './AccountConnectPrompt';
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
  SKIP_HINT,
  SKIP_LABEL,
  TITLE,
  actionLabel,
  failureMessage,
  type AccountSetupUiState,
} from './accountSetupUiState';
export { useAccountSetup, type AccountSetupController } from './useAccountSetup';
