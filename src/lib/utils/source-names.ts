import { getName, getNameTable } from "$lib/data/names.js";
import * as m from "$lib/paraglide/messages.js";

import type { LocaleCode } from "$lib/types/locale.js";
import type { ItemId, PetSkinId, QuestId, TreasureChestTierId } from "$lib/types/tracker-data.js";

type NameMessage = (inputs: Record<string, never>, options: { locale: LocaleCode }) => string;
type VariantMessage = (inputs: { monster: string }, options: { locale: LocaleCode }) => string;

/**
 * Game vocabulary the pipeline doesn't extract yet, so these names are interim machine
 * translations in Paraglide. Replace them with the game's own translation keys once the
 * pipeline reads them from `assets/localization/`.
 */
const LOCATION_MESSAGES: Record<string, NameMessage> = {
  beach: m.source_location_beach,
  deep_woods: m.source_location_deep_woods,
  dungeon: m.source_location_dungeon,
  eastern_road: m.source_location_eastern_road,
  farm: m.source_location_farm,
  haydens_farm: m.source_location_haydens_farm,
  mines: m.source_location_mines,
  narrows: m.source_location_narrows,
  western_ruins: m.source_location_western_ruins,
};

const WATER_MESSAGES: Record<string, NameMessage> = {
  ocean: m.source_water_ocean,
  pond: m.source_water_pond,
  river: m.source_water_river,
};

const VARIANT_MESSAGES = {
  blue: m.source_monster_variant_blue,
  cool: m.source_monster_variant_cool,
  copper: m.source_monster_variant_copper,
  gold: m.source_monster_variant_gold,
  green: m.source_monster_variant_green,
  iron: m.source_monster_variant_iron,
  mistril: m.source_monster_variant_mistril,
  orange: m.source_monster_variant_orange,
  orange_mini: m.source_monster_variant_orange_mini,
  pink: m.source_monster_variant_pink,
  purple: m.source_monster_variant_purple,
  red: m.source_monster_variant_red,
  silver: m.source_monster_variant_silver,
} satisfies Record<string, VariantMessage>;

/**
 * Each monster's family, named by the pet skin the game translates for it, plus the color or
 * material variant that tells family members apart. Monster names themselves only live in the
 * game's translation tables, which the pipeline doesn't extract yet.
 */
const MONSTER_FAMILIES: Record<
  string,
  { family: PetSkinId; variant?: keyof typeof VARIANT_MESSAGES }
> = {
  bat: { family: "essence_bat" as PetSkinId },
  bat_blue: { family: "essence_bat" as PetSkinId, variant: "blue" },
  cat: { family: "void_cat" as PetSkinId },
  cat_void: { family: "void_cat" as PetSkinId },
  copperclod: { family: "oreclod" as PetSkinId, variant: "copper" },
  enchantern: { family: "enchantern" as PetSkinId },
  enchantern_blue: { family: "enchantern" as PetSkinId, variant: "blue" },
  goldclod: { family: "oreclod" as PetSkinId, variant: "gold" },
  griffin_statue: { family: "griffin_statue" as PetSkinId },
  ironclod: { family: "oreclod" as PetSkinId, variant: "iron" },
  mimic: { family: "mimic" as PetSkinId },
  mistrilclod: { family: "oreclod" as PetSkinId, variant: "mistril" },
  mushroom: { family: "mushroom" as PetSkinId },
  mushroom_blue: { family: "mushroom" as PetSkinId, variant: "blue" },
  mushroom_green: { family: "mushroom" as PetSkinId, variant: "green" },
  mushroom_purple: { family: "mushroom" as PetSkinId, variant: "purple" },
  rock_stack: { family: "rock_stack" as PetSkinId },
  rockclod: { family: "rockclod" as PetSkinId },
  rockclod_blue: { family: "rockclod" as PetSkinId, variant: "blue" },
  rockclod_green: { family: "rockclod" as PetSkinId, variant: "green" },
  rockclod_purple: { family: "rockclod" as PetSkinId, variant: "purple" },
  rockclod_red: { family: "rockclod" as PetSkinId, variant: "red" },
  sapling: { family: "sapling" as PetSkinId },
  sapling_blue: { family: "sapling" as PetSkinId, variant: "blue" },
  sapling_cool: { family: "sapling" as PetSkinId, variant: "cool" },
  sapling_orange: { family: "sapling" as PetSkinId, variant: "orange" },
  sapling_orange_mini: { family: "sapling" as PetSkinId, variant: "orange_mini" },
  sapling_pink: { family: "sapling" as PetSkinId, variant: "pink" },
  sapling_purple: { family: "sapling" as PetSkinId, variant: "purple" },
  silverclod: { family: "oreclod" as PetSkinId, variant: "silver" },
  spirit: { family: "flame_spirit" as PetSkinId },
  spirit_purple: { family: "flame_spirit" as PetSkinId, variant: "purple" },
  stalagmite: { family: "stalagmite" as PetSkinId },
  stalagmite_green: { family: "stalagmite" as PetSkinId, variant: "green" },
  stalagmite_purple: { family: "stalagmite" as PetSkinId, variant: "purple" },
  tome: { family: "flying_tome" as PetSkinId },
  void_cat: { family: "void_cat" as PetSkinId },
};

