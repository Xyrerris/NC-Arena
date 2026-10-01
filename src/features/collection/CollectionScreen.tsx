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
import { useCallback, type ReactNode } from 'react';
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
import type { Collection } from '@/core/collection';

import { CollectionRowItem } from './CollectionRow';
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  VIEW_TABS,
  type CollectionHeaderUi,
  type ItemLineUi,
  type RefreshUi,
} from './collectionUiState';
import { collectionStrings as words } from './strings';
import { useCollection, type CollectionController } from './useCollection';

export interface CollectionScreenProps {
  /** The collections to track. Where they come from is the route's business. */
  sheet: readonly Collection[];
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
  const controller = useCollection(sheet);
  const router = useRouter();
  const openViewer = useCallback(() => router.push('/me'), [router]);

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
            <CollectionList controller={controller} />
          ) : (
            <ItemList controller={controller} />
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

      <SegmentedTabs
        tabs={VIEW_TABS}
        selected={controller.view}
        onSelect={controller.onView}
        accessibilityLabel={words.viewsA11y}
        testID="collection-views"
      />

      {controller.view === 'COLLECTIONS' ? (
        <>
          <View style={styles.chips}>
            {FILTER_OPTIONS.map((option) => (
              <SortChip
                key={option.filter}
                label={option.label}
                selected={controller.filter === option.filter}
                onPress={() => controller.onFilter(option.filter)}
                testID={`collection-filter-${option.filter}`}
              />
            ))}
          </View>
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

function CollectionList({ controller }: { controller: CollectionController }) {
  return (
    <FlashList
      data={controller.rows}
      extraData={`${controller.filter}-${controller.sort}`}
      // Pull-to-refresh reads the chain again, as it syncs the roster.
      refreshing={controller.refresh.kind === 'running'}
      onRefresh={controller.onRefresh}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <CollectionRowItem row={item} onAction={controller.onTick} />}
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
      ListEmptyComponent={
        <View style={styles.centred} testID="collection-items-empty">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            {words.emptyItemsTitle}
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            {words.emptyItemsBody}
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
