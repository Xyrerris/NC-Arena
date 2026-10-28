/**
 * The Upgrade section (the upgrade plan, phase 3): equipment to buy as material for raising another
 * piece, ranked by NCG per Gexp against a ceiling for its grade, and bought through the cart.
 *
 * **Nothing is read until FIND MATERIAL is pressed** (`useUpgradeMarket`), and grade 7 — the biggest
 * read and the one with the least to gain — starts switched off. Offers over the ceiling are counted,
 * not listed. At the opening ceilings the bargains are pieces at +0, so "only raised" (on, as asked)
 * says how many +0 pieces it hides.
 */

import { FlashList } from '@shopify/flash-list';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  GRADE_RANGES,
  ceilingAt,
  materialCandidates,
  observedFloors,
  rankMaterials,
  type BaseExpByItem,
  type EnhancementExp,
  type EquipmentCatalog,
} from '@/core/collection';
import { useViewerAvatar } from '@/core/data';
import {
  ArenaButton,
  ArenaText,
  FormField,
  ScreenScaffold,
  SortChip,
  color,
  layout,
  space,
} from '@/core/design-system';
import type { Planet } from '@/core/model';
import { formatNcg, type BatchPlan } from '@/core/purchase';
import { BatchSheet } from '@/core/purchase/BatchSheet';

import { upgradeStrings as words } from './strings';
import {
  SLOTS,
  filterListings,
  parseCeiling,
  readingStatus,
  selectionTitle,
  toMaterialRow,
  upgradePlan,
} from './upgradeUiState';
import { useUpgradeMarket } from './useUpgradeMarket';
import { useUpgradeSheets } from './useUpgradeSheets';

export interface UpgradeScreenProps {
  /** The section switcher, supplied by the route (a feature may not import another). */
  sectionTabs?: ReactNode;
}

export function UpgradeScreen({ sectionTabs }: UpgradeScreenProps) {
  const avatar = useViewerAvatar();
  const planet = avatar?.planet ?? 'heimdall';
  const loaded = useUpgradeSheets(planet);

  if (loaded.status === 'ready') {
    return (
      <UpgradeBody
        planet={planet}
        base={loaded.base}
        levels={loaded.levels}
        catalog={loaded.catalog}
        onChain={loaded.onChain}
        sectionTabs={sectionTabs}
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
      <View style={styles.centred} testID="upgrade-sheets-state">
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
                  : loaded.reason === 'NO_EXP'
                    ? words.sheetNoExp
                    : words.sheetFailedOther}
            </ArenaText>
            <ArenaButton
              label={words.sheetRetry}
              onPress={loaded.retry}
              testID="upgrade-sheets-retry"
            />
          </>
        )}
      </View>
    </ScreenScaffold>
  );
}

interface UpgradeBodyProps {
  planet: Planet;
  base: BaseExpByItem;
  levels: EnhancementExp;
  catalog: EquipmentCatalog;
  onChain: boolean;
  sectionTabs?: ReactNode;
}

const CEILING_GRADES = [9, 8, 7] as const;

