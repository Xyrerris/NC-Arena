/**
 * The collection tracker (ADR-0044): which of the avatar's collections are unlocked, which are
 * only claimed, which the chain disagrees with, and what is left to find.
 *
 * The header does not scroll with the list, for the roster's reason: it holds controls, and a
 * control inside a recycled list header is a cell that can be recycled while it has focus.
 *
 * **Two sources, one of them fallible.** The numbers come from the last complete chain read,
 * shown with its age; a refresh that fails says so above a list that is still entirely usable,
 * and never blanks it (HANDOFF.md, decision 2, applied here).
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  ScreenScaffold,
  SegmentedTabs,
  SortChip,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';
import type { Collection, EquipmentCatalog, OtherItemCatalog } from '@/core/collection';
import { useViewerAvatar } from '@/core/data';

import { CollectionRowItem } from './CollectionRow';
import { FilterPanel } from './FilterPanel';
import { MarketSheet } from './MarketSheet';
import { OffersView } from './OffersView';
import { SkillMark } from './SkillMark';
import {
  SORT_OPTIONS,
  VIEW_TABS,
  type CollectionHeaderUi,
  type ItemLineUi,
  type RefreshUi,
} from './collectionUiState';
import { collectionStrings as words } from './strings';
import { useCollection, type CollectionController } from './useCollection';
import { useGameSheets } from './useGameSheets';

/** No equipment is known: no piece has a market. Held once so the sheet's memo keeps its identity. */
const NO_CATALOG: EquipmentCatalog = new Map();
const NO_OTHERS: OtherItemCatalog = new Map();

export interface CollectionScreenProps {
  /**
   * The collections to track, when the route already has them (a test, or a placeholder). Left
   * out, the screen loads the game's sheets itself through `ArenaData.sheets` and names the
   * equipment; given, it shows exactly this list and bare ids.
   */
  sheet?: readonly Collection[];
  /** The Arena | Collection switcher, supplied by the route (a feature may not import another). */
  sectionTabs?: ReactNode;
  /** True while `sheet` is placeholder data: the screen says so rather than let it pass. */
  sampleData?: boolean;
}

export function CollectionScreen({
  sheet,
  sectionTabs,
  sampleData = false,
}: CollectionScreenProps) {
  if (sheet !== undefined) {
    return <CollectionBody sheet={sheet} sectionTabs={sectionTabs} sampleData={sampleData} />;
  }
  return <SheetGate sectionTabs={sectionTabs} />;
}

/**
 * Fetches the sheets before there is anything to track. Until they are in, the screen is the title
 * and one sentence; a failure says why and offers another try, because without the list there is
 * nothing to show and nothing to fall back to.
 */
function SheetGate({ sectionTabs }: { sectionTabs?: ReactNode }) {
  const avatar = useViewerAvatar();
  const loaded = useGameSheets(avatar?.planet ?? 'heimdall');

  if (loaded.status === 'ready') {
    return (
      <CollectionBody
        sheet={loaded.sheet}
        catalog={loaded.catalog}
        others={loaded.others}
        sectionTabs={sectionTabs}
        sampleData={false}
      />
    );
  }

  return (
    <ScreenScaffold applyBottomInset={false}>
      <View style={styles.top}>
        {sectionTabs}
        <ArenaText variant="displayMedium" tone="primary" accessibilityRole="header">
          {words.title}
        </ArenaText>
      </View>
      <View style={styles.centred} testID="collection-sheets-state">
        {loaded.status === 'loading' ? (
          <ArenaText variant="bodySmall" tone="subtle" accessibilityLiveRegion="polite">
            {words.sheetLoading}
          </ArenaText>
        ) : (
          <>
            <ArenaText variant="bodySmall" tone="negative" align="center">
              {loaded.reason === 'OFFLINE'
                ? words.sheetFailedOffline
                : loaded.reason === 'MALFORMED'
                  ? words.sheetMalformed
                  : words.sheetFailedOther}
            </ArenaText>
            <ArenaButton
              label={words.sheetRetry}
              onPress={loaded.retry}
              testID="collection-sheets-retry"
            />
          </>
        )}
      </View>
    </ScreenScaffold>
  );
}

