import { inLocale } from "#lib/i18n/locale-runtime.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { AlmanacEntry, ItemVariant } from "#lib/types/tracker-data.js";

type VariantMessage = () => string;

/**
 * The game names no colorway, so each variant is a translated label, taken from the game’s own
 * localized descriptions where they name it. Provenance per locale is in
 * `pipeline/src/overrides/item-variant-terms.ts`.
 */
const VARIANT_MESSAGES = {
  aqua: () => "Aqua",
  black: () => "Black",
  blue: () => "Blue",
  blue_and_yellow: () => "Blue & yellow",
  brown: () => "Brown",
  cherry: () => "Cherry",
  chipped: () => "Chipped",
  chocolate: () => "Chocolate",
  cool_toned: () => "Cool-toned",
  cracked: () => "Cracked",
  cracked_purple: () => "Cracked purple",
  cream: () => "Cream",
  crossed_tape: () => "Crossed tape",
  dark_brown: () => "Dark brown",
  dark_wood: () => "Dark wood",
  double: () => "Double",
  gold: () => "Gold",
  gold_accents: () => "Gold accents",
  gray: () => "Gray",
  green: () => "Green",
  light_brown: () => "Light brown",
  lightning: () => "Lightning",
  mocha: () => "Mocha",
  moon: () => "Moon",
  oak: () => "Oak",
  oak_and_brown: () => "Oak & brown",
  oak_and_green: () => "Oak & green",
  oak_and_white: () => "Oak & white",
  off_white: () => "Off-white",
  orange: () => "Orange",
  orange_gourd: () => "Orange gourd",
  pink: () => "Pink",
  pink_accents: () => "Pink accents",
  pink_tinged: () => "Pink-tinged",
  plain: () => "Plain",
  purple: () => "Purple",
  purple_blue: () => "Purple-blue",
  purple_blue_and_yellow: () => "Purple-blue & yellow",
  purple_framed: () => "Purple-framed",
  raindrop: () => "Raindrop",
  red: () => "Red",
  sage: () => "Sage",
  single: () => "Single",
  sparkly: () => "Sparkly",
  stone_framed: () => "Stone-framed",
  strawberry: () => "Strawberry",
  striped_tape: () => "Horizontal tape",
  walnut: () => "Walnut",
  walnut_and_gold: () => "Walnut & gold",
  walnut_and_green: () => "Walnut & green",
  walnut_and_orange: () => "Walnut & orange",
  walnut_and_white: () => "Walnut & white",
  warm_toned: () => "Warm-toned",
  white: () => "White",
  white_and_blue: () => "White & blue",
  white_and_gold: () => "White & gold",
  white_and_tan: () => "White & tan",
  white_goblet: () => "White goblet",
  wood_framed: () => "Wood-framed",
  yellow: () => "Yellow",
} satisfies Record<ItemVariant, VariantMessage>;

/** The word that tells `entry` apart from same-named rows, such as “Oak”; absent when none does. */
export function getAlmanacEntryVariant(
  entry: Pick<AlmanacEntry, "variant">,
  locale: LocaleCode,
): string | undefined {
  const { variant } = entry;
  // Sitewide search resolves both the display locale and the English match term.
  return variant && inLocale(locale, VARIANT_MESSAGES[variant]);
}
