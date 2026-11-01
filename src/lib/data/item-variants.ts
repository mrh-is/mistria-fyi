import * as m from "#lib/paraglide/messages.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { AlmanacEntry, ItemVariant } from "#lib/types/tracker-data.js";

type VariantMessage = (inputs: Record<string, never>, options: { locale: LocaleCode }) => string;

/**
 * The game names no colorway, so each variant is a Paraglide message, taken from the game’s own
 * localized descriptions where they name it. Provenance per locale is in
 * `pipeline/src/overrides/item-variant-terms.ts`.
 */
const VARIANT_MESSAGES = {
  aqua: m.variant_aqua,
  black: m.variant_black,
  blue: m.variant_blue,
  blue_and_yellow: m.variant_blue_and_yellow,
  brown: m.variant_brown,
  cherry: m.variant_cherry,
  chocolate: m.variant_chocolate,
  cool_toned: m.variant_cool_toned,
  cracked_purple: m.variant_cracked_purple,
  cream: m.variant_cream,
  dark_brown: m.variant_dark_brown,
  dark_wood: m.variant_dark_wood,
  double: m.variant_double,
  gold: m.variant_gold,
  gold_accents: m.variant_gold_accents,
  gray: m.variant_gray,
  green: m.variant_green,
  light_brown: m.variant_light_brown,
  lightning: m.variant_lightning,
  mocha: m.variant_mocha,
  moon: m.variant_moon,
  oak: m.variant_oak,
  oak_and_brown: m.variant_oak_and_brown,
  oak_and_green: m.variant_oak_and_green,
  oak_and_white: m.variant_oak_and_white,
  off_white: m.variant_off_white,
  orange: m.variant_orange,
  orange_gourd: m.variant_orange_gourd,
  pink: m.variant_pink,
  pink_accents: m.variant_pink_accents,
  pink_tinged: m.variant_pink_tinged,
  plain: m.variant_plain,
  purple: m.variant_purple,
  purple_blue: m.variant_purple_blue,
  purple_blue_and_yellow: m.variant_purple_blue_and_yellow,
  purple_framed: m.variant_purple_framed,
  raindrop: m.variant_raindrop,
  red: m.variant_red,
  sage: m.variant_sage,
  single: m.variant_single,
  sparkly: m.variant_sparkly,
  stone_framed: m.variant_stone_framed,
  strawberry: m.variant_strawberry,
  walnut: m.variant_walnut,
  walnut_and_gold: m.variant_walnut_and_gold,
  walnut_and_green: m.variant_walnut_and_green,
  walnut_and_orange: m.variant_walnut_and_orange,
  walnut_and_white: m.variant_walnut_and_white,
  warm_toned: m.variant_warm_toned,
  white: m.variant_white,
  white_and_blue: m.variant_white_and_blue,
  white_and_gold: m.variant_white_and_gold,
  white_and_tan: m.variant_white_and_tan,
  white_goblet: m.variant_white_goblet,
  wood_framed: m.variant_wood_framed,
  yellow: m.variant_yellow,
} satisfies Record<ItemVariant, VariantMessage>;

/** The word that tells `entry` apart from same-named rows, such as “Oak”; absent when none does. */
export function getAlmanacEntryVariant(
  entry: Pick<AlmanacEntry, "variant">,
  locale: LocaleCode,
): string | undefined {
  return entry.variant && VARIANT_MESSAGES[entry.variant]({}, { locale });
}
