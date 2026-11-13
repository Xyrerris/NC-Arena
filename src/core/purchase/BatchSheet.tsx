/**
 * The selection of offers, bought (ADR-0044, the cart, step 2b): a sheet that lists exactly what
 * will be bought and for how much, takes the passphrase once, and shows each piece's fate as the
 * batch runs.
 *
 * **In the default mode** it is a passphrase field and a button that runs the whole batch as dry
 * runs: every piece checked and signed, nothing sent. **In live mode** — which the person has to have
 * turned on, and which a build without sending cannot reach — pressing the button does not pay: it
 * opens a confirmation that says the total, the number of pieces, that each payment cannot be undone
 * and that the batch stops at the first thing that goes wrong, and asks for the passphrase there.
 * Only its own button, carrying the total, pays.
 *
 * The passphrase lives in this component's state for as long as it takes to type and is emptied the
 * moment it is used. While the batch runs, and after it has run, no button offers to run it again.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Planet } from '@/core/model';
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
  batchLines,
  describeResult,
  describeStep,
  limitLine,
  totalLine,
  type BatchPlan,
} from './batchState';
import { formatNcg } from './formatNcg';
import {
  CANCEL_LABEL,
  DRY_RUN_NOTE,
  LIVE_NOTE,
  NO_KEYSTORE_NOTE,
  PASSPHRASE_HINT,
  PASSPHRASE_LABEL,
  WORKING_NOTE,
  WRONG_NOTE,
} from './purchaseAttemptState';
import { purchaseStrings as words } from './strings';
import { useBatchPurchase, type BatchRowState } from './useBatchPurchase';

export interface BatchSheetProps {
  planet: Planet;
  plan: BatchPlan;
  onClose: () => void;
  /** A piece was confirmed by the chain: its listing is gone from the market. */
  onBought?: (productId: string) => void;
}

const rowText = (
  row: BatchRowState | undefined,
): { text: string; tone: 'subtle' | 'accent' | 'negative' } => {
  switch (row?.kind) {
    case 'working':
      return { text: words.batchRowWorking, tone: 'accent' };
    case 'done':
      return describeStep(row.outcome);
    case 'not-attempted':
      return { text: words.batchRowNotAttempted, tone: 'subtle' };
    default:
      return { text: words.batchRowWaiting, tone: 'subtle' };
  }
};

