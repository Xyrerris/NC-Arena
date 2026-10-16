/**
 * The "try buying" block of the purchase card (ADR-0044, step D): a passphrase field and a button
 * that runs the purchase as a dry run. Whatever it answers, it says again that nothing is sent.
 *
 * The passphrase lives in this component's state only for as long as it takes to type, and is
 * emptied the moment the button is pressed — it is handed to the attempt as an argument and not
 * kept anywhere.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MarketListing } from '@/core/common';
import type { Planet } from '@/core/model';
import { ArenaButton, ArenaText, FormField, space } from '@/core/design-system';

import {
  DRY_RUN_NOTE,
  NO_KEYSTORE_NOTE,
  PASSPHRASE_HINT,
  PASSPHRASE_LABEL,
  TRY_LABEL,
  describeAttempt,
} from './purchaseAttemptState';
import type { PurchaseCheck } from './purchaseCardState';
import { usePurchaseAttempt } from './usePurchaseAttempt';

export interface PurchaseTryProps {
  planet: Planet;
  shown: MarketListing;
  check: PurchaseCheck;
}

export function PurchaseTry({ planet, shown, check }: PurchaseTryProps) {
  const attempt = usePurchaseAttempt(planet, shown, check);
  const [passphrase, setPassphrase] = useState('');
  const result = describeAttempt(attempt.state);

  if (!attempt.hasKeystore) {
    return (
      <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-no-keystore">
        {NO_KEYSTORE_NOTE}
      </ArenaText>
    );
  }

  return (
    <View style={styles.block} testID="purchase-try">
      <FormField
        label={PASSPHRASE_LABEL}
        value={passphrase}
        onChangeText={setPassphrase}
        hint={PASSPHRASE_HINT}
        secret
        testID="purchase-passphrase"
      />
      <ArenaButton
        label={TRY_LABEL}
        variant="secondary"
        busy={attempt.state.kind === 'working'}
        onPress={() => {
          const typed = passphrase;
          setPassphrase('');
          attempt.onTry(typed);
        }}
        testID="purchase-try-button"
      />
      {result.text === null ? null : (
        <ArenaText
          variant="bodySmall"
          tone={result.tone}
          accessibilityLiveRegion="polite"
          testID={`purchase-attempt-${attempt.state.kind}`}
        >
          {result.text}
        </ArenaText>
      )}
      <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-dry-note">
        {DRY_RUN_NOTE}
      </ArenaText>
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: space[8] } });
