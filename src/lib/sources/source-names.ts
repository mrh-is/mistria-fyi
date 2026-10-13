import { getName, getNameTable } from "#lib/data/names.js";
import * as m from "#lib/paraglide/messages.js";
import { recordMap } from "#lib/utils/record.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { LocationId, PetSkinId } from "#lib/types/tracker-data.js";

type NameMessage = (inputs: Record<string, never>, options: { locale: LocaleCode }) => string;
type VariantMessage = (inputs: { monster: string }, options: { locale: LocaleCode }) => string;

/**
 * Source locations the game never names: the farm, the Mines as a whole, & the dungeon have no
 * `locations/<id>/name` key, so these are interim machine translations. Every other location
 * reads the pipeline's `locations` chunk.
 */
const UNNAMED_LOCATION_MESSAGES = {
  dungeon: m.source_location_dungeon,
  farm: m.source_location_farm,
  mines: m.source_location_mines,
} satisfies Record<string, NameMessage>;

/** Water types have no game name at all, so these are interim machine translations. */
const WATER_MESSAGES = {
  ocean: m.source_water_ocean,
  pond: m.source_water_pond,
  river: m.source_water_river,
} satisfies Record<string, NameMessage>;

/** Locations a source names through the game's own `locations` chunk. */
const GAME_NAMED_LOCATIONS = [
  "beach",
  "beach_secret",
  "bell_tower_f1",
  "deep_woods",
  "eastern_road",
  "haydens_farm",
  "narrows",
  "western_ruins",
] as const;

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
 * material variant that tells family members apart. The game has no full monster name: since 1.0.7
 * a `pets.toml` variant carries only a bare qualifier (“Copper”, “Default”) shown under its pet
 * kind, and three monsters have no variant at all. Every locale composes the name instead.
 */
interface MonsterFamily {
  family: PetSkinId;
  variant?: keyof typeof VARIANT_MESSAGES;
}

const MONSTER_FAMILIES = {
  bat: { family: skin("essence_bat") },
  bat_blue: { family: skin("essence_bat"), variant: "blue" },
  cat: { family: skin("lava_cat") },
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
} satisfies Record<string, MonsterFamily>;

/** The monster ids named by {@link MONSTER_FAMILIES}. */
export type NamedMonsterId = keyof typeof MONSTER_FAMILIES;
export type NamedLocationId =
  | "bell_tower_f2"
  | (typeof GAME_NAMED_LOCATIONS)[number]
  | keyof typeof UNNAMED_LOCATION_MESSAGES;
export type NamedWaterType = keyof typeof WATER_MESSAGES;

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
 * Location names only appear mid-sentence (“Dig up at {locations}”). English game names lead with
 * a capitalized article (“The Beach”), so it's lowercased to read “Dig up at the Beach”.
 */
export function buildLocationNames(locale: LocaleCode): Record<NamedLocationId, string> {
  const gameNames = Object.fromEntries(
    GAME_NAMED_LOCATIONS.map((id) => {
      const name = getName("locations", id as LocationId, locale);
      return [id, locale === "en" ? name.replace(/^The /, "the ") : name];
    }),
  ) as Record<(typeof GAME_NAMED_LOCATIONS)[number], string>;
  return {
    ...gameNames,
    // The Bell Tower's upper floor (its hidden chest) has no `name`; it shares the building's.
    bell_tower_f2: gameNames.bell_tower_f1,
    ...recordMap(UNNAMED_LOCATION_MESSAGES, (message) => message({}, { locale })),
  };
}

/** Monster names, composed from family & variant in every locale (see {@link MonsterFamily}). */
export function buildMonsterNames(locale: LocaleCode): Record<NamedMonsterId, string> {
  const families: Record<NamedMonsterId, MonsterFamily> = MONSTER_FAMILIES;
  return recordMap(families, ({ family, variant }) => {
    const monster = getName("pets/skins", family, locale);
    return variant ? VARIANT_MESSAGES[variant]({ monster }, { locale }) : monster;
  });
}

export function buildWaterNames(locale: LocaleCode): Record<NamedWaterType, string> {
  return recordMap(WATER_MESSAGES, (message) => message({}, { locale }));
}
