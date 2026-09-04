/**
 * Add a player, or edit one this device added (ADR-0020).
 *
 * The screen is one `ScrollView` rather than a `FlashList`, and that is deliberate: the
 * field count is fixed at eight, and a recycler that reuses a focused `TextInput` drops the
 * keyboard mid-word — the same reason `RosterScreen` keeps its search field out of the
 * list header.
 *
 * `keyboardShouldPersistTaps="handled"` is load-bearing rather than decorative. Without it
 * the first tap on Save only dismisses the keyboard, so the user presses a button that
 * visibly does nothing and then presses it again.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

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
import type { Player, PlayerDraftField } from '@/core/model';
import type { StatScanner } from '@/core/ocr';

import {
  PLAYER_FORM_FIELDS,
  SCAN_HINT,
  SCAN_LABEL,
  VIEWER_EYEBROW,
  submitLabel,
  type PlayerFormMode,
  type PlayerFormUiState,
  type StatScanUiState,
} from './playerFormUiState';
import { usePlayerForm } from './usePlayerForm';

export interface PlayerFormScreenProps {
  mode: PlayerFormMode;
  /**
   * Reopens the "who are you" list. Supplied only in `viewer` mode, by `ViewerScreen` —
   * the form itself holds no opinion about identity (ADR-0022).
   */
  onChangeViewer?: () => void;
  /**
   * Where "fill from screenshot" reads from. Omitted everywhere in the app — the hook
   * defaults to the device's picker and ML Kit — and supplied by tests, which is what lets
   * a scan be exercised without an emulator or a photo library (ADR-0024).
   */
  scanner?: StatScanner;
}

export function PlayerFormScreen({ mode, onChangeViewer, scanner }: PlayerFormScreenProps) {
  const router = useRouter();

  const leave = useCallback(() => {
    // Same rule the detail screen's chevron follows: a deep link has no history behind it,
    // so `back()` would leave the app from a control labelled CANCEL.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const onSaved = useCallback(
    (player: Player) => {
      // A new player opens on their own page — the roster is a long list and the row just
      // added is at the bottom of it. An edit returns where it came from.
      if (mode.kind === 'create') {
        router.replace({ pathname: '/player/[id]', params: { id: player.id } });
        return;
      }
      leave();
    },
    [leave, mode.kind, router],
  );

  // Not `leave()`: the screen behind an edit is that player's detail page, and returning to
  // it after a delete lands on the not-found state for a row the user just removed.
  const onDeleted = useCallback(() => router.replace('/'), [router]);

  const { state, onEvent } = usePlayerForm({ mode, onSaved, onDeleted, scanner });

  const change = useCallback(
    (field: PlayerDraftField, value: string) => onEvent({ type: 'change', field, value }),
    [onEvent],
  );
  const submit = useCallback(() => onEvent({ type: 'submit' }), [onEvent]);
  const scan = useCallback(() => onEvent({ type: 'scan' }), [onEvent]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Remove this player?',
      'They are removed from this device only, and the ranking closes up behind them.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onEvent({ type: 'delete' }) },
      ],
    );
  }, [onEvent]);

  return (
    <ScreenScaffold applyBottomInset={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.backRow}>
          <ArenaButton
            label="Cancel"
            variant="secondary"
            onPress={leave}
            accessibilityLabel="Cancel and go back"
            testID="form-cancel"
          />

          {/*
            In the top row rather than beside Save, so it is reachable from every state this
            screen has — including the one where the chosen player has been deleted and there
            is no form to put a button under.
          */}
          {mode.kind === 'viewer' && onChangeViewer !== undefined ? (
            <ArenaButton
              label="Not you?"
              variant="secondary"
              onPress={onChangeViewer}
              accessibilityLabel="Choose a different player as your avatar"
              testID="form-change-viewer"
            />
          ) : null}
        </View>

        <FormBody
          state={state}
          onChange={change}
          onScan={scan}
          onSubmit={submit}
          onDelete={confirmDelete}
          onLeave={leave}
        />
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

interface FormBodyProps {
  state: PlayerFormUiState;
  onChange: (field: PlayerDraftField, value: string) => void;
  onScan: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  onLeave: () => void;
}

function FormBody({ state, onChange, onScan, onSubmit, onDelete, onLeave }: FormBodyProps) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centred} testID="form-loading">
          <ArenaText variant="bodySmall" tone="subtle">
            {'One moment…'}
          </ArenaText>
        </View>
      );

    case 'unavailable':
      return (
        <View style={styles.centred} testID="form-unavailable">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            Not yours to edit
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            {state.message}
          </ArenaText>
          <ArenaButton label="Back to the roster" variant="secondary" onPress={onLeave} />
        </View>
      );

    case 'ready':
      return (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          testID="player-form"
        >
          <View style={styles.titleBlock}>
            {/*
              Whose stats these are, above the name they belong to. The screen is reached
              from a control that says "update my stats", so the name on its own would leave
              the user with no way to notice the app has the wrong player as their avatar.
            */}
            {state.mode.kind === 'viewer' ? (
              <ArenaText variant="labelNano" tone="accent" style={styles.eyebrow}>
                {VIEWER_EYEBROW}
              </ArenaText>
            ) : null}

            <ArenaText variant="displaySmall" tone="primary" accessibilityRole="header">
              {state.title}
            </ArenaText>
          </View>

          {/*
            Above the fields rather than beside Save, because it fills them: a control that
            rewrites nine inputs belongs where the user can see what it changed, and one
            sitting at the bottom would have scrolled its own effect off the screen.
          */}
          <ScanBlock state={state.scan} onScan={onScan} />

          {state.message === null ? null : (
            <View style={styles.banner} testID="form-message">
              <ArenaText variant="bodySmall" tone="negative">
                {state.message}
              </ArenaText>
            </View>
          )}

          {PLAYER_FORM_FIELDS.map((spec, index) => (
            <FormField
              key={spec.field}
              label={spec.label}
              value={state.values[spec.field]}
              onChangeText={(next) => onChange(spec.field, next)}
              error={state.errors[spec.field] ?? null}
              hint={spec.hint}
              // `numeric` rather than `number-pad`: a stat is a whole number, and this is
              // the keyboard every Android device actually has.
              keyboardType={spec.numeric ? 'numeric' : 'default'}
              maxLength={spec.maxLength}
              numeric={spec.numeric}
              autoFocus={index === 0 && state.mode.kind === 'create'}
              placeholder={spec.numeric ? '0' : undefined}
              testID={`form-field-${spec.field}`}
            />
          ))}

          {/*
            Beside Save rather than up with the scan's own note, because it describes what
            *this button* is about to do — and because the user can still change the name or
            the code, which is what makes saying it beforehand worth anything (ADR-0031).
          */}
          {state.importNotice === null ? null : (
            <ArenaText
              variant="bodyCaption"
              tone={state.importNotice.writable ? 'accent' : 'negative'}
              testID="form-import-notice"
            >
              {state.importNotice.message}
            </ArenaText>
          )}

          <View style={styles.actions}>
            <ArenaButton
              label={submitLabel(state.mode, state.importNotice)}
              onPress={onSubmit}
              busy={state.isSaving}
              fill
              testID="form-submit"
            />
          </View>

          {state.mode.kind === 'edit' ? (
            <ArenaButton
              label="Remove player"
              variant="destructive"
              onPress={onDelete}
              accessibilityLabel="Remove this player from the roster"
              testID="form-delete"
            />
          ) : null}
        </ScrollView>
      );
  }
}

