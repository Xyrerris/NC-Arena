/**
 * The "try buying" block of the purchase card (ADR-0044, step D).
 *
 * **In the default mode** it is a passphrase field and a button that runs the purchase as a dry run,
 * and it says again that nothing is sent. **In live mode** — which the person has to have turned on,
 * and which a build without sending cannot reach — pressing the button does not pay: it opens a
 * confirmation that says what it will cost and that it cannot be undone, and asks for the passphrase
 * there, at the moment of paying. Only its own button, carrying the price, pays.
 *
 * The passphrase lives in this component's state only for as long as it takes to type, and is
 * emptied the moment it is used — it is handed to the attempt as an argument and not kept anywhere.
 * After a purchase has gone through, or while one is in flight, no button offers to buy again.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MarketListing } from '@/core/common';
import type { Planet } from '@/core/model';
import { ArenaButton, ArenaText, FormField, space } from '@/core/design-system';

import { formatNcg } from './marketUiState';
import {
  BUY_LABEL,
  CANCEL_LABEL,
  CONFIRM_LABEL,
  CONFIRM_WARNING,
  DRY_RUN_NOTE,
  LIVE_NOTE,
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
  /** What the offer is called, for the confirmation. */
  label: string;
  check: PurchaseCheck;
}

export function PurchaseTry({ planet, shown, label, check }: PurchaseTryProps) {
  const attempt = usePurchaseAttempt(planet, shown, check);
  const [passphrase, setPassphrase] = useState('');
  const [confirming, setConfirming] = useState(false);
  const result = describeAttempt(attempt.state);
  const live = attempt.mode === 'live';
  const price = formatNcg(shown.price);

  if (!attempt.hasKeystore) {
    return (
      <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-no-keystore">
        {NO_KEYSTORE_NOTE}
      </ArenaText>
    );
  }

  const inFlight = attempt.state.kind === 'working' || attempt.state.kind === 'waiting';
  const bought = attempt.state.kind === 'settled' && attempt.state.outcome.kind === 'confirmed';
  const use = (): void => {
    const typed = passphrase;
    setPassphrase('');
    setConfirming(false);
    attempt.onTry(typed);
  };

  const passphraseField = (
    <FormField
      label={PASSPHRASE_LABEL}
      value={passphrase}
      onChangeText={setPassphrase}
      hint={PASSPHRASE_HINT}
      secret
      testID="purchase-passphrase"
    />
  );

  return (
    <View style={styles.block} testID="purchase-try">
      {!live ? (
        <>
          {passphraseField}
          <ArenaButton
            label={TRY_LABEL}
            variant="secondary"
            busy={attempt.state.kind === 'working'}
            onPress={use}
            testID="purchase-try-button"
          />
        </>
      ) : bought || inFlight ? null : confirming ? (
        <View style={styles.block} testID="purchase-confirm">
          <ArenaText variant="bodySmall" tone="negative" testID="purchase-confirm-warning">
            {CONFIRM_WARNING(label, price)}
          </ArenaText>
          {passphraseField}
          <ArenaButton
            label={CONFIRM_LABEL(price)}
            onPress={use}
            testID="purchase-confirm-button"
          />
          <ArenaButton
            label={CANCEL_LABEL}
            variant="secondary"
            onPress={() => {
              setPassphrase('');
              setConfirming(false);
            }}
            testID="purchase-confirm-cancel"
          />
        </View>
      ) : (
        <ArenaButton
          label={BUY_LABEL(price)}
          onPress={() => setConfirming(true)}
          testID="purchase-buy-button"
        />
      )}

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
        {live ? LIVE_NOTE : DRY_RUN_NOTE}
      </ArenaText>
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: space[8] } });
