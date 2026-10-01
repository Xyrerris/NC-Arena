/**
 * Words and shapes for the "your Nine Chronicles avatar" block (ADR-0044).
 *
 * Kept apart from the component so the sentences can be read, and tested, without rendering.
 */

import { PLANETS, type Planet, type ViewerAvatar } from '@/core/model';

export const SECTION_TITLE = 'Your Nine Chronicles avatar';

export const SECTION_HINT =
  'Used to track your collection. It follows who you are: choosing somebody else clears it.';

export const ADDRESS_LABEL = 'Avatar address';
export const ADDRESS_PLACEHOLDER = '0x…';
export const ADDRESS_HINT = '0x followed by 40 characters, as shown by the game or an explorer.';
export const ADDRESS_ERROR = 'That is not an avatar address: it is 0x followed by 40 hex digits.';
export const SAVE_LABEL = 'SAVE AVATAR';
export const SAVED_NOTE = 'Saved. It reaches your account on the next refresh.';
export const NO_VIEWER_ERROR = 'Choose who you are first.';

export const PLANET_LABEL: Record<Planet, string> = {
  odin: 'Odin',
  heimdall: 'Heimdall',
  thor: 'Thor',
};

export const PLANET_CHOICES: readonly Planet[] = PLANETS;

/** `heimdall · 0x1023…b41f`, short enough for one line at any font scale. */
export const describeAvatar = (avatar: ViewerAvatar): string =>
  `${PLANET_LABEL[avatar.planet]} · ${avatar.address.slice(0, 6)}…${avatar.address.slice(-4)}`;

export type ViewerAvatarUiState =
  { kind: 'idle' } | { kind: 'saved' } | { kind: 'failed'; message: string };
