/**
 * Words and shapes for the "your Nine Chronicles avatar" block (ADR-0044).
 *
 * Kept apart from the component so the sentences can be read, and tested, without rendering.
 */

import type { AvatarIdentity } from '@/core/common';
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

export const CHECKING_NOTE = 'Checking the address…';
export const CONFIRM_QUESTION = 'Is this you?';
export const CONFIRM_LABEL = 'YES, THIS IS ME';
export const CANCEL_LABEL = 'CHANGE';
export const SAVE_UNCHECKED_LABEL = 'SAVE WITHOUT CHECKING';

/** `Xyrerris · level 494` — what the user recognises their own avatar by. */
export const describeIdentity = (identity: AvatarIdentity): string =>
  `${identity.name} · level ${identity.level}`;

export const notFoundMessage = (planet: Planet): string =>
  `No avatar at that address on ${PLANET_LABEL[planet]}. Check the planet and the address.`;

/** Why the address could not be looked up, and that saving it unchecked is still possible. */
export const uncheckedMessage = (reason: 'OFFLINE' | 'FAILED'): string =>
  reason === 'OFFLINE'
    ? 'Could not reach the network to check this address. You can save it anyway.'
    : 'The address could not be checked right now. You can save it anyway.';

export type ViewerAvatarUiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** The chain has an avatar there: shown for the user to say whether it is theirs. */
  | { kind: 'confirm'; avatar: ViewerAvatar; identity: AvatarIdentity }
  /** The chain has nothing there: a wrong planet or a wrong address. Nothing is stored. */
  | { kind: 'notFound'; message: string }
  /** The lookup did not happen. The address is well-formed, so saving it is still the user's call. */
  | { kind: 'unchecked'; avatar: ViewerAvatar; message: string }
  | { kind: 'saved' }
  | { kind: 'failed'; message: string };