function CollectionBody({
  sheet,
  catalog,
  others,
  sectionTabs,
  sampleData,
}: {
  sheet: readonly Collection[];
  catalog?: EquipmentCatalog;
  others?: OtherItemCatalog;
  sectionTabs?: ReactNode;
  sampleData: boolean;
}) {
  const controller = useCollection(sheet, catalog, others);
  const router = useRouter();
  const openViewer = useCallback(() => router.push('/me'), [router]);
  // Which collection's market sheet is open, if any. Held here and not in the controller: it is
  // a screen's own modal state, and the sheet reads the market by itself.
  const [marketId, setMarketId] = useState<number | null>(null);
  const closeMarket = useCallback(() => setMarketId(null), []);
  const marketCollection =
    marketId === null ? undefined : sheet.find((collection) => collection.id === marketId);

  return (
    <ScreenScaffold applyBottomInset={false}>
      <View style={styles.top}>
        {sectionTabs}
        <ArenaText variant="displayMedium" tone="primary" accessibilityRole="header">
          {words.title}
        </ArenaText>
      </View>

      {controller.avatar === null ? (
        <View style={styles.centred} testID="collection-no-avatar">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            {words.noAvatarTitle}
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            {words.noAvatarBody}
          </ArenaText>
          <ArenaButton
            label={words.noAvatarAction}
            onPress={openViewer}
            testID="collection-open-viewer"
          />
        </View>
      ) : (
        <>
          <CollectionHeader controller={controller} sampleData={sampleData} />
          {controller.view === 'COLLECTIONS' ? (
            <CollectionList controller={controller} onMarket={setMarketId} />
          ) : controller.view === 'ITEMS' ? (
            <ItemList controller={controller} />
          ) : (
            <OffersView
              controller={controller}
              sheet={sheet}
              catalog={catalog ?? NO_CATALOG}
              others={others ?? NO_OTHERS}
              planet={controller.avatar.planet}
            />
          )}
          {marketCollection === undefined ? null : (
            <MarketSheet
              key={marketCollection.id}
              collection={marketCollection}
              catalog={catalog ?? NO_CATALOG}
              others={others ?? NO_OTHERS}
              planet={controller.avatar.planet}
              onClose={closeMarket}
            />
          )}
        </>
      )}
    </ScreenScaffold>
  );
}

