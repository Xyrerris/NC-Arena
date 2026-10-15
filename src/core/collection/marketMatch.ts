/**
 * Which listings on the market are the piece a collection asks for, and where to look for them
 * (ADR-0044, "Next: buying").
 *
 * The market service narrows by item id and by nothing else that matters here, so a scan of an
 * item returns every level and every skill state of it, and this file decides which of those a
 * requirement accepts. The rule is lib9c's `CollectionSheet.Requirement.Validate`: same item id,
 * same level, and a skill — ordinary or buff — present when `SkillContains` is true and absent
 * when it is false. The element is not a separate test: it is part of the id.
 */

import type { MarketListing } from '../common';
import type { CollectionRequirement } from './collectionSheet';
import type { EquipmentCatalog } from './equipmentCatalog';
import type { OtherItemCatalog } from './otherItems';

/** Whether one listing is a piece this requirement accepts. */
export const listingMatches = (
  requirement: CollectionRequirement,
  listing: MarketListing,
): boolean =>
  listing.itemId === requirement.itemId &&
  listing.level === requirement.level &&
  listing.hasSkill === requirement.skillContains;

/**
 * The listings a requirement accepts, cheapest first. The tie-breakers make the order total, so
 * two reads of the same market show the same list: the unit price first (a lot of five at 2 each
 * is cheaper than one at 3, whatever the lot costs in all), then the whole price, more combat
 * point first (the same price for a stronger piece is the better offer), then the listing id.
 */
export const matchingListings = (
  requirement: CollectionRequirement,
  listings: readonly MarketListing[],
): readonly MarketListing[] =>
  listings
    .filter((listing) => listingMatches(requirement, listing))
    .sort(
      (a, b) =>
        a.unitPrice - b.unitPrice ||
        a.price - b.price ||
        b.combatPoint - a.combatPoint ||
        a.productId.localeCompare(b.productId),
    );

/**
 * Where to look for a requirement's piece.
 *
 * - `route`: the market service sells it, and this is the route (lib9c's `ItemSubType` number)
 *   the scan goes through.
 * - `not-sold`: the piece exists but the market has no listings of its kind — Aura and Grimoire
 *   answered nothing for any item tried on 2026-10-15 — so there is nothing to scan and the sheet
 *   says so instead of reporting an empty market.
 * - `unknown`: neither catalog knows the item, or its sub type is one this file has not been told
 *   about (about 70 items are in no sheet). Not "not sold": it is not known.
 */
export type MarketRoute =
  | { readonly kind: 'route'; readonly itemSubType: number }
  | { readonly kind: 'not-sold' }
  | { readonly kind: 'unknown' };

/** lib9c's `ItemSubType` numbers for the equipment the market service sells, by the sheet's names. */
const ROUTES: Readonly<Record<string, number>> = {
  Weapon: 6,
  Armor: 7,
  Belt: 8,
  Necklace: 9,
  Ring: 10,
};

/**
 * The routes of the rest, by the item sheets' names, found on Heimdall on 2026-10-15 by asking
 * each route for one known item of the kind: a costume answers at 1, a title at 18, a food at 0,
 * equipment material at 11, an hourglass at 15 and an AP stone at 16. Other kinds the sheets name
 * (`FoodMaterial`, `NormalMaterial`...) answered on no route tried, so they are not listed: they
 * stay `unknown` rather than be called "not sold" on one afternoon's probe.
 */
const OTHER_ROUTES: Readonly<Record<string, number>> = {
  Food: 0,
  FullCostume: 1,
  EquipmentMaterial: 11,
  Hourglass: 15,
  ApStone: 16,
  Title: 18,
};

const NOT_SOLD: ReadonlySet<string> = new Set(['Aura', 'Grimoire']);

const NO_OTHER_ITEMS: OtherItemCatalog = new Map();

export const marketRouteFor = (
  requirement: CollectionRequirement,
  catalog: EquipmentCatalog,
  others: OtherItemCatalog = NO_OTHER_ITEMS,
): MarketRoute => {
  const info = catalog.get(requirement.itemId);
  if (info === undefined) {
    const other = others.get(requirement.itemId);
    const route = other === undefined ? undefined : OTHER_ROUTES[other.subType];
    return route === undefined ? { kind: 'unknown' } : { kind: 'route', itemSubType: route };
  }
  const route = ROUTES[info.subType];
  if (route !== undefined) return { kind: 'route', itemSubType: route };
  return NOT_SOLD.has(info.subType) ? { kind: 'not-sold' } : { kind: 'unknown' };
};
