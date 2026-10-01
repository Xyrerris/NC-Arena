import { SAMPLE_SHEET_CSV, parseCollectionSheet } from '@/core/collection';
import { CollectionScreen } from '@/features/collection';
import { SectionTabs } from '@/features/sectionTabs';

/**
 * Collection route (ADR-0044): the tracker beside the arena.
 *
 * **Placeholder sheet.** The real collection list is not bundled yet — doing so is a licence
 * decision that belongs to the owner (ADR-0044, "Where item names are") — so the route hands the
 * screen the invented one and tells it to say so. Parsed once at module load: it is six rows
 * today and a few hundred kilobytes of text once the real one lands, and either way it is not
 * something to redo on every render.
 *
 * When the real sheet exists, this file is the only place that changes: swap the constant, drop
 * `sampleData`, delete `sampleSheet.ts`.
 */
const SHEET = parseCollectionSheet(SAMPLE_SHEET_CSV);

export default function CollectionRoute() {
  return (
    <CollectionScreen sheet={SHEET} sampleData sectionTabs={<SectionTabs current="collection" />} />
  );
}
