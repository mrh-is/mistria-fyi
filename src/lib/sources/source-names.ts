import { getName, getNameTable } from "#lib/data/names.js";
import * as m from "#lib/paraglide/messages.js";
import { recordMap } from "#lib/utils/record.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { PetSkinId, QuestId, TreasureChestTierId } from "#lib/types/tracker-data.js";

type NameMessage = (inputs: Record<string, never>, options: { locale: LocaleCode }) => string;
type VariantMessage = (inputs: { monster: string }, options: { locale: LocaleCode }) => string;

/**
 * Game vocabulary the pipeline doesn't extract yet, so these names are interim machine
 * translations in Paraglide. Replace them with the game's own translation keys once the
 * pipeline reads them from `assets/localization/`.
 */
const LOCATION_MESSAGES = {
  beach: m.source_location_beach,
  deep_woods: m.source_location_deep_woods,
  dungeon: m.source_location_dungeon,
  eastern_road: m.source_location_eastern_road,
  farm: m.source_location_farm,
  haydens_farm: m.source_location_haydens_farm,
  mines: m.source_location_mines,
  narrows: m.source_location_narrows,
  western_ruins: m.source_location_western_ruins,
} satisfies Record<string, NameMessage>;

const WATER_MESSAGES = {
  ocean: m.source_water_ocean,
  pond: m.source_water_pond,
  river: m.source_water_river,
} satisfies Record<string, NameMessage>;

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
 * Brands a literal as a pet skin id. The only unchecked step; `source-names.test.ts` asserts every
 * id used here exists in the `pets/skins` name table.
 */
function skin(id: string): PetSkinId {
  return id as PetSkinId;
}

/**
 * Each monster's family, named by the pet skin the game translates for it, plus the color or
 * material variant that tells family members apart. Monster names themselves only live in the
 * game's translation tables, which the pipeline doesn't extract yet.
 */
interface MonsterFamily {
  family: PetSkinId;
  variant?: keyof typeof VARIANT_MESSAGES;
}

const MONSTER_FAMILIES = {
  bat: { family: skin("essence_bat") },
  bat_blue: { family: skin("essence_bat"), variant: "blue" },
  cat: { family: skin("void_cat") },
  cat_void: { family: skin("void_cat") },
  copperclod: { family: skin("oreclod"), variant: "copper" },
  enchantern: { family: skin("enchantern") },
  enchantern_blue: { family: skin("enchantern"), variant: "blue" },
  goldclod: { family: skin("oreclod"), variant: "gold" },
  griffin_statue: { family: skin("griffin_statue") },
  ironclod: { family: skin("oreclod"), variant: "iron" },
  mimic: { family: skin("mimic") },
  mistrilclod: { family: skin("oreclod"), variant: "mistril" },
  mushroom: { family: skin("mushroom") },
  mushroom_blue: { family: skin("mushroom"), variant: "blue" },
  mushroom_green: { family: skin("mushroom"), variant: "green" },
  mushroom_purple: { family: skin("mushroom"), variant: "purple" },
  rock_stack: { family: skin("rock_stack") },
  rockclod: { family: skin("rockclod") },
  rockclod_blue: { family: skin("rockclod"), variant: "blue" },
  rockclod_green: { family: skin("rockclod"), variant: "green" },
  rockclod_purple: { family: skin("rockclod"), variant: "purple" },
  rockclod_red: { family: skin("rockclod"), variant: "red" },
  sapling: { family: skin("sapling") },
  sapling_blue: { family: skin("sapling"), variant: "blue" },
  sapling_cool: { family: skin("sapling"), variant: "cool" },
  sapling_orange: { family: skin("sapling"), variant: "orange" },
  sapling_orange_mini: { family: skin("sapling"), variant: "orange_mini" },
  sapling_pink: { family: skin("sapling"), variant: "pink" },
  sapling_purple: { family: skin("sapling"), variant: "purple" },
  silverclod: { family: skin("oreclod"), variant: "silver" },
  spirit: { family: skin("flame_spirit") },
  spirit_purple: { family: skin("flame_spirit"), variant: "purple" },
  stalagmite: { family: skin("stalagmite") },
  stalagmite_green: { family: skin("stalagmite"), variant: "green" },
  stalagmite_purple: { family: skin("stalagmite"), variant: "purple" },
  tome: { family: skin("flying_tome") },
  void_cat: { family: skin("void_cat") },
} satisfies Record<string, MonsterFamily>;

/** The monster ids named by {@link MONSTER_FAMILIES}. */
export type NamedMonsterId = keyof typeof MONSTER_FAMILIES;
export type NamedLocationId = keyof typeof LOCATION_MESSAGES;
export type NamedWaterType = keyof typeof WATER_MESSAGES;

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

export function buildLocationNames(locale: LocaleCode): Record<NamedLocationId, string> {
  return recordMap(LOCATION_MESSAGES, (message) => message({}, { locale }));
}

export function buildMonsterNames(locale: LocaleCode): Record<NamedMonsterId, string> {
  const families: Record<NamedMonsterId, MonsterFamily> = MONSTER_FAMILIES;
  return recordMap(families, ({ family, variant }) => {
    const monster = getName("pets/skins", family, locale);
    return variant ? VARIANT_MESSAGES[variant]({ monster }, { locale }) : monster;
  });
}

/** Placeholder names for {@link UNNAMED_SOURCE_IDS}, identical in every locale. */
export function buildUnnamedSourceNames(ids: readonly string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, titleCase(id)]));
}

export function buildWaterNames(locale: LocaleCode): Record<NamedWaterType, string> {
  return recordMap(WATER_MESSAGES, (message) => message({}, { locale }));
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
