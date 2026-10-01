/**
 * The block on `/me` where the user says which Nine Chronicles avatar they play (ADR-0044).
 *
 * Like the roster backup controls it carries no scaffold: `/me` renders it at the end of the
 * viewer's form. It renders nothing while nobody is "you", because the avatar belongs to the
 * viewer and there is nobody to attach it to.
 */

import { StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  FormField,
  SortChip,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';

import {
  ADDRESS_HINT,
  ADDRESS_LABEL,
  ADDRESS_PLACEHOLDER,
  PLANET_CHOICES,
  PLANET_LABEL,
  SAVED_NOTE,
  SAVE_LABEL,
  SECTION_HINT,
  SECTION_TITLE,
  describeAvatar,
} from './viewerAvatarUiState';
import { useViewerAvatarForm } from './useViewerAvatarForm';

export function ViewerAvatarSection() {
  const form = useViewerAvatarForm();
  if (!form.hasViewer) return null;

  return (
    <View style={styles.block} testID="viewer-avatar">
      <ArenaText variant="labelNano" tone="accent" style={styles.eyebrow}>
        {SECTION_TITLE}
      </ArenaText>
      <ArenaText variant="bodyCaption" tone="subtle">
        {SECTION_HINT}
      </ArenaText>

      {form.avatar !== null ? (
        <ArenaText variant="bodyMedium" testID="viewer-avatar-current">
          {describeAvatar(form.avatar)}
        </ArenaText>
      ) : null}

      <View style={styles.planets}>
        {PLANET_CHOICES.map((planet) => (
          <SortChip
            key={planet}
            label={PLANET_LABEL[planet]}
            selected={form.planet === planet}
            onPress={() => form.onPlanet(planet)}
            testID={`viewer-avatar-planet-${planet}`}
          />
        ))}
      </View>

      <FormField
        label={ADDRESS_LABEL}
        value={form.address}
        onChangeText={form.onAddress}
        error={form.addressError}
        hint={ADDRESS_HINT}
        placeholder={ADDRESS_PLACEHOLDER}
        testID="viewer-avatar-address"
      />

      <ArenaButton
        label={SAVE_LABEL}
        variant="secondary"
        onPress={form.onSave}
        testID="viewer-avatar-save"
      />

      {form.state.kind === 'saved' ? (
        <ArenaText variant="bodyCaption" tone="accent" testID="viewer-avatar-note">
          {SAVED_NOTE}
        </ArenaText>
      ) : form.state.kind === 'failed' ? (
        <ArenaText variant="bodyCaption" tone="negative" testID="viewer-avatar-error">
          {form.state.message}
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
  // Wraps rather than shrinks, like every other row of controls: at 200 % font scale three
  // labels cannot share a line, and a squeezed chip is a clipped label.
  planets: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
