/**
 * Which Nine Chronicles avatar the viewer plays (ADR-0044).
 *
 * A feature of its own, rendered by the `/me` route beside the roster backup: an avatar
 * address is not part of editing a player, and ARCHITECTURE.md §4 forbids a feature reaching
 * into another, so the route is where they meet. This module may not import core/db or
 * core/network; the repository arrives through `ArenaDataProvider`.
 */

export { ViewerAvatarSection } from './ViewerAvatarSection';
export { useViewerAvatarForm, type ViewerAvatarFormController } from './useViewerAvatarForm';
export { describeAvatar } from './viewerAvatarUiState';
