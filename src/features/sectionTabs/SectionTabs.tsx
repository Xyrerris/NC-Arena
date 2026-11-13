/**
 * The switch between the app's sections, Arena, Collection and Upgrade (ADR-0044).
 *
 * A feature of its own, rendered by both routes: the roster and the collection screen are two
 * features and may not import each other (ARCHITECTURE.md §4), and a switcher that lived in
 * either would have to know about the other. `replace` rather than `push`, so flipping between
 * the two does not build a history the back button has to unwind — they are siblings, not a
 * flow.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SegmentedTabs } from '@/core/design-system';

export type Section = 'arena' | 'collection' | 'upgrade';

const sectionTabsStrings = {
  arena: 'ARENA',
  collection: 'COLLECTION',
  upgrade: 'UPGRADE',
  a11y: 'Switch between the arena, your collection and the upgrade material',
} as const;

const TABS: readonly { value: Section; label: string }[] = [
  { value: 'arena', label: sectionTabsStrings.arena },
  { value: 'collection', label: sectionTabsStrings.collection },
  { value: 'upgrade', label: sectionTabsStrings.upgrade },
];

export interface SectionTabsProps {
  current: Section;
}

export function SectionTabs({ current }: SectionTabsProps) {
  const router = useRouter();
  const select = useCallback(
    (next: Section) => {
      if (next === current) return;
      router.replace(next === 'arena' ? '/' : next === 'collection' ? '/collection' : '/upgrade');
    },
    [current, router],
  );

  return (
    <SegmentedTabs
      tabs={TABS}
      selected={current}
      onSelect={select}
      accessibilityLabel={sectionTabsStrings.a11y}
      testID="section-tabs"
    />
  );
}
