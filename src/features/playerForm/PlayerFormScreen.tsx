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

import {
  PLAYER_FORM_FIELDS,
  submitLabel,
  type PlayerFormMode,
  type PlayerFormUiState,
} from './playerFormUiState';
import { usePlayerForm } from './usePlayerForm';

export interface PlayerFormScreenProps {
  mode: PlayerFormMode;
}

export function PlayerFormScreen({ mode }: PlayerFormScreenProps) {
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

  const { state, onEvent } = usePlayerForm({ mode, onSaved, onDeleted });

  const change = useCallback(
    (field: PlayerDraftField, value: string) => onEvent({ type: 'change', field, value }),
    [onEvent],
  );
  const submit = useCallback(() => onEvent({ type: 'submit' }), [onEvent]);

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
        </View>

        <FormBody
          state={state}
          onChange={change}
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
  onSubmit: () => void;
  onDelete: () => void;
  onLeave: () => void;
}

function FormBody({ state, onChange, onSubmit, onDelete, onLeave }: FormBodyProps) {
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
          <ArenaText variant="displaySmall" tone="primary" accessibilityRole="header">
            {state.title}
          </ArenaText>

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

          <View style={styles.actions}>
            <ArenaButton
              label={submitLabel(state.mode)}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backRow: { paddingHorizontal: layout.screenGutter, alignItems: 'flex-start' },
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: space[40],
    gap: space[16],
  },
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
