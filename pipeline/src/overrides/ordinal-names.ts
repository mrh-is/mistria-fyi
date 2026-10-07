/** Expected English ordinal localization keys, not acquisition overrides. Native equality is required by Localizer. */
export const BIOME_ENGLISH_NAMES = [
  "Upper Mines",
  "The Tide Caverns",
  "Deep Earth",
  "The Lava Caves",
  "Ancient Ruins",
] as const;
export const RANK_ENGLISH_NAMES = [
  "Wood",
  "Stone",
  "Copper",
  "Ruby",
  "Iron",
  "Sapphire",
  "Silver",
  "Emerald",
  "Gold",
  "Diamond",
  "Mistril",
] as const;

export const SKILL_ENGLISH_NAMES: Readonly<Record<string, string>> = {
  archaeology: "Archaeology",
  blacksmithing: "Blacksmithing",
  combat: "Combat",
  cooking: "Cooking",
  farming: "Farming",
  fishing: "Fishing",
  mining: "Mining",
  ranching: "Ranching",
  woodcrafting: "Woodcrafting",
};
