/**
 * The avatar block's ViewModel-as-a-hook (ARCHITECTURE.md §8).
 *
 * It reads and writes through the repository only: this feature may not reach the network, so
 * checking the address against a node is not something it can do (ADR-0044 leaves that to a
 * port in `core/data`). What it can do is the cheap half — shape — and refuse an address that
 * could never be one.
 */

import { useCallback, useState } from 'react';

import { useArenaData, useViewerAvatar, useViewerId } from '@/core/data';
import { normaliseAvatarAddress, type Planet } from '@/core/model';

import { ADDRESS_ERROR, NO_VIEWER_ERROR, type ViewerAvatarUiState } from './viewerAvatarUiState';

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
}

export const useViewerAvatarForm = (): ViewerAvatarFormController => {
  const { repository } = useArenaData();
  const viewerId = useViewerId();
  const avatar = useViewerAvatar();

  const [planet, setPlanet] = useState<Planet>(avatar?.planet ?? DEFAULT_PLANET);
  const [address, setAddress] = useState(avatar?.address ?? '');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [state, setState] = useState<ViewerAvatarUiState>({ kind: 'idle' });

  const onPlanet = useCallback((next: Planet) => {
    setPlanet(next);
    setState({ kind: 'idle' });
  }, []);

  const onAddress = useCallback((text: string) => {
    setAddress(text);
    setAddressError(null);
    setState({ kind: 'idle' });
  }, []);

  const onSave = useCallback(() => {
    const normalised = normaliseAvatarAddress(address);
    if (normalised === null) {
      setAddressError(ADDRESS_ERROR);
      return;
    }
    const result = repository.setViewerAvatar({ planet, address: normalised });
    if (!result.ok) {
      setState({ kind: 'failed', message: NO_VIEWER_ERROR });
      return;
    }
    // Show the form the way it was stored, so a pasted checksum address reads back the same
    // as the one the roster will send.
    setAddress(normalised);
    setState({ kind: 'saved' });
  }, [address, planet, repository]);

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
  };
};
