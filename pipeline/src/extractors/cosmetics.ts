import { LOCALE_CODES } from "$lib/types/locale.js";

import { isExcludedCosmetic } from "../acquisition/exclusions.js";
import { expectArray } from "../data-shapes.js";
import { localizeField } from "../localize.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type { Cosmetic, CosmeticId, CosmeticSlot, TrackerData } from "$lib/types/tracker-data.js";

const VALID_SLOTS = new Set<CosmeticSlot>([
  "back",
  "dress",
  "eyes",
  "face",
  "facial",
  "hair",
  "head",
  "overalls",
  "pants",
  "robe",
  "shirt",
  "shoes",
  "shorts",
  "skirt",
  "suit",
  "top",
  "underwear",
]);

// These compound UI slots suppress unknown-slot diagnostics only. normalizeSlot still checks
// canonical slots, aliases, asset-ID prefixes, and raw prefixes before falling back to top.
const KNOWN_COMPOSITE_SLOTS = new Set(["bottom"]);

/**
 * Normalizes player_assets into tracker cosmetics. Slot selection removes the gear suffix, accepts
 * canonical slots and aliases, infers from an ID prefix, then falls back to the top slot.
 */
export interface CosmeticExtraction {
  cosmetics: TrackerData["cosmetics"];
  localeNames: Record<LocaleCode, Record<CosmeticId, string>>;
  /** Localized labels for every `ui_sub_category` key, from the character-customization menu. */
  subCategoryLocaleNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * Player cosmetics use `player_assets/<id>/name`, rather than the tracker category path. Missing
 * entries are expected in beta translation tables and deliberately fall back to asset English.
 */
export function extractCosmetics(fiddle: ParsedGameData, assetsDir: string): CosmeticExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<CosmeticId, string>
  >;
  const assets = fiddle.player_assets as Record<string, Record<string, unknown>> | undefined;
  const subCategoryLocaleNames = localizeSubCategories(fiddle, assetsDir);
  if (!assets) return { cosmetics: {}, localeNames, subCategoryLocaleNames };

  const result = {} as Record<CosmeticId, Cosmetic>;
  const unknownSlots = new Map<string, number>();

  for (const [id, asset] of Object.entries(assets)) {
    if (id === "default") continue;
    if (isExcludedCosmetic(id as CosmeticId)) continue;

    const uiSlot = asset.ui_slot as string | undefined;
    const slot = normalizeSlot(uiSlot ?? id, id);

    const cleaned = uiSlot?.replace(/_gear$/, "") as CosmeticSlot;
    if (
      uiSlot &&
      cleaned &&
      !VALID_SLOTS.has(cleaned) &&
      !(cleaned in SLOT_ALIASES) &&
      !KNOWN_COMPOSITE_SLOTS.has(cleaned)
    ) {
      unknownSlots.set(uiSlot, (unknownSlots.get(uiSlot) ?? 0) + 1);
    }

    const uiSubCategory = asset.ui_sub_category as string | undefined;
    if (uiSubCategory !== undefined && !(uiSubCategory in subCategoryLocaleNames.en)) {
      throw new Error(
        `Player cosmetic "${id}" has ui_sub_category "${uiSubCategory}" with no entry in ui/character_customization.toml`,
      );
    }
    const subCategory = uiSubCategory;

    const name = asset.name as string | undefined;
    if (!name) {
      throw new Error(`Player cosmetic "${id}" has no English name for localization fallback`);
    }
    const cosmeticId = id as CosmeticId;
    result[cosmeticId] = {
      slot,
      ...(subCategory && { subCategory }),
      sources: ((asset.default_unlocked as boolean | undefined)
        ? [{ type: "default" }]
        : []) as SourceTuple,
    };
    const { values } = localizeField(assetsDir, {
      category: "player_assets",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][cosmeticId] = values[locale];
  }

  if (unknownSlots.size > 0) {
    console.log(
      `  Cosmetics: ${Object.keys(result).length} (unknown ui_slots: ${[...unknownSlots.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`,
    );
  } else {
    console.log(`  Cosmetics: ${Object.keys(result).length}`);
  }
  return { cosmetics: result, localeNames, subCategoryLocaleNames };
}

/**
 * Sub-category labels come from the character-customization menu (`ui/character_customization.toml`),
 * where each slot section is an ordered array of `{ key, name }`. The game localizes them by
 * ordinal (`ui/character_customization/<section>/<index>/name`), so the English `name` doubles as
 * the guard against upstream reordering. Keyed by `key`, which is what `ui_sub_category` references.
 */
function localizeSubCategories(
  fiddle: ParsedGameData,
  assetsDir: string,
): Record<LocaleCode, Record<string, string>> {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const customization = ui?.character_customization as Record<string, unknown> | undefined;
  if (!customization) throw new Error("ui/character_customization.toml is missing");
  const sourceFile = sourceFileFor(fiddle, "ui.character_customization");

  for (const [section, rawEntries] of Object.entries(customization)) {
    const entries = expectArray<Record<string, unknown>>(rawEntries, {
      fieldPath: `character_customization.${section}`,
      sourcePath: sourceFile,
    });
    entries.forEach((entry, index) => {
      const key = entry.key as string | undefined;
      const name = entry.name as string | undefined;
      if (!key || !name) {
        throw new Error(
          `character_customization.${section}[${index.toString()}] needs both key and name`,
        );
      }
      const { values } = localizeField(assetsDir, {
        category: `ui/character_customization/${section}`,
        classification: "localizable",
        englishValue: name,
        expectedEnglishValue: name,
        field: "name",
        id: index.toString(),
      });
      for (const locale of LOCALE_CODES) localeNames[locale][key] = values[locale];
    });
  }
  return localeNames;
}

const SLOT_ALIASES: Record<string, CosmeticSlot> = {
  facial_hair: "facial",
  feet: "shoes",
};

function normalizeSlot(raw: string, id: string): CosmeticSlot {
  // Normalize direct slots first, then aliases, ID prefixes, broad raw prefixes, and finally top.
  const cleaned = raw.replace(/_gear$/, "") as CosmeticSlot;
  if (VALID_SLOTS.has(cleaned)) return cleaned;

  if (cleaned in SLOT_ALIASES) return SLOT_ALIASES[cleaned];

  for (const slot of VALID_SLOTS) {
    if (id.startsWith(`${slot}_`)) return slot;
  }

  for (const slot of VALID_SLOTS) {
    if (raw.startsWith(slot)) return slot;
  }
  return "top";
}
