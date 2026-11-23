import { expectArray, expectNonEmptyString, expectRecord } from "../data-shapes.js";
import { forEachItem } from "../extractor-helpers.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { SpriteKind } from "#lib/sprites/sprite-url.js";
import type { TrackerData } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

/** The entity kinds this module resolves; items & villagers keep their own extractors. */
export type EntitySpriteKind = Exclude<SpriteKind, "items" | "villagers">;

/**
 * Per kind, each entity's candidate game sprite names in preference order. Sprite extraction takes
 * the first candidate the assets hold. An empty list means the game data names no art for the
 * entity, which only an entry in `NO_ART` may excuse. The names locate source PNGs only; they never
 * reach `tracker-data.json` or the app.
 */
export type EntitySpriteCandidates = Record<EntitySpriteKind, Record<string, readonly string[]>>;

/**
 * Reviewed wardrobe looks the game ships no wearable icon for, pictured by another icon of the same
 * art. Checked by eye against the look's wardrobe sprites.
 */
const COSMETIC_ICON_EXCEPTIONS: Readonly<Record<string, string>> = {
  // The museum artifact that grants the look, drawn in the armor's own palette.
  shoes_boots_dragonsworn_armor: "spr_ui_item_dragonsworn_greaves",
};

/**
 * Resolves the icon each Everything row kind shows in the game's own menus. Entity IDs come from
 * the assembled tracker data, so the index covers exactly the rows the app renders.
 *
 * Some kinds name their icon in the game data (pets, perks, spells, pet skin items). The rest
 * follow the art's own naming: wardrobe icons are `spr_ui_item_wearable_<id>` (body-part looks
 * such as hair & eyes are drawn on a head, as `<name>_merged`), animal cosmetics are
 * `spr_ui_item_<animal>_cosmetic_<id>`, and animal & mount looks use the ranching menu's
 * `spr_ui_icon_animal_<animal>_<ui_key>`.
 */
export function extractEntitySpriteCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): EntitySpriteCandidates {
  return {
    "animal-cosmetics": animalCosmeticCandidates(trackerData),
    "animal-variants": animalVariantCandidates(fiddle, trackerData),
    cosmetics: Object.fromEntries(
      Object.keys(trackerData.cosmetics).map((id) => [
        id,
        [
          `spr_ui_item_wearable_${id}`,
          `spr_ui_item_wearable_${id}_merged`,
          ...(Object.hasOwn(COSMETIC_ICON_EXCEPTIONS, id) ? [COSMETIC_ICON_EXCEPTIONS[id]] : []),
        ],
      ]),
    ),
    "mount-appearances": mountAppearanceCandidates(fiddle, trackerData),
    "mount-perks": mountPerkCandidates(fiddle, trackerData),
    "pet-cosmetics": petCosmeticCandidates(fiddle, trackerData),
    "pet-skins": petSkinCandidates(fiddle, trackerData),
    spells: spellCandidates(fiddle, trackerData),
  };
}

/**
 * The `icon_sprite` of every item a Renown level awards, for the item sprite index. Most are also
 * almanac items; the rest (the Golden Treasure Box, for one) would otherwise have no sprite.
 */
export function renownRewardItemSprites(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, string> {
  const wanted = new Set(
    trackerData.renown.rewards.flatMap((reward) => (reward.type === "item" ? [reward.itemId] : [])),
  );
  const result: Record<string, string> = {};
  forEachItem(fiddle, (itemId, item, topCategory, subCategory) => {
    if (!wanted.has(itemId as never)) return;
    result[itemId] = expectNonEmptyString(item.icon_sprite, {
      entityId: itemId,
      fieldPath: "icon_sprite",
      sourcePath: `items/${topCategory}/${subCategory}`,
    });
  });
  for (const itemId of wanted) {
    if (!Object.hasOwn(result, itemId)) {
      throw new Error(`Renown reward item "${itemId}" is not an item in fiddle/items`);
    }
  }
  return result;
}

function animalCosmeticCandidates(trackerData: TrackerData): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    for (const cosmeticId of Object.keys(animal.cosmetics)) {
      result[`${animalId}/${cosmeticId}`] = [`spr_ui_item_${animalId}_cosmetic_${cosmeticId}`];
    }
  }
  return result;
}

/**
 * A variant with its own `male`/`female` look has its own ranching icon. A variant that only sets
 * a `lut_index` is the base animal recolored at runtime, which the game ships no picture of.
 */
function animalVariantCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const variants = rawVariants(fiddle, animalId);
    for (const tier of animal.variantTiers) {
      for (const variantId of Object.keys(tier)) {
        const uiKey = variantUiKey(fiddle, animalId, variants, variantId);
        result[`${animalId}/${variantId}`] = uiKey
          ? [`spr_ui_icon_animal_${animalId}_${uiKey}`]
          : [];
      }
    }
  }
  return result;
}

function mountAppearanceCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  const variants = rawVariants(fiddle, "horse");
  const result: Record<string, readonly string[]> = {};
  for (const id of Object.keys(trackerData.mount.appearances)) {
    const uiKey = variantUiKey(fiddle, "horse", variants, id);
    if (!uiKey) {
      throw new Error(`Mount appearance "${id}" has no male or female look in its horse variant`);
    }
    result[id] = [`spr_ui_icon_animal_horse_${uiKey}`];
  }
  return result;
}

function mountPerkCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  const sourcePath = sourceFileFor(fiddle, "ui.skill_menu.mount");
  const ui = expectRecord((fiddle.ui as Record<string, unknown> | undefined)?.skill_menu, {
    fieldPath: "skill_menu",
    sourcePath,
  });
  const menu = expectRecord(ui.mount, { fieldPath: "mount", sourcePath });
  const icons = new Map<string, string>();
  for (const [key, value] of Object.entries(menu)) {
    if (!key.startsWith("tier_")) continue;
    for (const [index, entry] of expectArray<unknown>(value, {
      fieldPath: key,
      sourcePath,
    }).entries()) {
      const fieldPath = `${key}[${index}]`;
      const record = expectRecord(entry, { fieldPath, sourcePath });
      const perk = expectNonEmptyString(record.perk, {
        fieldPath: `${fieldPath}.perk`,
        sourcePath,
      });
      if (icons.has(perk)) throw new Error(`Duplicate mount perk "${perk}" in ${sourcePath}`);
      icons.set(
        perk,
        expectNonEmptyString(record.icon, { fieldPath: `${fieldPath}.icon`, sourcePath }),
      );
    }
  }
  return Object.fromEntries(
    Object.keys(trackerData.mount.perks).map((id) => {
      const icon = icons.get(id);
      if (!icon) throw new Error(`Mount perk "${id}" has no icon in ${sourcePath}`);
      return [id, [icon]];
    }),
  );
}

function petCosmeticCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  if (Object.keys(trackerData.pets.cosmetics).length === 0) return {};
  const sourcePath = sourceFileFor(fiddle, "pets");
  const pets = expectRecord(fiddle.pets, { fieldPath: "pets", sourcePath });
  const sets = expectRecord(pets.cosmetic_sets, { fieldPath: "cosmetic_sets", sourcePath });
  return Object.fromEntries(
    Object.keys(trackerData.pets.cosmetics).map((id) => {
      const set = expectRecord(sets[id], { fieldPath: `cosmetic_sets.${id}`, sourcePath });
      return [
        id,
        [
          expectNonEmptyString(set.ui_icon, {
            entityId: id,
            fieldPath: `cosmetic_sets.${id}.ui_icon`,
            sourcePath,
          }),
        ],
      ];
    }),
  );
}

/** A pet skin's picture is the icon of the item that unlocks it. */
function petSkinCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  forEachItem(fiddle, (itemId, item, topCategory, subCategory) => {
    if (item.pet_skin_unlock === undefined) return;
    const sourcePath = `items/${topCategory}/${subCategory}`;
    const skinId = expectNonEmptyString(item.pet_skin_unlock, {
      entityId: itemId,
      fieldPath: "pet_skin_unlock",
      sourcePath,
    });
    if (!Object.hasOwn(trackerData.pets.skins, skinId)) return;
    if (Object.hasOwn(result, skinId)) {
      throw new Error(`Pet skin "${skinId}" has more than one unlock item (${itemId})`);
    }
    result[skinId] = [
      expectNonEmptyString(item.icon_sprite, {
        entityId: itemId,
        fieldPath: "icon_sprite",
        sourcePath,
      }),
    ];
  });
  for (const id of Object.keys(trackerData.pets.skins)) {
    if (!Object.hasOwn(result, id)) throw new Error(`Pet skin "${id}" has no unlock item`);
  }
  return result;
}

function spellCandidates(
  fiddle: ParsedGameData,
  trackerData: TrackerData,
): Record<string, readonly string[]> {
  if (Object.keys(trackerData.mines.spells).length === 0) return {};
  const sourcePath = sourceFileFor(fiddle, "spells");
  const spells = expectRecord(fiddle.spells, { fieldPath: "spells", sourcePath });
  return Object.fromEntries(
    Object.keys(trackerData.mines.spells).map((id) => {
      const spell = expectRecord(spells[id], { fieldPath: id, sourcePath });
      const iconKey = expectNonEmptyString(spell.icon_key, {
        entityId: id,
        fieldPath: "icon_key",
        sourcePath,
      });
      // The journal draws `<icon_key>_main` once a spell is learned & `_locked` before.
      return [id, [`${iconKey}_main`]];
    }),
  );
}

function rawVariants(
  fiddle: ParsedGameData,
  animalId: string,
): Record<string, Record<string, unknown>> {
  const sourcePath = sourceFileFor(fiddle, `ranching.animals.${animalId}`);
  const ranching = expectRecord(fiddle.ranching, { fieldPath: "ranching", sourcePath });
  const animals = expectRecord(ranching.animals, { fieldPath: "animals", sourcePath });
  const animal = expectRecord(animals[animalId], { fieldPath: animalId, sourcePath });
  return expectRecord(animal.variants, { fieldPath: "variants", sourcePath }) as Record<
    string,
    Record<string, unknown>
  >;
}

/** The female look's `ui_key` (or `key`), else the male's; undefined for a recolor-only variant. */
function variantUiKey(
  fiddle: ParsedGameData,
  animalId: string,
  variants: Record<string, Record<string, unknown>>,
  variantId: string,
): string | undefined {
  const sourcePath = sourceFileFor(fiddle, `ranching.animals.${animalId}`);
  const variant = expectRecord(variants[variantId], {
    fieldPath: `variants.${variantId}`,
    sourcePath,
  });
  for (const sex of ["female", "male"] as const) {
    if (variant[sex] === undefined) continue;
    const look = expectRecord(variant[sex], {
      fieldPath: `variants.${variantId}.${sex}`,
      sourcePath,
    });
    // A look that only overrides `lut_index` is still a recolor of the base art.
    if (look.ui_key === undefined && look.key === undefined) continue;
    return expectNonEmptyString(look.ui_key ?? look.key, {
      entityId: `${animalId}/${variantId}`,
      fieldPath: `variants.${variantId}.${sex}.ui_key`,
      sourcePath,
    });
  }
  return undefined;
}
