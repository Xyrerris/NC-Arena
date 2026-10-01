import { RosterScreen } from '@/features/roster';
import { SectionTabs } from '@/features/sectionTabs';

/**
 * Roster route.
 *
 * Thin on purpose (ARCHITECTURE.md §4): the route layer wires and navigates, the feature
 * renders. Everything the screen needs arrives through `ArenaDataProvider` in `_layout`. The
 * one thing composed here is the Arena | Collection switcher (ADR-0044): it belongs to neither
 * section, and a feature may not import another.
 */
export default function RosterRoute() {
  return <RosterScreen sectionTabs={<SectionTabs current="arena" />} />;
}
