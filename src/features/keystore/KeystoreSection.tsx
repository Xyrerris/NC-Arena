/**
 * The block on `/me` where the person imports their Nine Chronicles keystore and checks that a
 * passphrase opens it (ADR-0044, "Next: buying", step B). Nothing here buys.
 *
 * It is always offered, avatar or not: an opened keystore is a proof even when there is no avatar
 * to compare it with, and the result says when that comparison could not be made.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  FormField,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';

import {
  CLAIMED_DIFFERS_NOTE,
  IMPORT_BUTTON,
  IMPORT_HINT,
  IMPORT_LABEL,
  LIMIT_HINT,
  LIMIT_LABEL,
  LIMIT_REMOVE,
  LIMIT_SAVE,
  MODE_CANCEL,
  MODE_CONFIRM_ON,
  MODE_NOTE,
  MODE_OFF_LINE,
  MODE_ON_LINE,
  MODE_TURN_OFF,
  MODE_TURN_ON,
  MODE_WARNING,
  limitLine,
  PASSPHRASE_HINT,
  PASSPHRASE_LABEL,
  PROVING_NOTE,
  REMOVE_BUTTON,
  REMOVE_NOTE,
  SAVED_NOTE,
  SECTION_HINT,
  SECTION_TITLE,
  TEST_BUTTON,
  WRONG_NOTE,
  describeOpened,
  storedLine,
} from './keystoreUiState';
import { useKeystore } from './useKeystore';
import { usePurchaseLimit } from './usePurchaseLimit';

export interface KeystoreSectionProps {
  /** Whether this build can send. Defaults to the build's own switch; a test passes it. */
  liveBuilt?: boolean;
}

