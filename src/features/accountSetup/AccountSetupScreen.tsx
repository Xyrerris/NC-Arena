/**
 * The setup gate — the screen that stands in front of the roster until this device is paired
 * to an account (ADR-0035, decision 2; the owner's decision 3 in HANDOFF.md).
 *
 * It is the first thing a new install shows when a backend is configured, and it has two
 * faces. The first asks for a recovery code: filled in, this device joins a roster that
 * already exists; left empty, a new one is minted. The second shows what minting produced,
 * and it is the only time either secret is ever displayed — the server keeps only their
 * hashes, so there is no second chance and no "email it to me".
 *
 * That second face is why the gate does not close itself. The key is stored the instant the
 * account exists, so `needsAccount` goes false while the recovery code is still on screen;
 * a gate that watched it would swap the roster in over the one thing the user must not miss.
 * The way out is the button below the code, and nothing else.
 *
 * A `ScrollView` rather than a `View`, because every word here matters and at 200 % font
 * scale — which is what jest-expo renders at, and what the Phase 6 gate checks — the warning
 * alone is taller than a phone.
 */

import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  FormField,
  ScreenScaffold,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';

import {
  API_KEY_LABEL,
  API_KEY_NOTE,
  CODE_HINT,
  CODE_LABEL,
  CONTINUE_LABEL,
  INTRO,
  RECOVERY_CODE_LABEL,
  SECRETS_TITLE,
  SECRETS_WARNING,
  SKIP_HINT,
  SKIP_LABEL,
  TITLE,
} from './accountSetupUiState';
import { useAccountSetup } from './useAccountSetup';

export interface AccountSetupScreenProps {
  /**
   * Called when this device is paired and the user has finished with whatever was on screen.
   * The route decides what that leads to — here it only means "the gate may close".
   */
  onDone: () => void;
}

export function AccountSetupScreen({ onDone }: AccountSetupScreenProps) {
  const { state, code, onChangeCode, actionLabel, onSubmit, onContinue, onSkip } = useAccountSetup({
    onDone,
  });

  // While the secrets are up, Android's back button does nothing. On the gate it would close
  // the app, and on `/account` it would pop the route — either way over the only time the
  // recovery code is ever shown, with the key already stored so nothing brings the screen
  // back. "I have written it down" stays the one way out.
  const showingSecrets = state.kind === 'created';
  useEffect(() => {
    if (!showingSecrets) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [showingSecrets]);

  return (
    <ScreenScaffold>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="account-setup"
      >
        {state.kind === 'created' ? (
          <Secrets
            apiKey={state.apiKey}
            recoveryCode={state.recoveryCode}
            onContinue={onContinue}
          />
        ) : (
          <Ask
            code={code}
            onChangeCode={onChangeCode}
            actionLabel={actionLabel}
            onSubmit={onSubmit}
            onSkip={onSkip}
            busy={state.kind === 'working'}
            error={state.kind === 'asking' ? state.error : null}
          />
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

interface AskProps {
  code: string;
  onChangeCode: (next: string) => void;
  actionLabel: string;
  onSubmit: () => void;
  onSkip: () => void;
  busy: boolean;
  error: string | null;
}

function Ask({ code, onChangeCode, actionLabel, onSubmit, onSkip, busy, error }: AskProps) {
  return (
    <>
      <ArenaText variant="displaySmall" tone="primary">
        {TITLE}
      </ArenaText>
      <ArenaText variant="bodySmall" tone="subtle">
        {INTRO}
      </ArenaText>

      <FormField
        label={CODE_LABEL}
        value={code}
        onChangeText={onChangeCode}
        hint={CODE_HINT}
        // The code is base64url, so the keyboard must not helpfully capitalise or correct
        // it — `FormField` sets neither, which is what this field needs and the name field
        // does not.
        placeholder=""
        testID="account-setup-code"
      />

      {error === null ? null : (
        <ArenaText variant="bodySmall" tone="negative" testID="account-setup-error">
          {error}
        </ArenaText>
      )}

      <ArenaButton
        label={actionLabel}
        onPress={onSubmit}
        busy={busy}
        fill
        testID="account-setup-submit"
      />

      {busy ? <ActivityIndicator color={color.accent} testID="account-setup-busy" /> : null}

      <ArenaButton
        label={SKIP_LABEL}
        variant="secondary"
        onPress={onSkip}
        disabled={busy}
        fill
        testID="account-setup-skip"
      />
      <ArenaText variant="bodyCaption" tone="subtle">
        {SKIP_HINT}
      </ArenaText>
    </>
  );
}

interface SecretsProps {
  apiKey: string;
  recoveryCode: string;
  onContinue: () => void;
}

function Secrets({ apiKey, recoveryCode, onContinue }: SecretsProps) {
  return (
    <>
      <ArenaText variant="displaySmall" tone="primary">
        {SECRETS_TITLE}
      </ArenaText>
      <ArenaText variant="bodySmall" tone="negative" testID="account-setup-warning">
        {SECRETS_WARNING}
      </ArenaText>

      <Secret label={RECOVERY_CODE_LABEL} value={recoveryCode} testID="account-setup-recovery" />
      <Secret label={API_KEY_LABEL} value={apiKey} note={API_KEY_NOTE} testID="account-setup-key" />

      <ArenaButton
        label={CONTINUE_LABEL}
        onPress={onContinue}
        fill
        testID="account-setup-continue"
      />
    </>
  );
}

interface SecretProps {
  label: string;
  value: string;
  note?: string;
  testID: string;
}

function Secret({ label, value, note, testID }: SecretProps) {
  return (
    <View style={styles.secret}>
      <ArenaText variant="labelMicro" tone="muted">
        {label.toUpperCase()}
      </ArenaText>
      <ArenaText
        variant="numericSmall"
        tone="primary"
        // Selectable so the code can be copied rather than transcribed by eye. It is 43
        // base64url characters and a single wrong one is indistinguishable from a wrong
        // code at the other end.
        selectable
        testID={testID}
      >
        {value}
      </ArenaText>
      {note === undefined ? null : (
        <ArenaText variant="bodyCaption" tone="subtle">
          {note}
        </ArenaText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: layout.screenGutter,
    paddingTop: space[26],
    gap: space[16],
  },
  secret: {
    padding: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.decorative.divider,
    backgroundColor: color.decorative.fill,
    gap: space[4],
  },
});
