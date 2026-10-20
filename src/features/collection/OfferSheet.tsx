/**
 * An offer from the offers view, opened to be reviewed: the same purchase card the market sheet
 * uses, over the one listing that is the offer.
 *
 * A counted piece can take more than one lot to reach the count. Each lot is its own purchase and
 * is reviewed on its own card, one at a time, so what is bought is always what the card says. The
 * card is `PurchaseCard`'s: it re-reads the offer, shows the price and the balance, and buys only
 * after the passphrase and the confirmation.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Offer } from '@/core/collection';
import type { MarketListing } from '@/core/common';
import type { Planet } from '@/core/model';
import { ArenaButton, ArenaText, color, layout, radius, space } from '@/core/design-system';

import { toListingUi, type MarketPiece } from './marketUiState';
import { PurchaseCard } from './PurchaseCard';
import { collectionStrings as words } from './strings';

export interface OfferSheetProps {
  planet: Planet;
  offer: Offer;
  piece: MarketPiece;
  onClose: () => void;
}

export function OfferSheet({ planet, offer, piece, onClose }: OfferSheetProps) {
  const single = offer.picks.length === 1;
  const [reviewing, setReviewing] = useState<MarketListing | null>(
    single ? (offer.picks[0] ?? null) : null,
  );
  // The card says how many the collections ask for in all, which is the offer's, not one lot's.
  const counted: MarketPiece = { ...piece, count: offer.need };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          importantForAccessibility="no"
          accessible={false}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="offer-sheet">
          <View style={styles.header}>
            <ArenaText
              variant="titleMedium"
              tone="primary"
              accessibilityRole="header"
              style={styles.title}
            >
              {words.offersSheetTitle}
            </ArenaText>
            <ArenaButton
              label={words.offersClose}
              accessibilityLabel={words.offersCloseA11y}
              variant="secondary"
              onPress={onClose}
              testID="offer-close"
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {reviewing !== null ? (
              <PurchaseCard
                key={reviewing.productId}
                planet={planet}
                piece={counted}
                listing={reviewing}
                onBack={single ? onClose : () => setReviewing(null)}
              />
            ) : (
              <>
                <ArenaText variant="bodyMedium" tone="primary">
                  {piece.label}
                </ArenaText>
                <ArenaText variant="bodySmall" tone="body" testID="offer-picks-title">
                  {words.offersPicksTitle}
                </ArenaText>
                {offer.picks.map((listing) => {
                  const ui = toListingUi(listing);
                  return (
                    <Pressable
                      key={ui.key}
                      style={styles.pick}
                      accessibilityRole="button"
                      accessibilityLabel={words.purchaseReviewA11y(ui.a11y)}
                      onPress={() => setReviewing(listing)}
                      testID={`offer-pick-${ui.key}`}
                    >
                      <ArenaText variant="titleMedium" tone="primary">
                        {ui.price}
                      </ArenaText>
                      <ArenaText variant="bodyCaption" tone="subtle">
                        {ui.detail}
                      </ArenaText>
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // No dimming scrim, as the market sheet: the design system has no overlay colour.
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '85%',
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
  pick: {
    paddingVertical: space[8],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    gap: space[2],
  },
});
