/**
 * Design system — tokens and shared components.
 *
 * This is also the only module allowed to contain `Platform.select`, so that keeping the
 * app iOS-capable (ARCHITECTURE.md §9.6) never leaks platform forks into feature code, and
 * the only module allowed to write a raw hex colour or a raw spacing number — enforced by
 * `no-restricted-syntax` in eslint.config.js.
 */

export { ArenaText, type ArenaTextProps, type Tone } from './ArenaText';
export { CompareBar, type CompareBarProps } from './CompareBar';
export { RecordBadge, type RecordBadgeProps } from './RecordBadge';
export { ScreenScaffold, screenGutter, type ScreenScaffoldProps } from './ScreenScaffold';
export { SearchField, type SearchFieldProps } from './SearchField';
export { SegmentedTabs, type SegmentedTab, type SegmentedTabsProps } from './SegmentedTabs';
export { SortChip, type SortChipProps } from './SortChip';
export { StatRow, type StatRowProps } from './StatRow';
export { ViewerCard, type ViewerCardProps } from './ViewerCard';

export { color, layout, radius, space, type Radius, type Space } from './tokens';
export { FONTS_BUNDLED, FONT_ASSETS } from './fontAssets';
export {
  REQUIRED_FONT_ASSETS,
  fontAssetName,
  fontFamily,
  lineHeightFor,
  typeScale,
  type TypeRole,
  type TypeStyle,
} from './typography';
export { useArenaFonts, type ArenaFontsState } from './useArenaFonts';