function CollectionHeader({
  controller,
  sampleData,
}: {
  controller: CollectionController;
  sampleData: boolean;
}) {
  const { header, refresh } = controller;
  return (
    <View style={styles.header}>
      {sampleData ? (
        <ArenaText variant="bodyCaption" tone="accent" testID="collection-sample-note">
          {words.sampleNote}
        </ArenaText>
      ) : null}

      <Progress header={header} />
      <ArenaText variant="bodyCaption" tone="subtle" testID="collection-read-label">
        {header.readLabel}
      </ArenaText>
      {header.unknownNote === null ? null : (
        <ArenaText variant="bodyCaption" tone="negative" testID="collection-unknown-note">
          {header.unknownNote}
        </ArenaText>
      )}
      <RefreshLine refresh={refresh} onRetry={controller.onRefresh} />
      {controller.inventoryNote === null ? null : (
        <ArenaText
          variant="bodyCaption"
          tone={controller.inventoryNote.tone}
          accessibilityLiveRegion="polite"
          testID="collection-inventory-note"
        >
          {controller.inventoryNote.text}
        </ArenaText>
      )}

      <SegmentedTabs
        tabs={VIEW_TABS}
        selected={controller.view}
        onSelect={controller.onView}
        accessibilityLabel={words.viewsA11y}
        testID="collection-views"
      />

      <FilterPanel controller={controller} />

      {controller.view === 'COLLECTIONS' ? (
        <>
          <View style={styles.chips}>
            {SORT_OPTIONS.map((option) => (
              <SortChip
                key={option.sort}
                label={option.label}
                selected={controller.sort === option.sort}
                onPress={() => controller.onSort(option.sort)}
                testID={`collection-sort-${option.sort}`}
              />
            ))}
          </View>
          {controller.rows.some((row) => row.items.some((item) => item.needsSkill)) ? (
            <View style={styles.legend} testID="collection-skill-legend">
              <SkillMark shown />
              <ArenaText variant="bodyCaption" tone="subtle" style={styles.legendText}>
                {words.skillLegend}
              </ArenaText>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * Two flexed segments rather than a computed width: the ratio is the layout, so there is no
 * percentage to format and nothing to round (ARCHITECTURE.md §2.2).
 */
function Progress({ header }: { header: CollectionHeaderUi }) {
  return (
    <View style={styles.progress}>
      <ArenaText variant="titleMedium" tone="primary" testID="collection-progress">
        {header.progressLabel}
      </ArenaText>
      {header.unlocked + header.open === 0 ? null : (
        <View
          style={styles.bar}
          accessibilityRole="progressbar"
          accessibilityLabel={header.progressA11y}
          accessibilityValue={{ min: 0, max: header.unlocked + header.open, now: header.unlocked }}
        >
          <View style={[styles.barDone, { flex: header.unlocked }]} />
          <View style={{ flex: header.open }} />
        </View>
      )}
    </View>
  );
}

function RefreshLine({ refresh, onRetry }: { refresh: RefreshUi; onRetry: () => void }) {
  if (refresh.kind === 'idle') return null;
  if (refresh.kind === 'running') {
    return (
      <ArenaText
        variant="bodyCaption"
        tone="accent"
        accessibilityLiveRegion="polite"
        testID="collection-refreshing"
      >
        {words.reading}
      </ArenaText>
    );
  }
  if (refresh.kind === 'noState') {
    return (
      <ArenaText variant="bodyCaption" tone="subtle" testID="collection-no-state">
        {words.noState}
      </ArenaText>
    );
  }
  return (
    <View style={styles.failure}>
      <ArenaText
        variant="bodySmall"
        tone="negative"
        accessibilityLiveRegion="polite"
        testID="collection-refresh-error"
      >
        {refresh.message}
      </ArenaText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={words.retryA11y}
        onPress={onRetry}
        style={styles.retry}
        testID="collection-retry"
      >
        <ArenaText variant="labelStrong" tone="accent">
          {words.retry}
        </ArenaText>
      </Pressable>
    </View>
  );
}

function CollectionList({
  controller,
  onMarket,
}: {
  controller: CollectionController;
  onMarket: (collectionId: number) => void;
}) {
  return (
    <FlashList
      data={controller.rows}
      extraData={`${controller.filter}-${controller.sort}-${controller.filtersChanged}`}
      // Pull-to-refresh reads the chain again, as it syncs the roster.
      refreshing={controller.refresh.kind === 'running'}
      onRefresh={controller.onRefresh}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => (
        <CollectionRowItem row={item} onAction={controller.onTick} onMarket={onMarket} />
      )}
      ListEmptyComponent={
        <View style={styles.centred} testID="collection-empty">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            {words.emptyFilterTitle}
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            {words.emptyFilterBody}
          </ArenaText>
        </View>
      }
      contentContainerStyle={styles.list}
      testID="collection-list"
    />
  );
}

function ItemList({ controller }: { controller: CollectionController }) {
  return (
    <FlashList
      data={controller.itemLines}
      keyExtractor={(line) => line.key}
      getItemType={(line) => line.kind}
      renderItem={({ item }) => <ItemLine line={item} />}
      ListHeaderComponent={
        controller.unlistedSlots === 0 ? null : (
          <View style={styles.itemHeading}>
            <ArenaText variant="bodyCaption" tone="subtle" testID="collection-unlisted-note">
              {words.unlistedNote(controller.unlistedSlots)}
            </ArenaText>
          </View>
        )
      }
      ListEmptyComponent={
        <View style={styles.centred} testID="collection-items-empty">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            {controller.stats.size > 0 ? words.emptyFilterTitle : words.emptyItemsTitle}
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            {controller.stats.size > 0 ? words.emptyFilterBody : words.emptyItemsBody}
          </ArenaText>
        </View>
      }
      contentContainerStyle={styles.list}
      testID="collection-item-list"
    />
  );
}

function ItemLine({ line }: { line: ItemLineUi }) {
  if (line.kind === 'heading') {
    return (
      <View style={styles.itemHeading}>
        <ArenaText variant="labelNano" tone="accent" accessibilityRole="header">
          {line.text}
        </ArenaText>
      </View>
    );
  }
  return (
    <View style={styles.itemLine} testID={`collection-item-${line.itemId}`}>
      <ArenaText variant="bodyMedium" tone="body">
        {line.text}
      </ArenaText>
      {line.detail === undefined ? null : (
        <ArenaText variant="bodyCaption" tone="subtle">
          {line.detail}
        </ArenaText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: layout.screenGutter, paddingTop: space[6], gap: space[12] },
  header: { paddingHorizontal: layout.screenGutter, paddingTop: space[12], gap: space[8] },
  progress: { gap: space[8] },
  bar: {
    flexDirection: 'row',
    height: space[8],
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: color.decorative.fill,
  },
  barDone: { backgroundColor: color.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  legendText: { flex: 1 },
  failure: {
    flexDirection: 'row',
    // Wraps rather than shrinks: at 200 % font scale the sentence and the button cannot share a line.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  retry: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  list: { paddingBottom: space[40] },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[20],
    gap: space[12],
  },
  itemHeading: { paddingHorizontal: layout.screenGutter, paddingTop: space[16] },
  itemLine: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[8],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
});
