/**
 * Everything rows the game ships no standalone art for. Each row here shows a designed placeholder
 * instead of a sprite. The pipeline fails on a row whose art is missing unless it's listed here,
 * and on a listed row that turns out to have art, so the list stays exact across game updates.
 */

/** Row kinds with no art at all, by the Everything row's report category. */
export const NO_ART_ROW_KINDS = {
  quest: "The game draws no icon for a quest.",
} as const satisfies Record<string, string>;

const RECOLOR_REASON =
  "The game recolors the species’ base art at runtime & ships no picture of this variant.";

/**
 * Animal variants that only set a `lut_index`, by animal. Variants with their own look (Fall, Gold,
 * Silver, & the like) have ranching icons & aren't listed.
 */
const RECOLORED_ANIMAL_VARIANTS: Record<string, readonly string[]> = {
  alpaca: [
    "black",
    "blue",
    "brown",
    "desert",
    "gold",
    "indigo",
    "pink",
    "purple",
    "silver",
    "snowy",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  capybara: [
    "blue",
    "dark_brown",
    "fall",
    "gold",
    "gray",
    "light_brown",
    "pale",
    "pink",
    "purple",
    "red",
    "silver",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  chicken: ["blue", "brown", "gray", "pink", "purple", "red", "spring", "white", "yellow"],
  cow: [
    "black",
    "blue",
    "brown",
    "chocolate",
    "fall",
    "gold",
    "pink",
    "purple",
    "red",
    "silver",
    "spotted",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  duck: [
    "blue",
    "cayuga",
    "gold",
    "mallard",
    "mandarin",
    "muscovy",
    "pink",
    "purple",
    "ruddy_shelduck",
    "silver",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  horse: [
    "black",
    "blue",
    "champagne",
    "chestnut",
    "fall",
    "pink",
    "purple",
    "sandy_bay",
    "spotted",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  rabbit: [
    "black",
    "black_and_white",
    "blue",
    "brown",
    "brown_sable",
    "gold",
    "orange_sable",
    "pink",
    "purple",
    "silver",
    "spring",
    "summer",
    "white",
    "winter",
  ],
  sheep: [
    "beige",
    "black",
    "black_nosed",
    "blue",
    "brown",
    "gold",
    "pink",
    "purple",
    "silver",
    "spring",
    "summer",
    "white",
    "white_nosed",
    "winter",
  ],
};

/** Individual entities without art, by sprite kind, then entity ID, with the reason. */
export const NO_ART_ENTITIES: { "animal-variants": Readonly<Record<string, string>> } = {
  "animal-variants": Object.fromEntries(
    Object.entries(RECOLORED_ANIMAL_VARIANTS).flatMap(([animalId, variantIds]) =>
      variantIds.map((variantId) => [`${animalId}/${variantId}`, RECOLOR_REASON]),
    ),
  ),
};

export type NoArtEntityKind = keyof typeof NO_ART_ENTITIES;

export function noArtEntityReason(kind: string, id: string): string | undefined {
  if (!Object.hasOwn(NO_ART_ENTITIES, kind)) return undefined;
  const entities = NO_ART_ENTITIES[kind as NoArtEntityKind];
  return Object.hasOwn(entities, id) ? entities[id] : undefined;
}
