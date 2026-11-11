import type { LocaleCode } from "#lib/types/locale.js";
import type { AlmanacEntry, ItemVariant } from "#lib/types/tracker-data.js";

type VariantMessage = (locale: LocaleCode) => string;

/**
 * The game names no colorway, so each variant is a translated label, taken from the game’s own
 * localized descriptions where they name it. Provenance per locale is in
 * `pipeline/src/overrides/item-variant-terms.ts`.
 */
const VARIANT_MESSAGES = {
  aqua: (_locale) => "Aqua",
  black: (_locale) => "Black",
  blue: (_locale) => "Blue",
  blue_and_yellow: (_locale) => "Blue & yellow",
  brown: (_locale) => "Brown",
  cherry: (_locale) => "Cherry",
  chipped: (_locale) => "Chipped",
  chocolate: (_locale) => "Chocolate",
  cool_toned: (_locale) => "Cool-toned",
  cracked: (_locale) => "Cracked",
  cracked_purple: (_locale) => "Cracked purple",
  cream: (_locale) => "Cream",
  crossed_tape: (_locale) => "Crossed tape",
  dark_brown: (_locale) => "Dark brown",
  dark_wood: (_locale) => "Dark wood",
  double: (_locale) => "Double",
  gold: (_locale) => "Gold",
  gold_accents: (_locale) => "Gold accents",
  gray: (_locale) => "Gray",
  green: (_locale) => "Green",
  light_brown: (_locale) => "Light brown",
  lightning: (_locale) => "Lightning",
  mocha: (_locale) => "Mocha",
  moon: (_locale) => "Moon",
  oak: (_locale) => "Oak",
  oak_and_brown: (_locale) => "Oak & brown",
  oak_and_green: (_locale) => "Oak & green",
  oak_and_white: (_locale) => "Oak & white",
  off_white: (_locale) => "Off-white",
  orange: (_locale) => "Orange",
  orange_gourd: (_locale) => "Orange gourd",
  pink: (_locale) => "Pink",
  pink_accents: (_locale) => "Pink accents",
  pink_tinged: (_locale) => "Pink-tinged",
  plain: (_locale) => "Plain",
  purple: (_locale) => "Purple",
  purple_blue: (_locale) => "Purple-blue",
  purple_blue_and_yellow: (_locale) => "Purple-blue & yellow",
  purple_framed: (_locale) => "Purple-framed",
  raindrop: (_locale) => "Raindrop",
  red: (_locale) => "Red",
  sage: (_locale) => "Sage",
  single: (_locale) => "Single",
  sparkly: (_locale) => "Sparkly",
  stone_framed: (_locale) => "Stone-framed",
  strawberry: (_locale) => "Strawberry",
  striped_tape: (_locale) => "Horizontal tape",
  walnut: (_locale) => "Walnut",
  walnut_and_gold: (_locale) => "Walnut & gold",
  walnut_and_green: (_locale) => "Walnut & green",
  walnut_and_orange: (_locale) => "Walnut & orange",
  walnut_and_white: (_locale) => "Walnut & white",
  warm_toned: (_locale) => "Warm-toned",
  white: (_locale) => "White",
  white_and_blue: (_locale) => "White & blue",
  white_and_gold: (_locale) => "White & gold",
  white_and_tan: (_locale) => "White & tan",
  white_goblet: (_locale) => "White goblet",
  wood_framed: (_locale) => "Wood-framed",
  yellow: (_locale) => "Yellow",
} satisfies Record<ItemVariant, VariantMessage>;

/** The word that tells `entry` apart from same-named rows, such as “Oak”; absent when none does. */
export function getAlmanacEntryVariant(
  entry: Pick<AlmanacEntry, "variant">,
  locale: LocaleCode,
): string | undefined {
  return entry.variant && VARIANT_MESSAGES[entry.variant](locale);
}
