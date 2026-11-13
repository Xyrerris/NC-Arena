/**
 * What is on sale for the pieces of one collection (ADR-0044, "Next: buying").
 *
 * A bottom sheet over the collections list: the pieces of the collection as chips with how many
 * listings each has, and under them the chosen piece's cheapest offers. A collection of one piece
 * has one chip's worth of choice, so it is shown as a heading and not as a control. Nothing here
 * buys: a row is a price, a combat point and a seller, and the listing already carries what a
 * purchase will need to find it again.
 *
 * The scan is a count while it runs, never a bar: the market service does not say how many
 * listings an item has, and a bar would have to guess. Prices are what is **asked**, which the
 * sheet says every time it shows them.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Collection, EquipmentCatalog, OtherItemCatalog } from '@/core/collection';
import { statFormatter, timeSince, type MarketListing } from '@/core/common';
import type { Planet } from '@/core/model';
import {
  ArenaButton,
  ArenaText,
  SortChip,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';

import {
  MAX_SHOWN_LISTINGS,
  cheapestLabel,
  marketPieces,
  toListingUi,
  type MarketPiece,
} from './marketUiState';
import { PurchaseCard } from './PurchaseCard';
import { SkillMark } from './SkillMark';
import { collectionStrings as words } from './strings';
import { useMarketPieces, type PieceState } from './useMarketPieces';

export interface MarketSheetProps {
  collection: Collection;
  catalog: EquipmentCatalog;
  /** Costumes, materials and food. Left out, only equipment has a market to look in. */
  others?: OtherItemCatalog;
  planet: Planet;
  onClose: () => void;
}

/** The count on a piece's chip, or the reason there is none yet. */
const badge = (state: PieceState | undefined): string => {
  switch (state?.kind) {
    case 'ready':
      return ` · ${statFormatter.exact(state.listings.length)}`;
    case 'scanning':
      return ' · …';
    case 'failed':
      return ' · !';
    case 'not-sold':
      return ' · –';
    default:
      return '';
  }
};

