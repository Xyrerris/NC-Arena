# Checkpoint 4 — decisions (owner, 2026-11-19)

1. **Direction: hybrid B + A.** B's identity (deep green-black, ivory, mint accent, Cinzel limited to the
   wordmark, screen titles and rank numerals, mono numerals) with A's structure (hairline lists, no cards,
   one filled action per screen, quiet underlined tabs, large title that scrolls with the list).
2. **`react-native-svg` approved** for icons. Use the SDK-listed version (15.15.4) installed with
   `npx expo install react-native-svg` (ADR-0003), scheduled with the first implementation group so the dev
   client and the EAS builds are rebuilt once.
3. **Fonts: delegated to me.** Decision: keep the bundled trio, Barlow (text), Cinzel (display, rank), JetBrains
   Mono (numbers); no new font file, no download. The type scale may only use the bundled weights: Cinzel
   500 / 700, Barlow 400–700, JetBrains Mono 400 / 500. The "Apple" quality comes from scale, weight and
   sentence case rather than the typeface. Inter stays a possible later token swap (it would need an OFL
   licence file, a download with the owner's OK, and updates to `fontAssets`, `fontLicenses` and
   `REQUIRED_FONT_ASSETS`).
4. **Bottom navigation bar: Option 1 approved** (docked bar, same `router.replace`, no route moves; see
   `PROPOSAL_bottom_bar.md`). Conditions from the advisor: fixed bar with no transition (`animation: 'none'` on
   the three section routes), hidden while the keyboard is open, honest 200 % behaviour checked on the device.
   Hidden on pushed screens (player, forms, `/me`), as today.

Done 2026-11-19 (evening): `fix/roster-flashlist-2.3.2` merged into `feature/application-design-restyle`
(fast-forward, commit `cdebe44`), so the redesign branch pins FlashList at 2.3.2.
