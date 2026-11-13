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

import type {
  Collection,
  EnhancementCosts,
  EquipmentCatalog,
  OtherItemCatalog,
} from '@/core/collection';
import { ArenaButton, ArenaText, SortChip, color, layout, space } from '@/core/design-system';
import type { Planet } from '@/core/model';
import { BatchSheet } from '@/core/purchase/BatchSheet';
import { useNcgBalance } from '@/core/purchase/useNcgBalance';
import type { BatchPlan } from '@/core/purchase';

import { batchPlan } from './batchUiState';
import type { CollectionController } from './useCollection';
import { OfferSheet } from './OfferSheet';
import {
  arrangeOffers,
  collectionsById,
  offerLevels,
  offerTargets,
  type OfferSort,
  offersStatus,
  selectionSummary,
  toOfferRow,
} from './offersUiState';
import { collectionStrings as words } from './strings';
import { useBestOffers } from './useBestOffers';

export interface OffersViewProps {
  controller: CollectionController;
  sheet: readonly Collection[];
  catalog: EquipmentCatalog;
  others: OtherItemCatalog;
  /** What raising a piece costs; null when the sheet was not read, and then only exact levels are offers. */
  costs: EnhancementCosts | null;
  planet: Planet;
}

export function OffersView({ controller, sheet, catalog, others, costs, planet }: OffersViewProps) {
  const { offerIds, holdings } = controller;
  const offerCollections = useMemo(() => collectionsById(sheet, offerIds), [sheet, offerIds]);
  const { targets, unsearchable, toRaise } = useMemo(
    () => offerTargets(offerCollections, holdings, catalog, others),
    [offerCollections, holdings, catalog, others],
  );
  const offers = useBestOffers(planet, targets, costs);
  // The offers above the standard price are left out, counted, and shown at the end on request.
  const [showDear, setShowDear] = useState(false);
  const dearCount = offers.result.overpriced.length;

  const [sort, setSort] = useState<OfferSort>('price');
  const [levelFilter, setLevelFilter] = useState<number | null>(null);

  const allRows = useMemo(() => {
    const pieces = new Map(targets.map((target) => [target.piece.key, target.piece]));
    const shown = showDear
      ? [...offers.result.offers, ...offers.result.overpriced]
      : offers.result.offers;
    return shown.flatMap((offer) => {
      const piece = pieces.get(offer.key);
      return piece === undefined ? [] : [{ offer, piece, ui: toOfferRow(offer, piece) }];
    });
  }, [targets, offers.result.offers, offers.result.overpriced, showDear]);
  const levels = useMemo(() => offerLevels(allRows), [allRows]);
  // A level a new read no longer has is not a filter any more, rather than an empty list.
  const level = levelFilter !== null && levels.includes(levelFilter) ? levelFilter : null;
  const rows = useMemo(() => arrangeOffers(allRows, sort, level), [allRows, sort, level]);
  // The row is kept as it was opened: once its piece is bought it leaves the list, and the card
  // that says it went through has to stay until the person closes it.
  const [open, setOpen] = useState<(typeof allRows)[number] | null>(null);

  // The offers picked for the total. Kept by key and read against the rows as they are now, so an
  // offer that a new read took away leaves the selection with it. Not kept anywhere: prices age.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  const chosen = rows.filter((row) => selected.has(row.offer.key));
  // The batch as it was when BUY was pressed: as its pieces are bought they leave `chosen`, and the
  // sheet that is showing each piece's fate must not lose its lines under it.
  const [buying, setBuying] = useState<BatchPlan | null>(null);

  // A listing the chain confirmed is gone: out of the offers, and out of the selection, so the
  // next-best offer that takes its place is not bought by a tick that was meant for the one before.
  const bought = (productId: string): void => {
    offers.markSold(productId);
    const gone = allRows
      .filter((row) => row.offer.picks.some((pick) => pick.productId === productId))
      .map((row) => row.offer.key);
    if (gone.length === 0) return;
    setSelected((current) => {
      const next = new Set(current);
      for (const key of gone) next.delete(key);
      return next;
    });
  };
  const balance = useNcgBalance(planet, chosen.length > 0);
  const summary =
    chosen.length === 0
      ? null
      : selectionSummary(
          chosen.map((r) => r.offer),
          balance,
        );

  const status = offersStatus({
    phase: offers.phase,
    total: offers.total,
    done: offers.done,
    offers: offers.result.offers.length,
    withoutOffer: offers.result.withoutOffer.length,
  });

  if (targets.length === 0 && unsearchable === 0 && toRaise === 0) {
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
    <View style={styles.fill}>
      <FlashList
        data={rows}
        extraData={selected}
        keyExtractor={(row) => row.offer.key}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.offer.key);
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowBody}
                accessibilityRole="button"
                accessibilityLabel={words.purchaseReviewA11y(item.ui.a11y)}
                onPress={() => setOpen(item)}
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
              <SortChip
                label={isSelected ? words.offersSelected : words.offersSelect}
                accessibilityLabel={
                  isSelected
                    ? words.offersUnselectA11y(item.piece.label)
                    : words.offersSelectA11y(item.piece.label)
                }
                selected={isSelected}
                onPress={() => toggle(item.offer.key)}
                testID={`offer-select-${item.offer.key}`}
              />
            </View>
          );
        }}
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
            {toRaise === 0 ? null : (
              <ArenaText variant="bodyCaption" tone="accent" testID="offers-to-raise">
                {words.offersToRaise(toRaise)}
              </ArenaText>
            )}
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
            {allRows.length === 0 ? null : (
              <View style={styles.actions}>
                <SortChip
                  label={words.offersSortPrice}
                  accessibilityLabel={words.offersSortPriceA11y}
                  selected={sort === 'price'}
                  onPress={() => setSort('price')}
                  testID="offers-sort-price"
                />
                <SortChip
                  label={words.offersSortLevel}
                  accessibilityLabel={words.offersSortLevelA11y}
                  selected={sort === 'level'}
                  onPress={() => setSort('level')}
                  testID="offers-sort-level"
                />
              </View>
            )}
            {levels.length < 2 ? null : (
              <View style={styles.actions}>
                <SortChip
                  label={words.offersLevelAll}
                  accessibilityLabel={words.offersLevelAllA11y}
                  selected={level === null}
                  onPress={() => setLevelFilter(null)}
                  testID="offers-level-all"
                />
                {levels.map((value) => (
                  <SortChip
                    key={value}
                    label={words.offersLevelChip(value)}
                    accessibilityLabel={words.offersLevelChipA11y(value)}
                    selected={level === value}
                    onPress={() => setLevelFilter(value)}
                    testID={`offers-level-${value}`}
                  />
                ))}
              </View>
            )}
            {dearCount === 0 ? null : (
              <View style={styles.actions}>
                <ArenaText variant="bodySmall" tone="subtle" testID="offers-overpriced">
                  {words.offersOverpriced(dearCount, showDear)}
                </ArenaText>
                <ArenaButton
                  label={showDear ? words.offersOverpricedHide : words.offersOverpricedShow}
                  accessibilityLabel={
                    showDear ? words.offersOverpricedHideA11y : words.offersOverpricedShowA11y
                  }
                  variant="secondary"
                  onPress={() => setShowDear((now) => !now)}
                  testID="offers-overpriced-toggle"
                />
              </View>
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
      {summary === null ? null : (
        <View style={styles.bar} testID="offers-bar">
          <ArenaText
            variant="titleMedium"
            tone="primary"
            accessibilityLiveRegion="polite"
            testID="offers-bar-title"
          >
            {summary.title}
          </ArenaText>
          {summary.units === null ? null : (
            <ArenaText variant="bodyCaption" tone="subtle" testID="offers-bar-units">
              {summary.units}
            </ArenaText>
          )}
          <ArenaText variant="bodySmall" tone="body" testID="offers-bar-balance">
            {summary.balanceLine}
          </ArenaText>
          {summary.afterLine === null ? null : (
            <ArenaText
              variant="bodySmall"
              tone={summary.enough === 'short' ? 'negative' : 'subtle'}
              testID="offers-bar-after"
            >
              {summary.afterLine}
            </ArenaText>
          )}
          {summary.raiseLine === null ? null : (
            <ArenaText variant="bodySmall" tone="body" testID="offers-bar-raise">
              {summary.raiseLine}
            </ArenaText>
          )}
          <ArenaText variant="bodyCaption" tone="subtle">
            {words.offersBarNote}
          </ArenaText>
          <View style={styles.actions}>
            <ArenaButton
              label={words.offersBuySelection}
              accessibilityLabel={words.offersBuySelectionA11y}
              onPress={() => setBuying(batchPlan(chosen))}
              testID="offers-buy"
            />
            <ArenaButton
              label={words.offersClear}
              accessibilityLabel={words.offersClearA11y}
              variant="secondary"
              onPress={() => setSelected(new Set())}
              testID="offers-clear"
            />
          </View>
        </View>
      )}
      {buying === null ? null : (
        <BatchSheet
          planet={planet}
          plan={buying}
          onClose={() => setBuying(null)}
          onBought={bought}
        />
      )}
      {open === null ? null : (
        <OfferSheet
          key={open.offer.key}
          planet={planet}
          offer={open.offer}
          piece={open.piece}
          onClose={() => setOpen(null)}
          onBought={bought}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space[40] },
  header: { paddingHorizontal: layout.screenGutter, paddingTop: space[12], gap: space[8] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[8] },
  fill: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[4],
    gap: space[8],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
  },
  rowBody: { flex: 1, minHeight: layout.minTouchTarget, justifyContent: 'center', gap: space[2] },
  bar: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[12],
    gap: space[4],
    backgroundColor: color.raised,
    borderTopWidth: 1,
    borderTopColor: color.decorative.hairline,
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
