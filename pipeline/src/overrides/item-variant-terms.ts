import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemVariant } from "#lib/types/tracker-data.js";

/**
 * Where each locale’s `variant_<key>` message (in `messages/<locale>.json`) came from. A `game`
 * value is the term that locale’s own translators used in `evidence`’s description, normalized to
 * a standalone form (masculine singular where gender applies); a `machine` value is a machine
 * translation, used only where the game’s description doesn’t name the difference, and is the one
 * to review. `evidence` is a reviewed row with this variant; the real-asset test checks it.
 */
export interface ItemVariantTermSources {
  evidence?: string;
  game: readonly Exclude<LocaleCode, "en">[];
  machine: readonly Exclude<LocaleCode, "en">[];
}

export const ITEM_VARIANT_TERMS: Readonly<Record<ItemVariant, ItemVariantTermSources>> = {
  aqua: {
    evidence: "deluxe_storage_chest_aqua",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  black: {
    evidence: "pirate_wall_flag_v1",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  blue: {
    evidence: "incense_burner_blue",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  blue_and_yellow: {
    evidence: "mist_pet_bed_v2",
    game: ["es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["fr", "ja"],
  },
  brown: {
    evidence: "pirate_wall_flag_v2",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  cherry: {
    evidence: "counter_cabin_cherry",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  chocolate: {
    evidence: "counter_cake_double_chocolate",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  cool_toned: {
    evidence: "pirate_anchor_v1",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  cream: { game: [], machine: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"] },
  dark_brown: {
    evidence: "deluxe_storage_chest_dark_brown",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  dark_wood: { game: [], machine: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"] },
  gold: {
    evidence: "deluxe_storage_chest_gold",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  gray: {
    evidence: "deluxe_storage_chest_gray",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  green: {
    evidence: "incense_burner_green",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  light_brown: {
    evidence: "deluxe_storage_chest_light_brown",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  lightning: {
    evidence: "mist_bed_v4",
    game: ["fr", "es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["ja"],
  },
  mocha: {
    evidence: "counter_cake_chocolate",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  moon: {
    evidence: "mist_bed_v2",
    game: ["fr", "es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["ja"],
  },
  oak: {
    evidence: "counter_cabin_oak",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  oak_and_white: {
    evidence: "ornate_cabinet_v3",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  off_white: { game: [], machine: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"] },
  orange: {
    evidence: "incense_stick_v3",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  pink: {
    evidence: "deluxe_icebox_pink",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  pink_tinged: {
    evidence: "pirate_counterfeit_gold_pile_v2",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  purple: {
    evidence: "incense_burner_purple",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  purple_blue: {
    evidence: "mist_cushion_v4",
    game: ["fr", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["es", "ja"],
  },
  purple_blue_and_yellow: {
    evidence: "mist_pet_bed_v4",
    game: ["es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["fr", "ja"],
  },
  purple_framed: {
    evidence: "ruins_window_v2",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  raindrop: {
    evidence: "mist_bed_v3",
    game: ["fr", "es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["ja"],
  },
  red: {
    evidence: "deluxe_storage_chest_red",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  sage: {
    evidence: "counter_cottage_v1",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  sparkly: {
    evidence: "mist_bed_v1",
    game: ["fr", "es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["ja"],
  },
  stone_framed: {
    evidence: "ruins_window_v1",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  strawberry: {
    evidence: "counter_cake_strawberry",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  walnut: {
    evidence: "counter_cabin_walnut",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  walnut_and_gold: {
    evidence: "ornate_cabinet_v2",
    game: ["fr", "es", "ru", "ko", "zh-Hans", "zh-Hant"],
    machine: ["ja"],
  },
  walnut_and_green: {
    evidence: "ornate_cabinet_v1",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  warm_toned: {
    evidence: "pirate_anchor_v2",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  white: {
    evidence: "incense_burner_white",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  white_and_gold: {
    evidence: "ornate_cabinet_v4",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  wood_framed: {
    evidence: "ruins_window_v3",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
  yellow: {
    evidence: "deluxe_icebox_yellow",
    game: ["fr", "es", "ru", "ja", "ko", "zh-Hans", "zh-Hant"],
    machine: [],
  },
};
