/**
 * The best offer for every piece still to find, across the collections the filters leave.
 *
 * Nothing is read until FIND OFFERS is pressed (`useBestOffers`): the scope is the filters above,
 * and the person narrows it first. The list is the cheapest first and follows `bestOffers`' order;
 * while the market is being read it can change, and the line above says so. Tapping an offer opens
 * the purchase card over it — this view buys nothing by itself. Prices are what is asked.
 */

import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Collection, EquipmentCatalog, OtherItemCatalog } from '@/core/collection';
import { ArenaButton, ArenaText, color, layout, space } from '@/core/design-system';
import type { Planet } from '@/core/model';

import type { CollectionController } from './useCollection';
import { OfferSheet } from './OfferSheet';
import { collectionsById, offerTargets, offersStatus, toOfferRow } from './offersUiState';
import { collectionStrings as words } from './strings';
import { useBestOffers } from './useBestOffers';

export interface OffersViewProps {
  controller: CollectionController;
  sheet: readonly Collection[];
  catalog: EquipmentCatalog;
  others: OtherItemCatalog;
  planet: Planet;
}

export function OffersView({ controller, sheet, catalog, others, planet }: OffersViewProps) {
  const { offerIds, holdings } = controller;
  const offerCollections = useMemo(() => collectionsById(sheet, offerIds), [sheet, offerIds]);
  const { targets, unsearchable } = useMemo(
    () => offerTargets(offerCollections, holdings, catalog, others),
    [offerCollections, holdings, catalog, others],
  );
  const offers = useBestOffers(planet, targets);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const pieces = new Map(targets.map((target) => [target.piece.key, target.piece]));
    return offers.result.offers.flatMap((offer) => {
      const piece = pieces.get(offer.key);
      return piece === undefined ? [] : [{ offer, piece, ui: toOfferRow(offer, piece) }];
    });
  }, [targets, offers.result.offers]);
  const open = openKey === null ? undefined : rows.find((row) => row.offer.key === openKey);

  const status = offersStatus({
    phase: offers.phase,
    total: offers.total,
    done: offers.done,
    offers: offers.result.offers.length,
    withoutOffer: offers.result.withoutOffer.length,
  });

  if (targets.length === 0 && unsearchable === 0) {
    return (
      <View style={styles.centred} testID="offers-empty">
        <ArenaText variant="titleMedium" tone="primary" align="center">
          {words.offersNothingToFind}
        </ArenaText>
        <ArenaText variant="bodySmall" tone="subtle" align="center">
          {words.offersNothingToFindBody}
        </ArenaText>
      </View>
    );
  }

  return (
    <>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.offer.key}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={words.purchaseReviewA11y(item.ui.a11y)}
            onPress={() => setOpenKey(item.offer.key)}
            testID={`offer-row-${item.offer.key}`}
          >
            <View style={styles.rowTop}>
              <ArenaText variant="bodyMedium" tone="primary" style={styles.rowTitle}>
                {item.ui.title}
              </ArenaText>
              <ArenaText
                variant="titleMedium"
                tone="primary"
                testID={`offer-price-${item.offer.key}`}
              >
                {item.ui.price}
              </ArenaText>
            </View>
            <ArenaText variant="bodyCaption" tone="subtle">
              {item.ui.detail}
            </ArenaText>
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <ArenaText variant="bodyCaption" tone="subtle" testID="offers-intro">
              {words.offersIntro(targets.length, offerCollections.length)}
            </ArenaText>
            {holdings === null ? (
              <ArenaText variant="bodyCaption" tone="negative" testID="offers-no-inventory">
                {words.offersNoInventory}
              </ArenaText>
            ) : null}
            {unsearchable === 0 ? null : (
              <ArenaText variant="bodyCaption" tone="subtle" testID="offers-unsearchable">
                {words.offersUnsearchable(unsearchable)}
              </ArenaText>
            )}

            <View style={styles.actions}>
              {offers.phase === 'running' ? (
                <ArenaButton
                  label={words.offersStop}
                  accessibilityLabel={words.offersStopA11y}
                  variant="secondary"
                  onPress={offers.stop}
                  testID="offers-stop"
                />
              ) : (
                <ArenaButton
                  label={offers.phase === 'idle' ? words.offersFind : words.offersAgain}
                  accessibilityLabel={
                    offers.phase === 'idle' ? words.offersFindA11y : words.offersAgainA11y
                  }
                  disabled={targets.length === 0}
                  onPress={offers.start}
                  testID="offers-find"
                />
              )}
            </View>

            {status === null ? null : (
              <ArenaText
                variant="bodySmall"
                tone="accent"
                accessibilityLiveRegion="polite"
                testID="offers-status"
              >
                {status}
              </ArenaText>
            )}
            {offers.failed > 0 && offers.phase !== 'running' ? (
              <View style={styles.actions}>
                <ArenaText variant="bodySmall" tone="negative" testID="offers-failed">
                  {words.offersFailed(offers.failed)}
                </ArenaText>
                <ArenaButton
                  label={words.offersRetryFailed}
                  accessibilityLabel={words.offersRetryFailedA11y}
                  variant="secondary"
                  onPress={offers.retryFailed}
                  testID="offers-retry-failed"
                />
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={styles.list}
        testID="offers-list"
      />
      {open === undefined ? null : (
        <OfferSheet
          key={open.offer.key}
          planet={planet}
          offer={open.offer}
          piece={open.piece}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space[40] },
  header: { paddingHorizontal: layout.screenGutter, paddingTop: space[12], gap: space[8] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[8] },
  row: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[12],
    minHeight: layout.minTouchTarget,
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    gap: space[2],
  },
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  rowTitle: { flex: 1 },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[20],
    gap: space[12],
  },
});
