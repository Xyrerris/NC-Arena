/**
 * "This roster is offline — connect it", for the "You" screen (ADR-0038).
 *
 * The other half of skipping setup: a skip that could not be undone would make "Continue
 * offline" a trap for anyone who pressed it because the server was down that day. It renders
 * nothing once the device is paired, or in a build with no backend at all.
 *
 * Navigation is the route's: `onConnect` opens the setup screen wherever the app keeps it.
 */

import { StyleSheet, View } from 'react-native';

import { useCanLinkAccount } from '@/core/data';
import { ArenaButton, ArenaText, color, radius, space } from '@/core/design-system';

import { CONNECT_LABEL, OFFLINE_NOTE, OFFLINE_TITLE } from './accountSetupUiState';

export interface AccountConnectPromptProps {
  onConnect: () => void;
}

export function AccountConnectPrompt({ onConnect }: AccountConnectPromptProps) {
  const canLink = useCanLinkAccount();
  if (!canLink) return null;

  return (
    <View style={styles.box} testID="account-connect">
      <ArenaText variant="labelMicro" tone="muted">
        {OFFLINE_TITLE.toUpperCase()}
      </ArenaText>
      <ArenaText variant="bodySmall" tone="subtle">
        {OFFLINE_NOTE}
      </ArenaText>
      <ArenaButton
        label={CONNECT_LABEL}
        variant="secondary"
        onPress={onConnect}
        fill
        testID="account-connect-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.decorative.divider,
    backgroundColor: color.decorative.fill,
    gap: space[8],
  },
});
