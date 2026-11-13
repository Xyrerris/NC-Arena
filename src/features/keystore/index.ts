/**
 * Importing a Nine Chronicles keystore and checking that a passphrase opens it (ADR-0044, step B).
 *
 * A feature of its own, rendered by the `/me` route beside the avatar block: a keystore is not part
 * of editing a player, and ARCHITECTURE.md §4 forbids a feature reaching into another, so the route
 * is where they meet. It reads the avatar's account through `ArenaData` rather than from the
 * avatar feature. Nothing here signs or buys.
 */

export { KeystoreSection } from './KeystoreSection';
export { useKeystore, type KeystoreController, type ProofState } from './useKeystore';