export function KeystoreSection({ liveBuilt }: KeystoreSectionProps = {}) {
  const keystore = useKeystore();
  const purchase = usePurchaseLimit(liveBuilt);
  const [confirmingMode, setConfirmingMode] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [text, setText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const save = (): void => {
    if (keystore.onImport(text)) {
      // The pasted text is on the device now, and no longer needs to sit in a text box.
      setText('');
      setJustSaved(true);
    }
  };
  const test = (): void => {
    const typed = passphrase;
    // Gone from the field the moment it is used: a passphrase is not left on screen.
    setPassphrase('');
    setJustSaved(false);
    keystore.onProve(typed);
  };
  const remove = (): void => {
    setPassphrase('');
    setJustSaved(false);
    keystore.onRemove();
  };

  const { proof } = keystore;
  return (
    <View style={styles.block} testID="keystore">
      <ArenaText variant="labelNano" tone="accent" style={styles.eyebrow}>
        {SECTION_TITLE}
      </ArenaText>
      <ArenaText variant="bodyCaption" tone="subtle">
        {SECTION_HINT}
      </ArenaText>

      {keystore.stored === null ? (
        <>
          <FormField
            label={IMPORT_LABEL}
            value={text}
            onChangeText={setText}
            error={keystore.importError}
            hint={IMPORT_HINT}
            multiline
            testID="keystore-text"
          />
          <ArenaButton
            label={IMPORT_BUTTON}
            variant="secondary"
            onPress={save}
            testID="keystore-save"
          />
          {keystore.removed ? (
            <ArenaText variant="bodyCaption" tone="subtle" testID="keystore-removed">
              {REMOVE_NOTE}
            </ArenaText>
          ) : null}
        </>
      ) : (
        <>
          <ArenaText variant="bodyMedium" testID="keystore-stored">
            {storedLine(keystore.stored.claimedAddress)}
          </ArenaText>
          {justSaved ? (
            <ArenaText variant="bodyCaption" tone="accent" testID="keystore-saved">
              {SAVED_NOTE}
            </ArenaText>
          ) : null}

          <FormField
            label={PASSPHRASE_LABEL}
            value={passphrase}
            onChangeText={setPassphrase}
            hint={PASSPHRASE_HINT}
            secret
            testID="keystore-passphrase"
          />
          <ArenaButton
            label={TEST_BUTTON}
            variant="secondary"
            busy={proof.kind === 'proving'}
            onPress={test}
            testID="keystore-test"
          />

          {proof.kind === 'proving' ? (
            <ArenaText
              variant="bodyCaption"
              tone="subtle"
              accessibilityLiveRegion="polite"
              testID="keystore-proving"
            >
              {PROVING_NOTE}
            </ArenaText>
          ) : null}
          {proof.kind === 'wrong' ? (
            <ArenaText
              variant="bodyCaption"
              tone="negative"
              accessibilityLiveRegion="polite"
              testID="keystore-wrong"
            >
              {WRONG_NOTE}
            </ArenaText>
          ) : null}
          {proof.kind === 'failed' ? (
            <ArenaText variant="bodyCaption" tone="negative" testID="keystore-failed">
              {proof.message}
            </ArenaText>
          ) : null}
          {proof.kind === 'opened' ? (
            <View style={styles.result}>
              <ArenaText
                variant="bodySmall"
                tone={proof.comparison.kind === 'differs' ? 'negative' : 'accent'}
                accessibilityLiveRegion="polite"
                testID="keystore-opened"
              >
                {describeOpened(proof.address, proof.comparison)}
              </ArenaText>
              {proof.claimedDiffers ? (
                <ArenaText variant="bodyCaption" tone="subtle" testID="keystore-claimed">
                  {CLAIMED_DIFFERS_NOTE}
                </ArenaText>
              ) : null}
            </View>
          ) : null}

          <ArenaButton
            label={REMOVE_BUTTON}
            variant="secondary"
            onPress={remove}
            testID="keystore-remove"
          />
        </>
      )}

      {purchase === null ? null : (
        <View style={styles.limit} testID="purchase-limit">
          <ArenaText variant="bodyMedium" testID="purchase-limit-line">
            {limitLine(purchase.limit)}
          </ArenaText>
          <FormField
            label={LIMIT_LABEL}
            value={limitText}
            onChangeText={setLimitText}
            error={purchase.error}
            hint={LIMIT_HINT}
            keyboardType="decimal-pad"
            numeric
            testID="purchase-limit-input"
          />
          <ArenaButton
            label={LIMIT_SAVE}
            variant="secondary"
            onPress={() => {
              if (purchase.onSave(limitText)) setLimitText('');
            }}
            testID="purchase-limit-save"
          />
          {purchase.limit === null ? null : (
            <ArenaButton
              label={LIMIT_REMOVE}
              variant="secondary"
              onPress={purchase.onRemove}
              testID="purchase-limit-remove"
            />
          )}
          {!purchase.liveBuilt ? (
            <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-mode">
              {MODE_NOTE}
            </ArenaText>
          ) : (
            <View style={styles.limit} testID="purchase-mode-block">
              <ArenaText
                variant="bodyMedium"
                tone={purchase.mode === 'live' ? 'negative' : 'body'}
                testID="purchase-mode"
              >
                {purchase.mode === 'live' ? MODE_ON_LINE : MODE_OFF_LINE}
              </ArenaText>
              {purchase.mode === 'live' ? (
                <ArenaButton
                  label={MODE_TURN_OFF}
                  variant="secondary"
                  onPress={() => purchase.onMode('dry-run')}
                  testID="purchase-mode-off"
                />
              ) : confirmingMode ? (
                <View style={styles.limit} testID="purchase-mode-confirm">
                  <ArenaText variant="bodySmall" tone="negative">
                    {MODE_WARNING}
                  </ArenaText>
                  <ArenaButton
                    label={MODE_CONFIRM_ON}
                    onPress={() => {
                      setConfirmingMode(false);
                      purchase.onMode('live');
                    }}
                    testID="purchase-mode-yes"
                  />
                  <ArenaButton
                    label={MODE_CANCEL}
                    variant="secondary"
                    onPress={() => setConfirmingMode(false)}
                    testID="purchase-mode-cancel"
                  />
                </View>
              ) : (
                <ArenaButton
                  label={MODE_TURN_ON}
                  variant="secondary"
                  onPress={() => setConfirmingMode(true)}
                  testID="purchase-mode-on"
                />
              )}
            </View>
          )}
        </View>
      )}
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
  result: { gap: space[4] },
  limit: { gap: space[8], marginTop: space[8] },
});
