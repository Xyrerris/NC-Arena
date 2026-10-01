/**
 * The avatar block's ViewModel-as-a-hook (ARCHITECTURE.md §8).
 *
 * Saving is two steps when there is a way to look the address up (ADR-0044): the shape is
 * checked here, the avatar's name is read back through `avatarSource` and shown, and only the
 * user's "yes, that is me" stores it. This feature may not reach the network, so the lookup
 * arrives through `useArenaData()` like the repository does.
 *
 * Nothing is stored while a lookup is in flight or unanswered by the user, and editing the
 * planet or the address drops whatever was found: a name shown for one address must never
 * confirm another.
 */

import { useCallback, useRef, useState } from 'react';

import { useArenaData, useViewerAvatar, useViewerId } from '@/core/data';
import { normaliseAvatarAddress, type Planet, type ViewerAvatar } from '@/core/model';

import {
  ADDRESS_ERROR,
  NO_VIEWER_ERROR,
  notFoundMessage,
  uncheckedMessage,
  type ViewerAvatarUiState,
} from './viewerAvatarUiState';

const DEFAULT_PLANET: Planet = 'heimdall';

export interface ViewerAvatarFormController {
  /** False until somebody is "you" — the avatar belongs to them. */
  hasViewer: boolean;
  avatar: ReturnType<typeof useViewerAvatar>;
  planet: Planet;
  address: string;
  addressError: string | null;
  state: ViewerAvatarUiState;
  onPlanet: (planet: Planet) => void;
  onAddress: (text: string) => void;
  onSave: () => void;
  /** Stores the avatar the chain just described. */
  onConfirm: () => void;
  /** Stores the avatar although it could not be looked up. */
  onSaveUnchecked: () => void;
  /** Drops the lookup and goes back to editing. */
  onCancel: () => void;
}

export const useViewerAvatarForm = (): ViewerAvatarFormController => {
  const { repository, avatarSource } = useArenaData();
  const viewerId = useViewerId();
  const avatar = useViewerAvatar();

  const [planet, setPlanet] = useState<Planet>(avatar?.planet ?? DEFAULT_PLANET);
  const [address, setAddress] = useState(avatar?.address ?? '');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [state, setState] = useState<ViewerAvatarUiState>({ kind: 'idle' });

  // Which lookup the screen is still waiting for. Bumped by anything that makes an in-flight
  // answer stale — a new save, an edit, a cancel — so a slow reply cannot overwrite the form.
  const lookup = useRef(0);

  const reset = useCallback(() => {
    lookup.current += 1;
    setState({ kind: 'idle' });
  }, []);

  const onPlanet = useCallback(
    (next: Planet) => {
      setPlanet(next);
      reset();
    },
    [reset],
  );

  const onAddress = useCallback(
    (text: string) => {
      setAddress(text);
      setAddressError(null);
      reset();
    },
    [reset],
  );

  const store = useCallback(
    (toStore: ViewerAvatar) => {
      const result = repository.setViewerAvatar(toStore);
      if (!result.ok) {
        setState({ kind: 'failed', message: NO_VIEWER_ERROR });
        return;
      }
      // Show the form the way it was stored, so a pasted checksum address reads back the same
      // as the one the roster will send.
      setAddress(toStore.address);
      setState({ kind: 'saved' });
    },
    [repository],
  );

  const onSave = useCallback(() => {
    const normalised = normaliseAvatarAddress(address);
    if (normalised === null) {
      setAddressError(ADDRESS_ERROR);
      return;
    }
    const candidate: ViewerAvatar = { planet, address: normalised };
    if (avatarSource === undefined) {
      store(candidate);
      return;
    }

    const mine = ++lookup.current;
    setState({ kind: 'checking' });
    void avatarSource.readAvatar(candidate).then((read) => {
      if (lookup.current !== mine) return;
      if (!read.ok) {
        setState({
          kind: 'unchecked',
          avatar: candidate,
          message: uncheckedMessage(read.error.reason),
        });
      } else if (read.value === null) {
        setState({ kind: 'notFound', message: notFoundMessage(planet) });
      } else {
        setState({ kind: 'confirm', avatar: candidate, identity: read.value });
      }
    });
  }, [address, avatarSource, planet, store]);

  const onConfirm = useCallback(() => {
    if (state.kind === 'confirm') store(state.avatar);
  }, [state, store]);

  const onSaveUnchecked = useCallback(() => {
    if (state.kind === 'unchecked') store(state.avatar);
  }, [state, store]);

  return {
    hasViewer: viewerId !== null,
    avatar,
    planet,
    address,
    addressError,
    state,
    onPlanet,
    onAddress,
    onSave,
    onConfirm,
    onSaveUnchecked,
    onCancel: reset,
  };
};
