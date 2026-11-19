/**
 * The Upgrade section (the upgrade plan, phase 3): equipment to buy as material for raising another
 * piece, ranked by NCG per Gexp against a ceiling for its grade, and bought through the cart.
 *
 * **Nothing is read until FIND MATERIAL is pressed** (`useUpgradeMarket`), and grade 7 — the biggest
 * read and the one with the least to gain — starts switched on (owner, 2026-11-18). Offers over the
 * ceiling are counted, not listed. "Only raised" starts off; when on, it says how many +0 pieces it
 * hides. The ceilings and the bargain thresholds can each be overridden per grade.
 */

import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  GRADE_RANGES,
  ceilingAt,
  materialCandidates,
  observedFloors,
  rankMaterials,
  type BaseExpByItem,
  type EnhancementCosts,
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

import { PlannerSheet } from './PlannerSheet';
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
        costs={loaded.costs}
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
  costs: EnhancementCosts;
  onChain: boolean;
  sectionTabs?: ReactNode;
}

const CEILING_GRADES = [9, 8, 7] as const;
/** Scrolled further than this (px), the list shows the back-to-top button. */
const SHOW_TOP_BUTTON_AFTER = 600;

function UpgradeBody({
  planet,
  base,
  levels,
  catalog,
  costs,
  onChain,
  sectionTabs,
}: UpgradeBodyProps) {
  const [withValkyrie, setWithValkyrie] = useState(true);
  const candidates = useMemo(
    () => materialCandidates(base, { minGrade: withValkyrie ? 7 : 8 }),
    [base, withValkyrie],
  );
  const market = useUpgradeMarket(planet, candidates);

  const [grade, setGrade] = useState<number | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [onlyRaised, setOnlyRaised] = useState(false);
  const [showCeilings, setShowCeilings] = useState(false);
  const [ceilingText, setCeilingText] = useState<Readonly<Record<number, string>>>({});
  const [showBargains, setShowBargains] = useState(false);
  const [bargainText, setBargainText] = useState<Readonly<Record<number, string>>>({});

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
  const optimums = useMemo(() => {
    const own: Record<number, number> = {};
    for (const g of CEILING_GRADES) {
      const typed = parseCeiling(bargainText[g] ?? '');
      if (typed !== null) own[g] = typed;
    }
    return own;
  }, [bargainText]);
  const floors = useMemo(
    () => observedFloors(market.listings, base, levels),
    [market.listings, base, levels],
  );

  const ranking = useMemo(
    () =>
      rankMaterials(filterListings(market.listings, base, { grade, slot }), base, levels, {
        now: new Date(),
        ceilings,
        optimums,
        floors,
        onlyRaised,
        ...(market.ownAgent === null ? {} : { ownAgentAddress: market.ownAgent }),
      }),
    [
      market.listings,
      base,
      levels,
      grade,
      slot,
      ceilings,
      optimums,
      floors,
      onlyRaised,
      market.ownAgent,
    ],
  );
  const rows = useMemo(
    () => ranking.offers.map((scored) => ({ scored, ui: toMaterialRow(scored, catalog) })),
    [ranking.offers, catalog],
  );

  // What the planner buys from: everything in range, whatever the list's grade, slot and level filters.
  const plannerOffers = useMemo(
    () =>
      rankMaterials(market.listings, base, levels, {
        now: new Date(),
        ceilings,
        optimums,
        floors,
        ...(market.ownAgent === null ? {} : { ownAgentAddress: market.ownAgent }),
      }).offers,
    [market.listings, base, levels, ceilings, optimums, floors, market.ownAgent],
  );
  const [planning, setPlanning] = useState(false);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  const chosen = ranking.offers.filter((scored) => selected.has(scored.listing.productId));
  // A bargain is an offer under its grade's optimum (`band === 'optimum'`, see upgradeRanking.ts).
  const bargains = useMemo(
    () => ranking.offers.filter((scored) => scored.band === 'optimum'),
    [ranking.offers],
  );
  const addBargains = (): void => {
    setSelected((current) => {
      const next = new Set(current);
      for (const scored of bargains) next.add(scored.listing.productId);
      return next;
    });
  };

  const listRef = useRef<FlashListRef<(typeof rows)[number]>>(null);
  const [farDown, setFarDown] = useState(false);
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
          ref={listRef}
          onScroll={(event) => {
            const down = event.nativeEvent.contentOffset.y > SHOW_TOP_BUTTON_AFTER;
            setFarDown((current) => (current === down ? current : down));
          }}
          scrollEventThrottle={100}
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
                <ArenaButton
                  label={words.plan}
                  accessibilityLabel={words.planA11y}
                  variant="secondary"
                  disabled={market.listings.length === 0}
                  onPress={() => setPlanning(true)}
                  testID="upgrade-plan"
                />
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
                {bargains.length === 0 ? null : (
                  <ArenaButton
                    label={words.addBargains(bargains.length)}
                    accessibilityLabel={words.addBargainsA11y(bargains.length)}
                    variant="secondary"
                    onPress={addBargains}
                    testID="upgrade-add-bargains"
                  />
                )}
                <SortChip
                  label={words.ceilings}
                  accessibilityLabel={words.ceilingsA11y}
                  selected={showCeilings}
                  onPress={() => setShowCeilings((current) => !current)}
                  testID="upgrade-ceilings-toggle"
                />
                <SortChip
                  label={words.bargains}
                  accessibilityLabel={words.bargainsA11y}
                  selected={showBargains}
                  onPress={() => setShowBargains((current) => !current)}
                  testID="upgrade-bargains-toggle"
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
                      placeholder={formatNcg(ceilingAt(GRADE_RANGES[g]!, new Date()))}
                      hint={words.ceilingHint(formatNcg(ceilingAt(GRADE_RANGES[g]!, new Date())))}
                      testID={`upgrade-ceiling-${g}`}
                    />
                  ))
                : null}
              {showBargains
                ? CEILING_GRADES.filter((g) => grades.includes(g)).map((g) => (
                    <FormField
                      key={g}
                      label={words.bargainLabel(g)}
                      value={bargainText[g] ?? ''}
                      onChangeText={(text) =>
                        setBargainText((current) => ({ ...current, [g]: text }))
                      }
                      placeholder={formatNcg(GRADE_RANGES[g]!.optimum)}
                      hint={words.bargainHint(formatNcg(GRADE_RANGES[g]!.optimum))}
                      testID={`upgrade-bargain-${g}`}
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
        {farDown ? (
          <View style={styles.toTop} pointerEvents="box-none">
            <ArenaButton
              label={words.toTop}
              accessibilityLabel={words.toTopA11y}
              variant="secondary"
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              testID="upgrade-to-top"
            />
          </View>
        ) : null}
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
        {planning ? (
          <PlannerSheet
            base={base}
            levels={levels}
            catalog={catalog}
            costs={costs}
            offers={plannerOffers}
            onSelect={(ids) => setSelected(new Set(ids))}
            onClose={() => setPlanning(false)}
          />
        ) : null}
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
  toTop: { position: 'absolute', right: layout.screenGutter, bottom: space[16] },
  bar: {
    paddingHorizontal: layout.screenGutter,
    paddingVertical: space[12],
    gap: space[4],
    backgroundColor: color.raised,
    borderTopWidth: 1,
    borderTopColor: color.decorative.hairline,
  },
});