function UpgradeBody({ planet, base, levels, catalog, onChain, sectionTabs }: UpgradeBodyProps) {
  const [withValkyrie, setWithValkyrie] = useState(false);
  const candidates = useMemo(
    () => materialCandidates(base, { minGrade: withValkyrie ? 7 : 8 }),
    [base, withValkyrie],
  );
  const market = useUpgradeMarket(planet, candidates);

  const [grade, setGrade] = useState<number | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [onlyRaised, setOnlyRaised] = useState(true);
  const [showCeilings, setShowCeilings] = useState(false);
  const [ceilingText, setCeilingText] = useState<Readonly<Record<number, string>>>({});

  const grades = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.grade))].sort((a, b) => b - a),
    [candidates],
  );

  // The ceilings move with the date, so the ranking takes the date when it is worked out.
  const ceilings = useMemo(() => {
    const own: Record<number, number> = {};
    for (const g of CEILING_GRADES) {
      const typed = parseCeiling(ceilingText[g] ?? '');
      if (typed !== null) own[g] = typed;
    }
    return own;
  }, [ceilingText]);
  const floors = useMemo(
    () => observedFloors(market.listings, base, levels),
    [market.listings, base, levels],
  );

  const ranking = useMemo(
    () =>
      rankMaterials(filterListings(market.listings, base, { grade, slot }), base, levels, {
        now: new Date(),
        ceilings,
        floors,
        onlyRaised,
        ...(market.ownAgent === null ? {} : { ownAgentAddress: market.ownAgent }),
      }),
    [market.listings, base, levels, grade, slot, ceilings, floors, onlyRaised, market.ownAgent],
  );
  const rows = useMemo(
    () => ranking.offers.map((scored) => ({ scored, ui: toMaterialRow(scored, catalog) })),
    [ranking.offers, catalog],
  );

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  const chosen = ranking.offers.filter((scored) => selected.has(scored.listing.productId));
  // The batch as it was when BUY was pressed: its lines must not vanish as the pieces are bought.
  const [buying, setBuying] = useState<BatchPlan | null>(null);
  const bought = (productId: string): void => {
    market.markSold(productId);
    setSelected((current) => {
      if (!current.has(productId)) return current;
      const next = new Set(current);
      next.delete(productId);
      return next;
    });
  };

  const status = readingStatus(market.phase, market.done, market.total);

  return (
    <ScreenScaffold applyBottomInset={false}>
      <View style={styles.fill}>
        <FlashList
          data={rows}
          extraData={selected}
          keyExtractor={(row) => row.ui.key}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.ui.key);
            const a11y = isSelected
              ? words.unselectA11y(item.ui.label)
              : words.selectA11y(item.ui.label);
            return (
              <View style={styles.row}>
                <Pressable
                  style={styles.rowBody}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  onPress={() => toggle(item.ui.key)}
                  testID={`upgrade-row-${item.ui.key}`}
                >
                  <View style={styles.rowTop}>
                    <ArenaText variant="bodyMedium" tone="primary" style={styles.rowTitle}>
                      {item.ui.label}
                    </ArenaText>
                    <ArenaText
                      variant="titleMedium"
                      tone="primary"
                      testID={`upgrade-price-${item.ui.key}`}
                    >
                      {item.ui.price}
                    </ArenaText>
                  </View>
                  <ArenaText variant="bodyCaption" tone="subtle">
                    {item.ui.detail}
                  </ArenaText>
                  <ArenaText
                    variant="bodyCaption"
                    tone={item.scored.band === 'optimum' ? 'accent' : 'subtle'}
                  >
                    {item.ui.band}
                  </ArenaText>
                </Pressable>
                <SortChip
                  label={isSelected ? words.selected : words.select}
                  accessibilityLabel={a11y}
                  selected={isSelected}
                  onPress={() => toggle(item.ui.key)}
                  testID={`upgrade-select-${item.ui.key}`}
                />
              </View>
            );
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              {sectionTabs}
              <ArenaText variant="displayMedium" tone="primary" accessibilityRole="header">
                {words.title}
              </ArenaText>
              <ArenaText variant="bodyCaption" tone="subtle" testID="upgrade-intro">
                {words.intro}
              </ArenaText>
              {onChain ? null : (
                <ArenaText variant="bodyCaption" tone="negative" testID="upgrade-not-on-chain">
                  {words.notOnChain}
                </ArenaText>
              )}

              <View style={styles.actions}>
                {market.phase === 'running' ? (
                  <ArenaButton
                    label={words.stop}
                    accessibilityLabel={words.stopA11y}
                    variant="secondary"
                    onPress={market.stop}
                    testID="upgrade-stop"
                  />
                ) : (
                  <ArenaButton
                    label={market.phase === 'idle' ? words.find : words.again}
                    accessibilityLabel={market.phase === 'idle' ? words.findA11y : words.againA11y}
                    disabled={candidates.length === 0}
                    onPress={market.start}
                    testID="upgrade-find"
                  />
                )}
                <SortChip
                  label={withValkyrie ? words.withValkyrie : words.withoutValkyrie}
                  accessibilityLabel={words.valkyrieA11y}
                  selected={withValkyrie}
                  onPress={() => setWithValkyrie((current) => !current)}
                  testID="upgrade-valkyrie"
                />
              </View>
              {status === null ? null : (
                <ArenaText
                  variant="bodySmall"
                  tone="accent"
                  accessibilityLiveRegion="polite"
                  testID="upgrade-status"
                >
                  {status}
                </ArenaText>
              )}
              {market.failed > 0 && market.phase !== 'running' ? (
                <View style={styles.actions}>
                  <ArenaText variant="bodySmall" tone="negative" testID="upgrade-failed">
                    {words.failed(market.failed)}
                  </ArenaText>
                  <ArenaButton
                    label={words.retryFailed}
                    accessibilityLabel={words.retryFailedA11y}
                    variant="secondary"
                    onPress={market.retryFailed}
                    testID="upgrade-retry-failed"
                  />
                </View>
              ) : null}

              <View style={styles.actions}>
                <SortChip
                  label={words.gradeAll}
                  accessibilityLabel={words.gradeAllA11y}
                  selected={grade === null}
                  onPress={() => setGrade(null)}
                  testID="upgrade-grade-all"
                />
                {grades.map((value) => (
                  <SortChip
                    key={value}
                    label={words.gradeChip(value)}
                    accessibilityLabel={words.gradeChipA11y(value)}
                    selected={grade === value}
                    onPress={() => setGrade(value)}
                    testID={`upgrade-grade-${value}`}
                  />
                ))}
              </View>
              <View style={styles.actions}>
                <SortChip
                  label={words.slotAll}
                  accessibilityLabel={words.slotAllA11y}
                  selected={slot === null}
                  onPress={() => setSlot(null)}
                  testID="upgrade-slot-all"
                />
                {SLOTS.map((value) => (
                  <SortChip
                    key={value}
                    label={words.slotChip(value)}
                    accessibilityLabel={words.slotChipA11y(value)}
                    selected={slot === value}
                    onPress={() => setSlot(value)}
                    testID={`upgrade-slot-${value}`}
                  />
                ))}
              </View>
              <View style={styles.actions}>
                <SortChip
                  label={onlyRaised ? words.onlyRaised : words.allLevels}
                  accessibilityLabel={words.levelsA11y}
                  selected={onlyRaised}
                  onPress={() => setOnlyRaised((current) => !current)}
                  testID="upgrade-only-raised"
                />
                <SortChip
                  label={words.ceilings}
                  accessibilityLabel={words.ceilingsA11y}
                  selected={showCeilings}
                  onPress={() => setShowCeilings((current) => !current)}
                  testID="upgrade-ceilings-toggle"
                />
              </View>
              {showCeilings
                ? CEILING_GRADES.filter((g) => grades.includes(g)).map((g) => (
                    <FormField
                      key={g}
                      label={words.ceilingLabel(g)}
                      value={ceilingText[g] ?? ''}
                      onChangeText={(text) =>
                        setCeilingText((current) => ({ ...current, [g]: text }))
                      }
                      hint={words.ceilingHint(formatNcg(ceilingAt(GRADE_RANGES[g]!, new Date())))}
                      testID={`upgrade-ceiling-${g}`}
                    />
                  ))
                : null}

              {ranking.over === 0 ? null : (
                <ArenaText variant="bodySmall" tone="subtle" testID="upgrade-over">
                  {words.overCeiling(ranking.over)}
                </ArenaText>
              )}
              {ranking.leftOutAtZero === 0 ? null : (
                <ArenaText variant="bodySmall" tone="accent" testID="upgrade-left-out">
                  {words.leftOutAtZero(ranking.leftOutAtZero)}
                </ArenaText>
              )}
              {rows.length === 0 && (market.phase === 'done' || market.phase === 'stopped') ? (
                <ArenaText variant="bodySmall" tone="subtle" testID="upgrade-nothing">
                  {words.nothingInRange}
                </ArenaText>
              ) : null}
              {market.phase === 'idle' ? (
                <ArenaText variant="bodySmall" tone="subtle" testID="upgrade-idle">
                  {words.nothingYet}
                </ArenaText>
              ) : null}
            </View>
          }
          contentContainerStyle={styles.list}
          testID="upgrade-list"
        />
        {chosen.length === 0 ? null : (
          <View style={styles.bar} testID="upgrade-bar">
            <ArenaText
              variant="titleMedium"
              tone="primary"
              accessibilityLiveRegion="polite"
              testID="upgrade-bar-title"
            >
              {selectionTitle(chosen)}
            </ArenaText>
            <ArenaText variant="bodyCaption" tone="subtle">
              {words.barNote}
            </ArenaText>
            <View style={styles.actions}>
              <ArenaButton
                label={words.buy}
                accessibilityLabel={words.buyA11y}
                onPress={() => setBuying(upgradePlan(chosen, catalog))}
                testID="upgrade-buy"
              />
              <ArenaButton
                label={words.clear}
                accessibilityLabel={words.clearA11y}
                variant="secondary"
                onPress={() => setSelected(new Set())}
                testID="upgrade-clear"
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
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: layout.screenGutter, paddingTop: space[12], gap: space[8] },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[12],
    paddingHorizontal: layout.screenGutter,
  },
  list: { paddingBottom: space[40] },
  header: { paddingHorizontal: layout.screenGutter, paddingTop: space[12], gap: space[8] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[8] },
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
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  rowTitle: { flex: 1 },
  bar: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[12],
    gap: space[4],
    backgroundColor: color.raised,
    borderTopWidth: 1,
    borderTopColor: color.decorative.hairline,
  },
});
