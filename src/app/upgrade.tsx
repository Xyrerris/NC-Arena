import { SectionTabs } from '@/features/sectionTabs';
import { UpgradeScreen } from '@/features/upgrade';

/**
 * Upgrade route: equipment to buy as material for raising another piece, ranked by NCG per Gexp.
 *
 * It hands the screen nothing but the section switcher. The screen loads the sheets itself
 * (`ArenaData.sheets`) and reads the market only when asked.
 */
export default function UpgradeRoute() {
  return <UpgradeScreen sectionTabs={<SectionTabs current="upgrade" />} />;
}
