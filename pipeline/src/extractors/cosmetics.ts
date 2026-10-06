import { LOCALE_CODES } from "#lib/types/locale.js";

import { isExcludedCosmetic } from "../acquisition/exclusions.js";
import { expectArray } from "../data-shapes.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { SourceTuple } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  Cosmetic,
  CosmeticId,
  CosmeticSlot,
  CosmeticSlotMeta,
  TrackerData,
} from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

export interface CosmeticExtraction {
  cosmetics: TrackerData["cosmetics"];
  /** Every customization-menu slot in game order, with its sub-categories in game order. */
  cosmeticSlots: TrackerData["cosmeticSlots"];
  localeNames: Record<LocaleCode, Record<CosmeticId, string>>;
  /** Localized labels for every `ui_sub_category` key, from the character-customization menu. */
  subCategoryLocaleNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * Player cosmetics use `player_assets/<id>/name`, rather than the tracker category path. Missing
 * entries are expected in beta translation tables and deliberately fall back to asset English.
 *
 * Each asset's `ui_slot` and `ui_sub_category` are taken verbatim; both must name a section and
 * entry of `ui/character_customization.toml`, which is what the game's wardrobe menu groups by.
 */
export function extractCosmetics(fiddle: ParsedGameData, localizer: Localizer): CosmeticExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<CosmeticId, string>
  >;
  const assets = fiddle.player_assets as Record<string, Record<string, unknown>> | undefined;
  const { cosmeticSlots, subCategoryLocaleNames } = readCustomizationMenu(fiddle, localizer);
  if (!assets) return { cosmetics: {}, cosmeticSlots, localeNames, subCategoryLocaleNames };

  const result = {} as Record<CosmeticId, Cosmetic>;

  for (const [id, asset] of Object.entries(assets)) {
    if (id === "default") continue;
    if (isExcludedCosmetic(id as CosmeticId)) continue;

    const rawSlot = asset.ui_slot as string | undefined;
    if (rawSlot === undefined || !(rawSlot in cosmeticSlots)) {
      throw new Error(
        `Player cosmetic "${id}" has ui_slot ${JSON.stringify(rawSlot)} with no section in ui/character_customization.toml`,
      );
    }
    const slot = rawSlot as CosmeticSlot;
    const subCategory = asset.ui_sub_category as string | undefined;
    if (subCategory === undefined || !cosmeticSlots[slot].subCategories.includes(subCategory)) {
      throw new Error(
        `Player cosmetic "${id}" has ui_sub_category ${JSON.stringify(subCategory)} with no entry under "${slot}" in ui/character_customization.toml`,
      );
    }

    const name = asset.name as string | undefined;
    if (!name) {
      throw new Error(`Player cosmetic "${id}" has no English name for localization fallback`);
    }
    const cosmeticId = id as CosmeticId;
    result[cosmeticId] = {
      slot,
      sources: ((asset.default_unlocked as boolean | undefined)
        ? [{ type: "default" }]
        : []) as SourceTuple,
      subCategory,
    };
    const { values } = localizer.localizeField({
      category: "player_assets",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][cosmeticId] = values[locale];
  }

  console.log(`  Cosmetics: ${Object.keys(result).length}`);
  return { cosmetics: result, cosmeticSlots, localeNames, subCategoryLocaleNames };
}

/**
 * The character-customization menu (`ui/character_customization.toml`) is one ordered array of
 * `{ key, name }` per slot section. The game localizes sub-category names by ordinal
 * (`ui/character_customization/<section>/<index>/name`), so the English `name` doubles as the
 * guard against upstream reordering. Labels are keyed by `key`, which is what `ui_sub_category`
 * references; slot order and sub-category order are the file's own.
 */
function readCustomizationMenu(
  fiddle: ParsedGameData,
  localizer: Localizer,
): Pick<CosmeticExtraction, "cosmeticSlots" | "subCategoryLocaleNames"> {
  const subCategoryLocaleNames = Object.fromEntries(
    LOCALE_CODES.map((locale) => [locale, {}]),
  ) as Record<LocaleCode, Record<string, string>>;
  const cosmeticSlots = {} as Record<CosmeticSlot, CosmeticSlotMeta>;
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const customization = ui?.character_customization as Record<string, unknown> | undefined;
  if (!customization) throw new Error("ui/character_customization.toml is missing");
  const sourceFile = sourceFileFor(fiddle, "ui.character_customization");

  for (const [section, rawEntries] of Object.entries(customization)) {
    const entries = expectArray<Record<string, unknown>>(rawEntries, {
      fieldPath: `character_customization.${section}`,
      sourcePath: sourceFile,
    });
    const subCategories: string[] = [];
    for (const [index, entry] of entries.entries()) {
      const key = entry.key as string | undefined;
      const name = entry.name as string | undefined;
      if (!key || !name) {
        throw new Error(
          `character_customization.${section}[${index.toString()}] needs both key and name`,
        );
      }
      if (key in subCategoryLocaleNames.en) {
        throw new Error(`character_customization sub-category key "${key}" appears twice`);
      }
      const { values } = localizer.localizeField({
        category: `ui/character_customization/${section}`,
        classification: "localizable",
        englishValue: name,
        expectedEnglishValue: name,
        field: "name",
        id: index.toString(),
      });
      for (const locale of LOCALE_CODES) subCategoryLocaleNames[locale][key] = values[locale];
      subCategories.push(key);
    }
    cosmeticSlots[section as CosmeticSlot] = { subCategories };
  }
  return { cosmeticSlots, subCategoryLocaleNames };
}