export function MarketSheet({ collection, catalog, others, planet, onClose }: MarketSheetProps) {
  const offered = useMemo(
    () => marketPieces(collection, catalog, others),
    [collection, catalog, others],
  );
  const market = useMarketPieces(planet, offered.pieces);
  const [selectedKey, setSelectedKey] = useState<string | null>(offered.pieces[0]?.key ?? null);
  // The moment the sheet opened, for "read N ago". A sheet lives seconds, not minutes, so the
  // label is not ticked the way the list's is; a scan that ends later reads "just now".
  const [now] = useState(() => Date.now());

  const selected = offered.pieces.find((piece) => piece.key === selectedKey) ?? null;
  const state = selected === null ? undefined : market.states[selected.key];

  // The listing whose purchase card is open, if any. Held here: the card replaces the list in the
  // same sheet, and choosing another piece or going back closes it.
  const [reviewing, setReviewing] = useState<MarketListing | null>(null);

  const choose = (piece: MarketPiece): void => {
    setSelectedKey(piece.key);
    market.select(piece.key);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          importantForAccessibility="no"
          accessible={false}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="market-sheet">
          <View style={styles.header}>
            <ArenaText
              variant="titleMedium"
              tone="primary"
              accessibilityRole="header"
              style={styles.title}
            >
              {words.marketTitle(collection.id)}
            </ArenaText>
            <ArenaButton
              label={words.marketClose}
              accessibilityLabel={words.marketCloseA11y}
              variant="secondary"
              onPress={onClose}
              testID="market-close"
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {reviewing !== null && selected !== null ? (
              <PurchaseCard
                key={reviewing.productId}
                planet={planet}
                piece={selected}
                listing={reviewing}
                onBack={() => setReviewing(null)}
              />
            ) : (
              <>
                {offered.pieces.length > 1 ? (
                  <View
                    style={styles.chips}
                    accessibilityLabel={words.marketPiecesA11y}
                    testID="market-pieces"
                  >
                    {offered.pieces.map((piece, index) => (
                      <SortChip
                        key={piece.key}
                        label={`${piece.needsSkill ? `${piece.label} · skill` : piece.label}${badge(market.states[piece.key])}`}
                        selected={piece.key === selectedKey}
                        onPress={() => choose(piece)}
                        testID={`market-piece-${index}`}
                      />
                    ))}
                  </View>
                ) : null}

                {selected === null ? null : (
                  <View style={styles.pieceHeader}>
                    <SkillMark shown={selected.needsSkill} />
                    <ArenaText variant="titleMedium" tone="primary" style={styles.pieceName}>
                      {selected.label}
                    </ArenaText>
                    {selected.count > 1 ? (
                      <ArenaText variant="bodySmall" tone="accent" testID="market-needs">
                        {words.marketNeeds(selected.count)}
                      </ArenaText>
                    ) : null}
                  </View>
                )}

                <PieceBody
                  piece={selected}
                  state={state}
                  now={now}
                  onRetry={() => selected !== null && market.retry(selected.key)}
                  onReview={setReviewing}
                />

                {offered.unlisted === 0 ? null : (
                  <ArenaText variant="bodyCaption" tone="subtle" testID="market-unlisted">
                    {words.marketUnlisted(offered.unlisted)}
                  </ArenaText>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PieceBody({
  piece,
  state,
  now,
  onRetry,
  onReview,
}: {
  piece: MarketPiece | null;
  now: number;
  state: PieceState | undefined;
  onRetry: () => void;
  onReview: (listing: MarketListing) => void;
}) {
  if (piece === null || state === undefined) return null;

  switch (state.kind) {
    case 'not-sold':
      return (
        <ArenaText variant="bodySmall" tone="subtle" testID="market-not-sold">
          {words.marketPieceNotSold}
        </ArenaText>
      );
    case 'waiting':
      return (
        <ArenaText variant="bodySmall" tone="subtle" testID="market-waiting">
          {words.marketWaiting}
        </ArenaText>
      );
    case 'scanning':
      return (
        <ArenaText
          variant="bodySmall"
          tone="accent"
          accessibilityLiveRegion="polite"
          testID="market-reading"
        >
          {words.marketReading(statFormatter.exact(state.scanned))}
        </ArenaText>
      );
    case 'failed':
      return (
        <View style={styles.failure}>
          <ArenaText
            variant="bodySmall"
            tone="negative"
            accessibilityLiveRegion="polite"
            testID="market-error"
          >
            {state.reason === 'OFFLINE' ? words.marketFailedOffline : words.marketFailedOther}
          </ArenaText>
          <ArenaButton
            label={words.marketRetry}
            accessibilityLabel={words.marketRetryA11y}
            variant="secondary"
            onPress={onRetry}
            testID="market-retry"
          />
        </View>
      );
    case 'ready':
      return <Listings state={state} now={now} onReview={onReview} />;
  }
}

function Listings({
  state,
  now,
  onReview,
}: {
  state: Extract<PieceState, { kind: 'ready' }>;
  now: number;
  onReview: (listing: MarketListing) => void;
}) {
  const total = state.listings.length;
  if (total === 0) {
    return (
      <View style={styles.list}>
        <ArenaText variant="bodySmall" tone="body" testID="market-empty">
          {words.marketNothing}
        </ArenaText>
        <Freshness state={state} now={now} />
      </View>
    );
  }

  const shown = state.listings.slice(0, MAX_SHOWN_LISTINGS);
  const cheapest = shown[0];
  return (
    <View style={styles.list}>
      <ArenaText variant="bodyMedium" tone="primary" testID="market-summary">
        {words.marketSummary(statFormatter.exact(total), total, cheapestLabel(cheapest))}
      </ArenaText>
      <Freshness state={state} now={now} />
      {shown.map((listing) => {
        const ui = toListingUi(listing);
        return (
          <Pressable
            key={ui.key}
            style={styles.listing}
            accessibilityRole="button"
            accessibilityLabel={words.purchaseReviewA11y(ui.a11y)}
            onPress={() => onReview(listing)}
            testID={`market-listing-${ui.key}`}
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
      {total > shown.length ? (
        <ArenaText variant="bodyCaption" tone="subtle" testID="market-showing">
          {words.marketShowing(shown.length, statFormatter.exact(total))}
        </ArenaText>
      ) : null}
    </View>
  );
}

function Freshness({ state, now }: { state: Extract<PieceState, { kind: 'ready' }>; now: number }) {
  return (
    <ArenaText variant="bodyCaption" tone="subtle" testID="market-freshness">
      {words.marketFreshness(statFormatter.exact(state.scanned), timeSince(state.readAt, now))}
    </ArenaText>
  );
}

const styles = StyleSheet.create({
  // No dimming scrim: the design system has no overlay colour, and a raw one is not allowed
  // outside it. The sheet is a raised card with an edge; the list stays visible above it.
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  pieceHeader: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  pieceName: { flex: 1 },
  failure: { gap: space[8] },
  list: { gap: space[8] },
  listing: {
    paddingVertical: space[8],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    gap: space[2],
  },
});
