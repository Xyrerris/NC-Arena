import { CollectionScreen } from '@/features/collection';
import { SectionTabs } from '@/features/sectionTabs';

/**
 * Collection route (ADR-0044): the tracker beside the arena.
 *
 * It hands the screen nothing but the section switcher. The screen loads the game's sheets itself
 * (`ArenaData.sheets`: lib9c's collection list, Mimir's equipment names) when it opens, so there
 * is no bundled copy here and no placeholder. The invented sheet in `core/collection/sampleSheet`
 * survives only as a fixture for the tests that need six collections small enough to check by hand.
 */
export default function CollectionRoute() {
  return <CollectionScreen sectionTabs={<SectionTabs current="collection" />} />;
}
