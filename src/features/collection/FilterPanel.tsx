/**
 * The collection screen's filters, folded (ADR-0044).
 *
 * They were three rows of chips always on show: status, then rewards, then the sort, with no
 * telling which narrowed what. Now one line says what is narrowing the list and opens the panel;
 * inside, three sections — status, category (with the equipment types under Equipment) and
 * rewards — each folds on its own and says what it holds while folded. Status starts open because
 * it is the one people change most; the others open when asked.
 *
 * The sort is not a filter and stays outside, always one tap away.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ITEM_CATEGORIES } from '@/core/collection';
import { ArenaText, SortChip, color, layout, radius, space } from '@/core/design-system';

import {
  CATEGORY_LABEL,
  FILTER_OPTIONS,
  categorySummary,
  filterSummary,
  statsSummary,
} from './collectionUiState';
import { collectionStrings as words } from './strings';
import type { CollectionController } from './useCollection';

type SectionName = 'status' | 'category' | 'stats';

export function FilterPanel({ controller }: { controller: CollectionController }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionName, boolean>>({
    status: true,
    category: false,
    stats: false,
  });
  const toggleSection = (name: SectionName): void =>
    setExpanded((current) => ({ ...current, [name]: !current[name] }));

  const inCollections = controller.view === 'COLLECTIONS';
  const hasCategories = controller.equipmentTypeOptions.length > 0;
  const hasStats = controller.statOptions.length > 0;
  if (!inCollections && !hasCategories && !hasStats) return null;

  // The status filter belongs to the collections view alone, so the items view's summary leaves it out.
  const summary = inCollections
    ? filterSummary(controller)
    : controller.categories.size === 0 && controller.stats.size === 0
      ? words.filtersNone
      : [
          controller.categories.size > 0
            ? categorySummary(controller.categories, controller.equipmentTypes)
            : null,
          controller.stats.size > 0 ? statsSummary(controller.stats) : null,
        ]
          .filter((part) => part !== null)
          .join(' · ');

  return (
    <View style={styles.panel} testID="collection-filters">
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${words.filtersTitle}, ${summary}. ${words.filtersToggleA11y(open)}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((current) => !current)}
          style={styles.barToggle}
          testID="collection-filters-toggle"
        >
          <ArenaText variant="labelStrong" tone="primary">
            {`${words.filtersTitle} ${open ? '▾' : '▸'}`}
          </ArenaText>
          <ArenaText
            variant="bodyCaption"
            tone="subtle"
            style={styles.summary}
            testID="collection-filters-summary"
          >
            {summary}
          </ArenaText>
        </Pressable>
        {controller.filtersChanged ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={words.filtersResetA11y}
            onPress={controller.onResetFilters}
            style={styles.reset}
            testID="collection-filters-reset"
          >
            <ArenaText variant="labelStrong" tone="accent">
              {words.filtersReset}
            </ArenaText>
          </Pressable>
        ) : null}
      </View>

      {!open ? null : (
        <View style={styles.sections}>
          {!inCollections ? null : (
            <Section
              name="status"
              title={words.sectionStatus}
              summary={
                FILTER_OPTIONS.find((option) => option.filter === controller.filter)?.label ?? ''
              }
              open={expanded.status}
              onToggle={toggleSection}
            >
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
            </Section>
          )}

          {!hasCategories ? null : (
            <Section
              name="category"
              title={words.sectionCategory}
              summary={categorySummary(controller.categories, controller.equipmentTypes)}
              open={expanded.category}
              onToggle={toggleSection}
            >
              <ArenaText variant="bodyCaption" tone="subtle">
                {words.categoryHint}
              </ArenaText>
              <View style={styles.chips}>
                {ITEM_CATEGORIES.map((category) => (
                  <SortChip
                    key={category}
                    label={CATEGORY_LABEL[category]}
                    selected={controller.categories.has(category)}
                    onPress={() => controller.onCategory(category)}
                    testID={`collection-category-${category}`}
                  />
                ))}
              </View>
              {!controller.categories.has('EQUIPMENT') ? null : (
                <View style={styles.nested} testID="collection-equipment-types">
                  <ArenaText variant="bodyCaption" tone="subtle">
                    {words.sectionEquipment}
                  </ArenaText>
                  <View style={styles.chips}>
                    {controller.equipmentTypeOptions.map((type) => (
                      <SortChip
                        key={type}
                        label={type.toUpperCase()}
                        selected={controller.equipmentTypes.has(type)}
                        onPress={() => controller.onEquipmentType(type)}
                        testID={`collection-equipment-${type}`}
                      />
                    ))}
                  </View>
                </View>
              )}
            </Section>
          )}

          {!hasStats ? null : (
            <Section
              name="stats"
              title={words.sectionStats}
              summary={statsSummary(controller.stats)}
              open={expanded.stats}
              onToggle={toggleSection}
            >
              <ArenaText variant="bodyCaption" tone="subtle">
                {words.statsHint}
              </ArenaText>
              <View style={styles.chips}>
                {controller.statOptions.map((stat) => (
                  <SortChip
                    key={stat}
                    label={stat}
                    selected={controller.stats.has(stat)}
                    onPress={() => controller.onStat(stat)}
                    testID={`collection-stat-${stat}`}
                  />
                ))}
              </View>
            </Section>
          )}
        </View>
      )}
    </View>
  );
}

function Section({
  name,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  name: SectionName;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (name: SectionName) => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${summary}. ${words.sectionToggleA11y(title, open)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => onToggle(name)}
        style={styles.sectionHeader}
        testID={`collection-section-${name}`}
      >
        <ArenaText variant="labelStrong" tone="body">
          {`${title} ${open ? '▾' : '▸'}`}
        </ArenaText>
        <ArenaText variant="bodyCaption" tone="subtle" style={styles.summary}>
          {summary}
        </ArenaText>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: color.decorative.hairline,
    borderRadius: radius.lg,
    backgroundColor: color.raised,
  },
  bar: { flexDirection: 'row', alignItems: 'center' },
  barToggle: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[8],
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  summary: { flex: 1 },
  reset: {
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space[12],
  },
  sections: { borderTopWidth: 1, borderTopColor: color.decorative.divider },
  section: { borderBottomWidth: 1, borderBottomColor: color.decorative.divider },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[8],
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  sectionBody: { gap: space[8], paddingHorizontal: space[12], paddingBottom: space[12] },
  nested: { gap: space[6], paddingTop: space[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