/**
 * The screenshot import (ADR-0024).
 *
 * The status line is a sentence, never a colour or a tick: a partial scan and a complete
 * one look identical in the form, so the only way the user learns that SPD was missed is
 * being told which fields still need typing.
 */
function ScanBlock({ state, onScan }: { state: StatScanUiState; onScan: () => void }) {
  return (
    <View style={styles.scan} testID="form-scan">
      <ArenaButton
        label={SCAN_LABEL}
        variant="secondary"
        onPress={onScan}
        busy={state.kind === 'scanning'}
        accessibilityLabel="Fill the form from a screenshot of the game"
        fill
        testID="form-scan-button"
      />

      {state.kind === 'applied' ? (
        <ArenaText variant="bodyCaption" tone="accent" testID="form-scan-note">
          {state.note}
        </ArenaText>
      ) : state.kind === 'failed' ? (
        <ArenaText variant="bodyCaption" tone="negative" testID="form-scan-error">
          {state.message}
        </ArenaText>
      ) : (
        <ArenaText variant="bodyCaption" tone="subtle">
          {SCAN_HINT}
        </ArenaText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scan: { gap: space[6] },
  backRow: {
    paddingHorizontal: layout.screenGutter,
    flexDirection: 'row',
    // Wraps rather than shrinks, like the roster's count row: at 200 % font scale two
    // buttons cannot share a line, and a squeezed button is a clipped label.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: space[40],
    gap: space[16],
  },
  titleBlock: { gap: space[4] },
  eyebrow: { textTransform: 'uppercase' },
  banner: {
    padding: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.negative,
    backgroundColor: color.decorative.fill,
  },
  actions: { flexDirection: 'row', gap: space[12], paddingTop: space[6] },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: space[12],
  },
});