export function BatchSheet({ planet, plan, onClose, onBought }: BatchSheetProps) {
  const batch = useBatchPurchase(planet, plan.items, onBought);
  const [passphrase, setPassphrase] = useState('');
  const [confirming, setConfirming] = useState(false);
  const live = batch.mode === 'live';
  const total = formatNcg(plan.total);
  const { state } = batch;

  const rows = state.kind === 'running' || state.kind === 'finished' ? state.rows : null;
  const busy = state.kind === 'preparing' || state.kind === 'running';
  const canRun = plan.items.length > 0 && !busy && state.kind !== 'finished';

  const use = (): void => {
    const typed = passphrase;
    setPassphrase('');
    setConfirming(false);
    batch.onRun(typed);
  };
  const passphraseField = (
    <FormField
      label={PASSPHRASE_LABEL}
      value={passphrase}
      onChangeText={setPassphrase}
      hint={PASSPHRASE_HINT}
      secret
      testID="batch-passphrase"
    />
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          importantForAccessibility="no"
          accessible={false}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="batch-sheet">
          <View style={styles.header}>
            <ArenaText
              variant="titleMedium"
              tone="primary"
              accessibilityRole="header"
              style={styles.title}
            >
              {words.batchTitle}
            </ArenaText>
            <ArenaButton
              label={words.batchClose}
              accessibilityLabel={words.batchCloseA11y}
              variant="secondary"
              onPress={onClose}
              testID="batch-close"
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {plan.items.length === 0 ? (
              <ArenaText variant="bodySmall" tone="body" testID="batch-nothing">
                {words.batchNothing}
              </ArenaText>
            ) : (
              <>
                <ArenaText variant="titleMedium" tone="primary" testID="batch-total">
                  {totalLine(plan)}
                </ArenaText>
                <ArenaText
                  variant="bodySmall"
                  tone={batch.batchLimit === null ? 'negative' : 'subtle'}
                  testID="batch-limit"
                >
                  {limitLine(batch.batchLimit)}
                </ArenaText>
                <ArenaText variant="bodyCaption" tone="subtle">
                  {words.batchOrder}
                </ArenaText>
                {batchLines(plan).map((line, index) => {
                  const shown = rowText(rows?.[index]);
                  return (
                    <View key={line.key} style={styles.line} testID={`batch-line-${line.key}`}>
                      <ArenaText variant="bodyMedium" tone="primary">
                        {line.text}
                      </ArenaText>
                      {rows === null ? null : (
                        <ArenaText
                          variant="bodyCaption"
                          tone={shown.tone}
                          accessibilityLiveRegion="polite"
                          testID={`batch-row-${line.key}`}
                        >
                          {shown.text}
                        </ArenaText>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {plan.excluded === 0 ? null : (
              <ArenaText variant="bodyCaption" tone="subtle" testID="batch-excluded">
                {words.batchExcluded(plan.excluded)}
              </ArenaText>
            )}

            {!batch.hasKeystore && plan.items.length > 0 ? (
              <ArenaText variant="bodyCaption" tone="subtle" testID="batch-no-keystore">
                {NO_KEYSTORE_NOTE}
              </ArenaText>
            ) : canRun && batch.hasKeystore ? (
              !live ? (
                <View style={styles.block}>
                  {passphraseField}
                  <ArenaButton
                    label={words.batchTry}
                    accessibilityLabel={words.batchTryA11y}
                    variant="secondary"
                    onPress={use}
                    testID="batch-try-button"
                  />
                </View>
              ) : confirming ? (
                <View style={styles.block} testID="batch-confirm">
                  <ArenaText variant="bodySmall" tone="negative" testID="batch-confirm-warning">
                    {words.batchWarning(plan.items.length, total)}
                  </ArenaText>
                  {passphraseField}
                  <ArenaButton
                    label={words.batchConfirm(total)}
                    onPress={use}
                    testID="batch-confirm-button"
                  />
                  <ArenaButton
                    label={CANCEL_LABEL}
                    variant="secondary"
                    onPress={() => {
                      setPassphrase('');
                      setConfirming(false);
                    }}
                    testID="batch-confirm-cancel"
                  />
                </View>
              ) : (
                <ArenaButton
                  label={words.batchBuy(total)}
                  accessibilityLabel={words.batchBuyA11y}
                  onPress={() => setConfirming(true)}
                  testID="batch-buy-button"
                />
              )
            ) : null}

            {state.kind === 'preparing' ? (
              <ArenaText variant="bodySmall" tone="subtle" testID="batch-preparing">
                {WORKING_NOTE}
              </ArenaText>
            ) : null}
            {state.kind === 'wrong' ? (
              <ArenaText variant="bodySmall" tone="negative" testID="batch-wrong">
                {WRONG_NOTE}
              </ArenaText>
            ) : null}
            {state.kind === 'problem' ? (
              <ArenaText variant="bodySmall" tone="negative" testID="batch-problem">
                {state.message}
              </ArenaText>
            ) : null}
            {state.kind === 'refused' ? (
              <ArenaText variant="bodySmall" tone="negative" testID="batch-refused">
                {state.refusal.message}
              </ArenaText>
            ) : null}
            {state.kind === 'finished' ? (
              <ArenaText
                variant="bodyMedium"
                tone={describeResult(state.result, !live).tone}
                accessibilityLiveRegion="polite"
                testID="batch-result"
              >
                {describeResult(state.result, !live).text}
              </ArenaText>
            ) : null}

            <ArenaText variant="bodyCaption" tone="subtle" testID="batch-mode-note">
              {live ? LIVE_NOTE : DRY_RUN_NOTE}
            </ArenaText>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // No dimming scrim, as the other sheets: the design system has no overlay colour.
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '90%',
    backgroundColor: color.raised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.decorative.hairline,
    paddingTop: space[16],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
    paddingHorizontal: layout.screenGutter,
  },
  title: { flex: 1 },
  body: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: space[12],
    paddingBottom: space[40],
    gap: space[12],
  },
  block: { gap: space[8] },
  line: {
    paddingVertical: space[8],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    gap: space[2],
  },
});
