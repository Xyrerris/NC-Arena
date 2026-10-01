/**
 * The collection tracker (ADR-0044): a section beside the arena that follows the viewer's
 * Nine Chronicles collections.
 *
 * This module may not import core/db or core/network, and may not import another feature. The
 * repository and the live-data runner arrive through `ArenaDataProvider`; the sheet and the
 * section switcher arrive as props from the route.
 */

export { CollectionScreen, type CollectionScreenProps } from './CollectionScreen';
export { useCollection, type CollectionController } from './useCollection';
