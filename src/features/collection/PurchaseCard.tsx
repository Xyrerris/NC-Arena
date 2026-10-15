/**
 * The card a listing opens before anyone could buy it (ADR-0044, "Next: buying", step A).
 *
 * It re-reads the offer, shows the price, the balance and what the buy would leave, and says plainly
 * that nothing is bought: there is no button to press because there is nothing behind one yet. The
 * view-model (`purchaseCardState`) decides every sentence; this only lays them out.
 */

import { StyleSheet, View } from 'react-native';

import type { MarketListing } from '@/core/common';
import type { Planet } from '@/core/model';
import { ArenaButton, ArenaText, space } from '@/core/design-system';

import { shortSeller, type MarketPiece } from './marketUiState';
import { toPurchaseCardUi } from './purchaseCardState';
import { collectionStrings as words } from './strings';
import { usePurchaseCheck } from './usePurchaseCheck';

export interface PurchaseCardProps {
  planet: Planet;
  piece: MarketPiece;
  listing: MarketListing;
  onBack: () => void;
}

export function PurchaseCard({ planet, piece, listing, onBack }: PurchaseCardProps) {
  const check = usePurchaseCheck(planet, listing);
  const ui = toPurchaseCardUi(check, piece);

  return (
    <View style={styles.card} testID="purchase-card">
      <ArenaText variant="titleMedium" tone="primary" accessibilityRole="header">
        {words.purchaseTitle}
      </ArenaText>
      <ArenaText variant="bodyMedium" tone="body">
        {piece.label}
      </ArenaText>

      {ui.message === null ? null : (
        <ArenaText
          variant="bodySmall"
          tone={ui.status === 'checking' ? 'accent' : 'negative'}
          accessibilityLiveRegion="polite"
          testID={`purchase-${ui.status}`}
        >
          {ui.message}
        </ArenaText>
      )}

      {ui.offer === null ? null : (
        <View style={styles.block}>
          <ArenaText variant="titleMedium" tone="primary" testID="purchase-price">
            {ui.offer.price}
          </ArenaText>
          {ui.offer.detail === null ? null : (
            <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-lot">
              {ui.offer.detail}
            </ArenaText>
          )}
          <ArenaText variant="bodyCaption" tone="subtle">
            {words.listingSeller(shortSeller(listing.sellerAvatarAddress))}
          </ArenaText>
          {ui.offer.countNote === null ? null : (
            <ArenaText variant="bodySmall" tone="body" testID="purchase-count">
              {ui.offer.countNote}
            </ArenaText>
          )}
          <ArenaText variant="bodySmall" tone="body" testID="purchase-sentence">
            {ui.offer.sentence}
          </ArenaText>
        </View>
      )}

      {ui.balanceLine === null ? null : (
        <View style={styles.block}>
          <ArenaText variant="bodySmall" tone="body" testID="purchase-balance">
            {ui.balanceLine}
          </ArenaText>
          {ui.afterLine === null ? null : (
            <ArenaText
              variant="bodySmall"
              tone={ui.enough === 'short' ? 'negative' : 'subtle'}
              testID="purchase-after"
            >
              {ui.afterLine}
            </ArenaText>
          )}
        </View>
      )}

      <ArenaText variant="bodyCaption" tone="subtle" testID="purchase-not-built">
        {words.purchaseNotBuilt}
      </ArenaText>
      <ArenaButton
        label={words.purchaseBack}
        accessibilityLabel={words.purchaseBackA11y}
        variant="secondary"
        onPress={onBack}
        testID="purchase-back"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[8] },
  block: { gap: space[2] },
});
