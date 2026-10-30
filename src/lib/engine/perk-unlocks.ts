import { trackerData } from "#lib/data/index.js";
import { recordEntries } from "#lib/utils/record.js";

import type { Source } from "#lib/types/acquisition.js";
import type { CosmeticId, ItemId, PerkId, RecipeId, TrackerData } from "#lib/types/tracker-data.js";

/**
 * What a perk leads to, by the page that lists it: recipes it teaches, almanac entries (named by
 * their canonical item) it yields, & cosmetics it unlocks. Each list is in tracker-data order.
 */
export interface PerkUnlocks {
  almanac: ItemId[];
  cosmetics: CosmeticId[];
  recipes: RecipeId[];
}

/**
 * The perk a source hands out, for the source types that take one (`perk`, `perk_drop`,
 * `ritual_chamber`, & the `mines_*` sources). A `perkUnlocked` visibility condition only gates a
 * source, so it is not a link.
 */
function sourcePerkId(source: Source): PerkId | undefined {
  return "perkId" in source ? source.perkId : undefined;
}

function perkIdsOf(sources: readonly Source[]): Set<PerkId> {
  const ids = new Set<PerkId>();
  for (const source of sources) {
    const perkId = sourcePerkId(source);
    if (perkId) ids.add(perkId);
  }
  return ids;
}

/**
 * The reverse index from perk ID to the recipes, almanac entries, & cosmetics whose sources
 * reference it. Items outside the almanac have no page to lead to, so they are left out; items
 * that share an almanac entry count once.
 */
export function buildPerkUnlocks(
  data: Pick<TrackerData, "almanac" | "cosmetics" | "items" | "recipes">,
): Map<PerkId, PerkUnlocks> {
  const index = new Map<PerkId, PerkUnlocks>();
  const entryFor = (perkId: PerkId): PerkUnlocks => {
    let unlocks = index.get(perkId);
    if (!unlocks) {
      unlocks = { almanac: [], cosmetics: [], recipes: [] };
      index.set(perkId, unlocks);
    }
    return unlocks;
  };

  const canonicalByItem = new Map<ItemId, ItemId>();
  for (const category of Object.values(data.almanac)) {
    for (const entry of category.items) {
      for (const itemId of entry.itemIds) canonicalByItem.set(itemId, entry.itemIds[0]);
    }
  }

  for (const [recipeId, recipe] of recordEntries(data.recipes)) {
    for (const perkId of perkIdsOf(recipe.sources)) entryFor(perkId).recipes.push(recipeId);
  }
  for (const [cosmeticId, cosmetic] of recordEntries(data.cosmetics)) {
    for (const perkId of perkIdsOf(cosmetic.sources)) entryFor(perkId).cosmetics.push(cosmeticId);
  }
  for (const [itemId, item] of recordEntries(data.items)) {
    const canonicalId = canonicalByItem.get(itemId);
    if (!canonicalId) continue;
    for (const perkId of perkIdsOf(item.sources)) {
      const { almanac } = entryFor(perkId);
      if (!almanac.includes(canonicalId)) almanac.push(canonicalId);
    }
  }
  return index;
}

const perkUnlocks = buildPerkUnlocks(trackerData);

/** What `perkId` unlocks in the shipped tracker data; undefined when nothing links to it. */
export function perkUnlocksFor(perkId: PerkId): PerkUnlocks | undefined {
  return perkUnlocks.get(perkId);
}