/** Scroll bundle item ids, keyed by the English `bundleName` on `scroll_bundle` sources. */
export const SCROLL_BUNDLE_ITEM_IDS: Record<string, ItemId> = {
  "Chess Piece Scroll Bundle": "chess_scroll_bundle" as ItemId,
  "Fall Crop Sign Scroll Bundle": "fall_crop_sign_scroll_bundle" as ItemId,
  "Lovely Cottage Scroll Bundle": "lovely_cottage_scroll_bundle" as ItemId,
  "Rustic Cabin Scroll Bundle": "rustic_cabin_scroll_bundle" as ItemId,
  "Spring Crop Sign Scroll Bundle": "spring_crop_sign_scroll_bundle" as ItemId,
  "Summer Crop Sign Scroll Bundle": "summer_crop_sign_scroll_bundle" as ItemId,
  "Winter Crop Sign Scroll Bundle": "winter_crop_sign_scroll_bundle" as ItemId,
};

/**
 * The only IDs a generated source may reference without a name. Neither the game nor the pipeline
 * names them: the quests are reviewed runtime-only story beats (cutscenes, items, & flags), and the
 * `abyss` chest tier has no `treasure_box_abyss` item. They render as their title-cased ID until
 * #471 gives them reviewed names; every other missing name throws.
 */
export const UNNAMED_SOURCE_IDS = {
  quests: [
    "another_tower",
    "balors_crate",
    "beach_date_unlock",
    "break_earth_seal",
    "break_fire_seal",
    "break_ruins_seal_pt_3",
    "break_water_seal",
    "elsies_dating_tutorial",
    "gem_cutting_date_unlock",
    "great_bird_0",
    "park_date_unlock",
    "ryis_lumber",
  ] as QuestId[],
  treasureChestTiers: ["abyss"] as TreasureChestTierId[],
};

/** Farm animal names, keyed by animal id (`animals` chunk). */
export function buildAnimalNames(locale: LocaleCode): Partial<Record<string, string>> {
  const table = getNameTable("animals", locale) as Partial<Record<string, string>>;
  return Object.fromEntries(
    Object.entries(table)
      .filter(([key]) => key.endsWith("/core"))
      .map(([key, name]) => [key.slice(0, -"/core".length), name]),
  );
}

/**
 * Localized scroll bundle names keyed by English name. A `scroll_bundle` source carries only the
 * English `bundleName`, not the bundle's item id, so this maps one to the other until the pipeline
 * emits the id itself.
 */
export function buildBundleNames(locale: LocaleCode): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(SCROLL_BUNDLE_ITEM_IDS).map(([name, id]) => [
      name,
      getName("items", id, locale),
    ]),
  );
}

export function buildLocationNames(locale: LocaleCode): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(LOCATION_MESSAGES).map(([id, message]) => [id, message({}, { locale })]),
  );
}

export function buildMonsterNames(locale: LocaleCode): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(MONSTER_FAMILIES).map(([id, { family, variant }]) => {
      const monster = getName("pets/skins", family, locale);
      return [id, variant ? VARIANT_MESSAGES[variant]({ monster }, { locale }) : monster];
    }),
  );
}

/** Placeholder names for {@link UNNAMED_SOURCE_IDS}, identical in every locale. */
export function buildUnnamedSourceNames(ids: readonly string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, titleCase(id)]));
}

export function buildWaterNames(locale: LocaleCode): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(WATER_MESSAGES).map(([id, message]) => [id, message({}, { locale })]),
  );
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
