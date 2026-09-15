/**
 * The same fold as `core/model`'s `foldPlayerName` (ADR-0032) — duplicated rather than
 * imported, because no module here may reach into `src/` (ADR-0035). Case folding can move a
 * string between normalisation forms, so the order matters: `.toLowerCase()` before
 * `.normalize('NFC')`, not after.
 */
export const foldPlayerName = (name: string): string => name.trim().toLowerCase().normalize('NFC');
