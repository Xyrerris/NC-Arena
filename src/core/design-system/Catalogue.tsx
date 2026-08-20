/**
 * Every component, on one screen (ROADMAP.md Phase 1 exit criterion).
 *
 * It exists to be photographed. The values are the seed's largest player, because the
 * failure this catalogue guards against is a 13-character exact value clipping — and that
 * only shows up on the widest number in the data (ARCHITECTURE.md §2.5). Run it at 100 %
 * and at 200 % font scale; nothing may be cut off at either.
 *
 * Formatted through the real `statFormatter` rather than with hand-written strings, so the
 * screenshots exercise the §6 contract instead of a plausible-looking imitation of it.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { statFormatter } from '../common';
import { ArenaText } from './ArenaText';
import { CompareBar } from './CompareBar';
import { RecordBadge } from './RecordBadge';
import { ScreenScaffold } from './ScreenScaffold';
import { SearchField } from './SearchField';
import { SegmentedTabs } from './SegmentedTabs';
import { SortChip } from './SortChip';
import { StatRow } from './StatRow';
import { ViewerCard } from './ViewerCard';
import { color, layout, space } from './tokens';

/** Valkros and Krios, straight out of assets/seed.json. */
const VALKROS = { atk: 2_418_904_113, critBp: 712_043, cp: 3_084_221 };
const KRIOS = { atk: 1_184_530_912, critBp: 584_127, cp: 2_145_880 };

type Sort = 'RANK' | 'COMBAT_POWER' | 'MY_WINS';
type Tab = 'stats' | 'vs';

export function Catalogue() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('RANK');
  const [tab, setTab] = useState<Tab>('stats');

  return (
    <ScreenScaffold>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="ViewerCard">
          <ViewerCard
            testID="catalogue-viewer-card"
            name="Krios"
            combatPowerExact={statFormatter.exact(KRIOS.cp)}
            combatPowerShort={statFormatter.combatPowerShort(KRIOS.cp)}
            rank={9}
            score={1842}
          />
        </Section>

        <Section title="SearchField">
          <SearchField testID="catalogue-search" value={query} onChangeText={setQuery} />
        </Section>

        <Section title="SortChip">
          <View style={styles.chips}>
            <SortChip
              testID="catalogue-chip-rank"
              label="Rank"
              selected={sort === 'RANK'}
              onPress={() => setSort('RANK')}
            />
            <SortChip
              label="CP"
              selected={sort === 'COMBAT_POWER'}
              onPress={() => setSort('COMBAT_POWER')}
            />
            <SortChip
              label="My wins"
              selected={sort === 'MY_WINS'}
              onPress={() => setSort('MY_WINS')}
            />
          </View>
        </Section>

        <Section title="RecordBadge">
          <View style={styles.chips}>
            <RecordBadge wins={8} losses={2} />
            <RecordBadge wins={2} losses={8} />
            <RecordBadge wins={4} losses={4} />
            <RecordBadge wins={0} losses={0} />
          </View>
        </Section>

        <Section title="SegmentedTabs">
          <SegmentedTabs
            testID="catalogue-tabs"
            tabs={[
              { value: 'stats', label: 'Stats' },
              { value: 'vs', label: 'Vs You' },
            ]}
            selected={tab}
            onSelect={setTab}
          />
        </Section>

        <Section title="StatRow — the widest value in the seed">
          <StatRow
            testID="catalogue-stat-row"
            label="ATK"
            exact={statFormatter.exact(VALKROS.atk)}
            short={statFormatter.short(VALKROS.atk, 'BILLIONS')}
          />
          <StatRow
            label="CRIT"
            exact={statFormatter.critExact(VALKROS.critBp)}
            short={statFormatter.critShort(VALKROS.critBp)}
          />
        </Section>

        <Section title="CompareBar">
          <CompareBar
            testID="catalogue-compare-bar"
            label="ATK"
            mine={{
              exact: statFormatter.exact(KRIOS.atk),
              short: statFormatter.short(KRIOS.atk, 'BILLIONS'),
              fraction: KRIOS.atk / VALKROS.atk,
            }}
            theirs={{
              exact: statFormatter.exact(VALKROS.atk),
              short: statFormatter.short(VALKROS.atk, 'BILLIONS'),
              fraction: 1,
            }}
            delta={statFormatter.deltaPercent(KRIOS.atk, VALKROS.atk)}
            opponentAhead
          />
        </Section>

        <Section title="ArenaText — every variant that carries a number">
          <ArenaText variant="numericHero" tone="primary">
            {statFormatter.exact(VALKROS.atk)}
          </ArenaText>
          <ArenaText variant="numericLarge" tone="strong">
            {statFormatter.exact(VALKROS.atk)}
          </ArenaText>
          <ArenaText variant="numericMedium" tone="body">
            {statFormatter.exact(VALKROS.atk)}
          </ArenaText>
          <ArenaText variant="numericSmall" tone="muted">
            {statFormatter.exact(VALKROS.atk)}
          </ArenaText>
          <ArenaText variant="numericTiny" tone="subtle">
            {statFormatter.exact(VALKROS.atk)}
          </ArenaText>
        </Section>
      </ScrollView>
    </ScreenScaffold>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ArenaText variant="labelNano" tone="accent" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ArenaText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: layout.screenGutter,
    gap: space[28],
    backgroundColor: color.backdrop,
  },
  section: { gap: space[10] },
  sectionTitle: { letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[8] },
});
