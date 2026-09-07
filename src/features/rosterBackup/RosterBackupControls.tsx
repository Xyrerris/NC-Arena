/**
 * Export and import, as a pair of controls rather than a screen (ADR-0033).
 *
 * It has no `ScreenScaffold` of its own on purpose: `/me` is where it lives, and `/me`
 * already has two faces — the "who are you" list and the viewer's own form. This is a block
 * either of them can put at the end of itself, which is what "no new screen" has to mean if
 * the controls are to be reachable in **both** states. The state that matters most is the
 * one where the roster is empty: a phone that has just been wiped has no avatar to show, and
 * an import reachable only from the form would be unreachable exactly when it is needed.
 *
 * Import asks first. It is a replace, and what it replaces is everything the user has typed,
 * so it goes through the same `Alert` confirmation the delete control does.
 */

import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { BackupFile } from '@/core/data';
import { ArenaButton, ArenaText, color, layout, radius, space } from '@/core/design-system';

import {
  EXPORT_LABEL,
  IMPORT_CONFIRM_BODY,
  IMPORT_CONFIRM_KEEP,
  IMPORT_CONFIRM_REPLACE,
  IMPORT_CONFIRM_TITLE,
  IMPORT_LABEL,
  SECTION_TITLE,
} from './rosterBackupUiState';
import { useRosterBackup } from './useRosterBackup';

export interface RosterBackupControlsProps {
  /**
   * Where the file goes and comes from. Omitted everywhere in the app — the hook defaults to
   * the device's share sheet and file picker — and supplied by tests, which is what lets a
   * whole round trip be exercised without an emulator (ADR-0033).
   */
  file?: BackupFile;
}

export function RosterBackupControls({ file }: RosterBackupControlsProps) {
  const { state, stakes, canExport, onEvent } = useRosterBackup({ file });

  const exportRoster = useCallback(() => onEvent({ type: 'export' }), [onEvent]);

  const confirmImport = useCallback(() => {
    Alert.alert(IMPORT_CONFIRM_TITLE, IMPORT_CONFIRM_BODY, [
      { text: IMPORT_CONFIRM_KEEP, style: 'cancel' },
      {
        text: IMPORT_CONFIRM_REPLACE,
        style: 'destructive',
        onPress: () => onEvent({ type: 'import' }),
      },
    ]);
  }, [onEvent]);

  const busy = state.kind === 'busy';

  return (
    <View style={styles.block} testID="roster-backup">
      <ArenaText variant="labelNano" tone="accent" style={styles.eyebrow}>
        {SECTION_TITLE}
      </ArenaText>

      <ArenaText variant="bodyCaption" tone="subtle" testID="roster-backup-stakes">
        {stakes}
      </ArenaText>

      <View style={styles.actions}>
        <ArenaButton
          label={EXPORT_LABEL}
          variant="secondary"
          onPress={exportRoster}
          busy={busy}
          // Nothing to write, so nothing to press. The sentence above already says why —
          // a disabled control with no explanation beside it is the failure this avoids.
          disabled={!canExport}
          accessibilityLabel="Export the roster to a file you can keep"
          testID="roster-backup-export"
        />
        <ArenaButton
          label={IMPORT_LABEL}
          variant="secondary"
          onPress={confirmImport}
          busy={busy}
          accessibilityLabel="Replace this roster with one from a file"
          testID="roster-backup-import"
        />
      </View>

      {state.kind === 'done' ? (
        <ArenaText variant="bodyCaption" tone="accent" testID="roster-backup-note">
          {state.message}
        </ArenaText>
      ) : state.kind === 'failed' ? (
        <ArenaText variant="bodyCaption" tone="negative" testID="roster-backup-error">
          {state.message}
        </ArenaText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: layout.screenGutter,
    marginTop: space[16],
    padding: space[16],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.decorative.divider,
    backgroundColor: color.decorative.fill,
    gap: space[8],
  },
  eyebrow: { textTransform: 'uppercase' },
  actions: {
    flexDirection: 'row',
    // Wraps rather than shrinks, like every other two-button row in the app: at 200 % font
    // scale two labels cannot share a line, and a squeezed button is a clipped label.
    flexWrap: 'wrap',
    gap: space[8],
    paddingTop: space[4],
  },
});
