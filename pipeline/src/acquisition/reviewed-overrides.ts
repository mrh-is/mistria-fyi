import { canonicalSourceJson } from "./source-accumulator.js";

import type { ActivityId, MonsterId, Source, StationId } from "$lib/types/acquisition.js";
import type {
  CosmeticId,
  FestivalId,
  ItemId,
  MinesBiomeId,
  NpcId,
  PerkId,
  QuestId,
  StoreId,
} from "$lib/types/tracker-data.js";
import type { TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

export interface OverrideDiagnostic {
  kind: "missing-target" | "obsolete-override";
  message: string;
  namespace: "cosmetics" | "items";
  targetId: string;
}

// Wiki: https://fieldsofmistria.wiki.gg/wiki/Void_Cake
// Void Cake is a conditional dialogue reward in "The Dragonsworn Tablet" quest. The player
// receives it by repeatedly refusing to raise friendship with Eiland when speaking to the Priestess.
// No native data table encodes this acquisition path.
export const ITEM_OVERRIDES: Partial<Record<ItemId, Source[]>> = {
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Void_Cake
  // Void Cake is a conditional dialogue reward in "The Dragonsworn Tablet" quest. The player
  // receives it by repeatedly refusing to raise friendship with Eiland when speaking to the
  // Priestess. No native data table encodes this acquisition path.
  ["void_cake" as ItemId]: [
    {
      type: "quest" as const,
      questId: "the_dragonsworn_tablet" as QuestId,
      trigger: "dialogue_choice" as const,
    },
  ],

  ["dragon_mosaic_flooring" as ItemId]: [{ type: "wishing_well" as const, cost: 100 }],
  // --- Dragon set furniture: Wishing well (commented out in wishing_well.toml) ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Wishing_Well
  // These two dragon set items are tagged dragon_wishing_well_set but are commented out in
  // wishing_well.toml's large_roll. The tag is evidence of intended acquisition path; the
  // items are present in the almanac and have full descriptions.
  ["dragon_relief_wallpaper" as ItemId]: [{ type: "wishing_well" as const, cost: 100 }],

  // --- Pirate set furniture: Wishing well rewards ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Wishing_Well
  // The pirate set items are obtainable from the Wishing Well. The native data only stores
  // price configuration; the reward pool is not encoded in the static game data.
  ...Object.fromEntries(
    [
      "pirate_wall_flag_v1",
      "pirate_wall_flag_v2",
      "pirate_ship_in_a_bottle_v1",
      "pirate_ship_in_a_bottle_v2",
      "pirate_counterfeit_gold_pile_v1",
      "pirate_counterfeit_gold_pile_v2",
      "pirate_anchor_v1",
      "pirate_anchor_v2",
      "pirate_nautical_compass_v1",
      "pirate_nautical_compass_v2",
      "mournful_clown_painting",
    ].map((id) => [id as ItemId, [{ type: "wishing_well" as const, cost: 100 }]]),
  ),

  // --- Dingy set furniture: Lost and Found chest ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Lost_and_Found
  // The dingy set furniture items appear in the Lost and Found chest after completing the
  // "Lost and Found" story quest. The chest refills weekly; these items are not encoded as
  // rewards in any native data table.
  ...Object.fromEntries(
    [
      "dingy_flooring_v1",
      "dingy_flooring_v2",
      "dingy_wallpaper_v1",
      "dingy_wallpaper_v2",
      "dingy_rug_v1",
      "dingy_rug_v2",
      "dingy_table_v1",
      "dingy_table_v2",
      "dingy_chair_v1",
      "dingy_chair_v2",
      "dingy_couch_v1",
      "dingy_couch_v2",
      "dingy_window_v1",
      "dingy_window_v2",
      "dingy_string_lights_v1",
      "dingy_string_lights_v2",
      "dingy_broken_plate_v1",
      "dingy_broken_plate_v2",
      "dingy_broken_bottle_v1",
      "dingy_broken_bottle_v2",
      "dingy_chipped_cup_v1",
      "dingy_chipped_cup_v2",
      "dingy_pile_of_newspapers_v1",
      "dingy_pile_of_newspapers_v2",
      "dingy_pile_of_laundry_v1",
      "dingy_pile_of_laundry_v2",
      "dingy_garbage_bag_v1",
      "dingy_garbage_bag_v2",
      "dingy_mouse_hole_v1",
      "dingy_mouse_hole_v2",
    ].map((id) => [
      id as ItemId,
      [
        {
          type: "lost_and_found" as const,
          visibility: {
            type: "questCompleted" as const,
            questId: "lost_and_found" as QuestId,
          },
        },
      ],
    ]),
  ),

  // --- Station products: Apiary & Terrarium outputs ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Apiary
  // Honey variants are produced by apiaries with different bee populations. The native data
  // defines the apiary as a craftable object but does not encode station→product mappings.
  ...Object.fromEntries(
    ["honeycomb", "honey_premium", "honey_deluxe", "honey_legendary"].map((id) => [
      id as ItemId,
      [{ type: "station" as const, stationId: "apiary" as StationId }],
    ]),
  ),
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Terrarium
  // Bug pheromones and fish bait are produced by terrariums. Same encoding gap as apiaries.
  ...Object.fromEntries(
    [
      "bug_pheromone_common",
      "bug_pheromone_uncommon",
      "bug_pheromone_rare",
      "bug_pheromone_legendary",
      "fish_bait_common",
      "fish_bait_uncommon",
      "fish_bait_rare",
    ].map((id) => [
      id as ItemId,
      [{ type: "station" as const, stationId: "terrarium" as StationId }],
    ]),
  ),

  // --- Herb & flower seeds: obtained by foraging the parent crop ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Seeds
  // Herb and flower seeds drop when foraging their parent crop. The native data defines
  // crop_object linkage but does not encode the reverse seed-acquisition path.
  ...Object.fromEntries(
    [
      "seed_basil",
      "seed_chickpea",
      "seed_dill",
      "seed_iris",
      "seed_lilac",
      "seed_marigold",
      "seed_night_queen",
      "seed_oregano",
      "seed_sage",
      "seed_thyme",
      "seed_garlic",
      "seed_heather",
      "seed_moon_fruit",
      "seed_rosemary",
      "seed_viola",
      "seed_burdock_root",
      "seed_jasmine",
      "seed_snapdragon",
      "seed_mystery_bag",
    ].map((id) => [id as ItemId, [{ type: "forage" as const }]]),
  ),

  // --- Quest rewards not encoded in native reward arrays ---
  // breath_of_spring: Spring Festival quest reward
  ["breath_of_spring" as ItemId]: [
    {
      type: "festival" as const,
      availability: { type: "season" as const, seasons: ["spring"] },
      festivalId: "spring" as FestivalId,
    },
  ],
  // haydens_weathervane: Quest reward from "Find the Weathervane"
  ["haydens_weathervane" as ItemId]: [
    { type: "quest", questId: "find_the_weathervane" as QuestId, trigger: "completion" as const },
  ],
  // heros_ring: Given in Adeline's 8-heart cutscene
  ["heros_ring" as ItemId]: [{ type: "proposal" as const, npcId: "adeline" as NpcId }],
  // maples_drawing: Given in mistril_rank cutscene (Maple draws the Aldarian Star)
  ["maples_drawing" as ItemId]: [{ type: "renown" as const, level: 10 }],
  // mistril_star_trophy: Given in mistril_rank cutscene
  ["mistril_star_trophy" as ItemId]: [{ type: "renown" as const, level: 10 }],
  // star_brooch: Given in shooting_star_morning cutscene
  ["star_brooch" as ItemId]: [
    {
      type: "festival" as const,
      availability: { type: "season" as const, seasons: ["summer"] },
      festivalId: "shooting_star" as FestivalId,
    },
  ],
  // star_shaped_cookie: Given in shooting_star_reina cutscene
  ["star_shaped_cookie" as ItemId]: [
    {
      type: "festival" as const,
      availability: { type: "season" as const, seasons: ["summer"] },
      festivalId: "shooting_star" as FestivalId,
    },
  ],

  ["dollhouse_bench" as ItemId]: [
    { type: "quest", questId: "park_date_unlock" as QuestId, trigger: "completion" as const },
  ],
  // --- Date inspiration items: unlocked through heart events ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Dates
  // Date inspiration items unlock new date activities. inn_menu is given in Elsie's dating
  // tutorial cutscene. Others are unlocked through heart level progression with NPCs.
  // No native reward array encodes these; the dating system handles them at runtime.
  ["inn_menu" as ItemId]: [
    { type: "quest", questId: "elsies_dating_tutorial" as QuestId, trigger: "completion" as const },
  ],
  ["lovely_seashell" as ItemId]: [
    { type: "quest", questId: "beach_date_unlock" as QuestId, trigger: "completion" as const },
  ],
  ["rough_gemstone" as ItemId]: [
    {
      type: "quest",
      questId: "gem_cutting_date_unlock" as QuestId,
      trigger: "completion" as const,
    },
  ],

  // --- Cooked dishes without recipe: inn-only or event-only foods ---
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Cooking
  // These cooked dishes have no recipe in the crafting system. They are either purchased at the
  // inn, given as quest rewards, or are festival-specific items.
  ["harvest_day_pie" as ItemId]: [
    {
      type: "festival" as const,
      availability: { type: "season" as const, seasons: ["fall"] },
      festivalId: "harvest" as FestivalId,
    },
  ],
  // Inn-prepared dishes: made by NPCs at the inn, not player-craftable
  ...Object.fromEntries(
    [
      "dragon_horn_mushroom_with_thyme",
      "bucket_brew",
      "mint_gimlet",
      "heavy_mist",
      "humble_pie",
      "confiscated_coffee",
      "pbm_sandwich",
      "pbjt_sandwich", // cspell:disable-line
      "nachos",
      "honey_toast",
      "dark_chocolate",
      "milk_chocolate",
      "white_chocolate",
      "tesserae_cake",
      "soup_of_the_day",
      "soup_of_the_day_gold",
    ].map((id) => [id as ItemId, [{ type: "store" as const, storeId: "inn" as StoreId }]]),
  ),

  // dragon_horn_mushroom: Mine forageable in the Ancient Ruins biome
  ["dragon_horn_mushroom" as ItemId]: [
    { type: "mine" as const, biomeId: "ancient_ruins" as MinesBiomeId },
  ],
  // void_powder: Dropped by void monsters in the Ancient Ruins biome
  ["void_powder" as ItemId]: [{ type: "monster" as const, monsterId: "void_cat" as MonsterId }],
  // --- Mine & exploration items ---
  // void_stone: Mine drop from the Ancient Ruins biome, also quest item
  ["void_stone" as ItemId]: [{ type: "mine" as const, biomeId: "ancient_ruins" as MinesBiomeId }],

  // --- Monster drops ---
  // mob_coin, medium_mob_coin, large_mob_coin: Currency dropped by mine monsters
  ...Object.fromEntries(
    ["mob_coin", "medium_mob_coin", "large_mob_coin", "tree_coin"].map((id) => [
      id as ItemId,
      [{ type: "monster" as const, monsterId: "any" as MonsterId }],
    ]),
  ),
  // bomb: Dropped by monsters and craftable
  ["bomb" as ItemId]: [{ type: "monster" as const, monsterId: "any" as MonsterId }],
  // pet_skin_mimic: Dropped by mimics in the mines
  ["pet_skin_mimic" as ItemId]: [{ type: "monster" as const, monsterId: "mimic" as MonsterId }],

  // --- Quest-specific items ---
  // These items are given during specific quests or cutscenes. The native data encodes the
  // quest/cutscene but not the item reward in the rewards array.
  ["heart_crystal" as ItemId]: [
    { type: "quest", questId: "break_water_seal" as QuestId, trigger: "completion" as const },
  ],
  ["mystical_feather" as ItemId]: [
    { type: "quest", questId: "great_bird_0" as QuestId, trigger: "completion" as const },
  ],
  ["sealing_scroll" as ItemId]: [
    { type: "quest", questId: "breaking_the_fire_seal" as QuestId, trigger: "completion" as const },
  ],
  ["song_crystal_another_tower" as ItemId]: [
    { type: "quest", questId: "another_tower" as QuestId, trigger: "completion" as const },
  ],

  // magic_key: Grown from seed_magic_key
  ["magic_key" as ItemId]: [{ type: "crop" as const, seedItemId: "seed_magic_key" as ItemId }],
  // --- Miscellaneous items ---
  // seed_magic_key: Quest-specific seed planted in the Priestess Chamber Field
  ["seed_magic_key" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  // void_newt: Material from the Ancient Ruins biome
  ["void_newt" as ItemId]: [{ type: "mine" as const, biomeId: "ancient_ruins" as MinesBiomeId }],
  // void_set_scroll_bundle: Obtained from void monsters in Ancient Ruins
  ["void_set_scroll_bundle" as ItemId]: [
    { type: "monster" as const, monsterId: "any" as MonsterId },
  ],

  ["adept_kitchen" as ItemId]: [
    {
      type: "upgrade" as const,
      storeId: "carpenter" as StoreId,
      upgradeName: "adept_kitchen",
    },
  ],
  ["cozy_kitchen" as ItemId]: [
    {
      type: "upgrade" as const,
      storeId: "carpenter" as StoreId,
      upgradeName: "cozy_kitchen",
    },
  ],

  // --- Festival items ---
  // dough_lad_doll: Festival item from the Harvest Festival
  ["dough_lad_doll" as ItemId]: [
    {
      type: "festival" as const,
      availability: { type: "season" as const, seasons: ["fall"] },
      festivalId: "harvest" as FestivalId,
    },
  ],
  // lopsided_animal: Festival activity prize (animal contest consolation)
  ["lopsided_animal" as ItemId]: [
    {
      type: "festival_activity" as const,
      activityId: "animal_contest" as ActivityId,
      festivalId: "animal" as FestivalId,
    },
  ],

  ["abyssal_chest" as ItemId]: [
    { type: "mine" as const, biomeId: "ancient_ruins" as MinesBiomeId },
  ],
  // --- Quest/story items without user-facing acquisition path ---
  // These items exist in the items registry but are obtained through story progression,
  // cutscenes, or special interactions that aren't encoded in reward arrays.
  ["axe_worn" as ItemId]: [{ type: "default" as const }],
  ["balors_crate" as ItemId]: [
    { type: "quest", questId: "balors_crate" as QuestId, trigger: "completion" as const },
  ],
  ["clay_key" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["construction_fence" as ItemId]: [{ type: "default" as const }],
  ["crafting_scroll" as ItemId]: [{ type: "default" as const }],
  ["dragonsworn_chest_and_pants" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["dragonsworn_greaves" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["dragonsworn_helmet" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["dungeon_fountain_health" as ItemId]: [{ type: "default" as const }],
  ["dungeon_fountain_stamina" as ItemId]: [{ type: "default" as const }],
  ["earth_tablet_rubbing" as ItemId]: [
    { type: "quest", questId: "break_earth_seal" as QuestId, trigger: "completion" as const },
  ],
  ["fake_essence" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["fire_tablet_rubbing" as ItemId]: [
    { type: "quest", questId: "break_fire_seal" as QuestId, trigger: "completion" as const },
  ],
  ["mist_held_item" as ItemId]: [{ type: "perk" as const, perkId: "mist_sight" as PerkId }],
  ["purse" as ItemId]: [{ type: "default" as const }],
  ["recipe_scroll" as ItemId]: [{ type: "default" as const }],
  ["ruins_tablet_rubbing" as ItemId]: [
    { type: "quest", questId: "break_ruins_seal_pt_3" as QuestId, trigger: "completion" as const },
  ],
  ["ryis_lumber" as ItemId]: [
    { type: "quest", questId: "ryis_lumber" as QuestId, trigger: "completion" as const },
  ],
  ["unknown_item" as ItemId]: [{ type: "default" as const }],
  ["unusual_seed" as ItemId]: [
    { type: "quest", questId: "the_dragonsworn_tablet" as QuestId, trigger: "completion" as const },
  ],
  ["water_tablet_rubbing" as ItemId]: [
    { type: "quest", questId: "break_water_seal" as QuestId, trigger: "completion" as const },
  ],
  ["world_fountain" as ItemId]: [{ type: "default" as const }],
};

// Wiki: https://fieldsofmistria.wiki.gg/wiki/Dragon_Cleric_Set
// The Dragon Cleric set (Diadem, Earrings, Robes, Boots, Cape) is obtained from the Ritual
// Chamber in the mines. The Ritual Chamber becomes accessible after unlocking the Lost to History
// perk. No native acquisition table encodes these rewards.
export const COSMETIC_OVERRIDES: Partial<Record<CosmeticId, Source[]>> = {
  ["back_gear_dragon_cleric_cape" as CosmeticId]: [
    { type: "ritual_chamber" as const, perkId: "lost_to_history" as PerkId },
  ],
  ["face_gear_dragon_cleric_earrings" as CosmeticId]: [
    { type: "ritual_chamber" as const, perkId: "lost_to_history" as PerkId },
  ],
  ["head_dragon_cleric_diadem" as CosmeticId]: [
    { type: "ritual_chamber" as const, perkId: "lost_to_history" as PerkId },
  ],
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Mimic
  // The Mimic Hat drops from feeding mimics in the mines. The native data has no drops or
  // feed_reward table for mimics; the reward appears to be determined at runtime.
  ["head_mimic_hat" as CosmeticId]: [
    { type: "monster_feed" as const, monsterId: "mimic" as MonsterId },
  ],
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Wishing_Well
  // Soup Pot Hat and Teapot Hat are obtainable from the Wishing Well. The native data only stores
  // price configuration; the reward pool is not encoded in the static game data.
  ["head_soup_pot" as CosmeticId]: [{ type: "wishing_well" as const, cost: 100 }],
  ["head_teapot" as CosmeticId]: [{ type: "wishing_well" as const, cost: 100 }],
  ["robe_dragon_cleric" as CosmeticId]: [
    { type: "ritual_chamber" as const, perkId: "lost_to_history" as PerkId },
  ],
  ["shoes_boots_dragon_cleric" as CosmeticId]: [
    { type: "ritual_chamber" as const, perkId: "lost_to_history" as PerkId },
  ],
};

export function applyReviewedOverrides(
  items: Readonly<Record<string, unknown>>,
  cosmetics: Readonly<Record<string, unknown>>,
  itemAccumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
): OverrideDiagnostic[] {
  const diagnostics: OverrideDiagnostic[] = [];

  for (const [targetId, sources] of Object.entries(ITEM_OVERRIDES) as [ItemId, Source[]][]) {
    if (!(targetId in items)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed item override target "${targetId}" not found in item registry`,
        namespace: "items",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = itemAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed item override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "items",
          targetId,
        });
        continue;
      }
      itemAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.items.${targetId}`,
        sourcePath: "pipeline/src/acquisition/reviewed-overrides.ts",
      });
    }
  }

  for (const [targetId, sources] of Object.entries(COSMETIC_OVERRIDES) as [
    CosmeticId,
    Source[],
  ][]) {
    if (!(targetId in cosmetics)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed cosmetic override target "${targetId}" not found in cosmetic registry`,
        namespace: "cosmetics",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = cosmeticAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed cosmetic override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "cosmetics",
          targetId,
        });
        continue;
      }
      cosmeticAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.cosmetics.${targetId}`,
        sourcePath: "pipeline/src/acquisition/reviewed-overrides.ts",
      });
    }
  }

  return diagnostics;
}

const DEFAULT_SOURCE: Source = { type: "default" };

export function collectDefaultCosmeticSources(
  cosmetics: TrackerData["cosmetics"],
  accumulator: CosmeticSourceAccumulator,
): void {
  for (const [id, cosmetic] of Object.entries(cosmetics)) {
    if (cosmetic.sources?.some((src) => src.type === "default")) {
      accumulator.add(id as CosmeticId, DEFAULT_SOURCE, {
        fieldPath: `cosmetics.${id}.default_unlocked`,
        sourcePath: "player_assets.toml",
      });
    }
  }
}

// misc.ari_stats.starting_inventory and misc.ari_stats.starting_armor provide evidence that
// these items are available from the start of the game.
export function collectDefaultItemSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  items: Readonly<Record<string, unknown>>,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const ariStats = misc?.ari_stats as Record<string, unknown> | undefined;

  const startingInventory = ariStats?.starting_inventory;
  if (Array.isArray(startingInventory)) {
    for (const itemId of startingInventory) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_inventory`,
          sourcePath: "misc.toml",
        });
      }
    }
  }

  const startingArmor = ariStats?.starting_armor as Record<string, string> | undefined;
  if (startingArmor) {
    for (const [slot, itemId] of Object.entries(startingArmor)) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_armor.${slot}`,
          sourcePath: "misc.toml",
        });
      }
    }
  }
}
