import { trackerData } from "#lib/data/index.js";

/**
 * Game IDs real saves hold that the tracker deliberately doesn't track, reviewed against the v1.0.8
 * `fiddle` data. Save extraction counts them as known-but-untracked, so they never make a field
 * `unknown`; an ID in neither tracker data nor here is unrecognized. `import-save.assets.test.ts`
 * fails when a real save holds an unrecognized ID, which prompts a review of this list.
 */
const UNTRACKED_ITEMS = new Set([
  // `items/other/misc.toml`: the token items that unlock a cosmetic when used.
  "animal_cosmetic",
  "cosmetic",
  "pet_cosmetic",
]);

const UNTRACKED_PERKS = new Set([
  // `perks.toml`: the Mistmare's perks, which no skill's perk tiers list.
  "harvest_horse",
  "horsepower",
  "nice_ride",
]);

/** Treasure chests (`fish/misc/treasure_box_<tier>`) are tracked as tiers, not as items. */
const TREASURE_BOX_ITEMS = new Set(
  Object.keys(trackerData.treasureChestTiers).map((tier) => `treasure_box_${tier}`),
);

/** Whether a save item ID is a game item, tracked or not. */
export function isKnownItemId(id: string): boolean {
  return (
    Object.hasOwn(trackerData.items, id) || UNTRACKED_ITEMS.has(id) || TREASURE_BOX_ITEMS.has(id)
  );
}

/** Whether a save perk ID is a game perk the tracker leaves out of its skill tiers. */
export function isUntrackedPerkId(id: string): boolean {
  return UNTRACKED_PERKS.has(id);
}
