import { LOCALE_CODES } from "$lib/types/locale.js";

import { isExcludedCosmetic } from "../acquisition/exclusions.js";
import { localizeField } from "../localize.js";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type { Cosmetic, CosmeticId, CosmeticSlot, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

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
  if (!assets) return { cosmetics: {}, localeNames };

  const subCategoryMap = buildSubCategoryMap(fiddle);
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
    const subCategory = uiSubCategory
      ? (subCategoryMap[uiSubCategory] ?? titleCase(uiSubCategory))
      : undefined;

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
  return { cosmetics: result, localeNames };
}

function buildSubCategoryMap(fiddle: ParsedGameData): Record<string, string> {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const subMenus = menus?.sub_menus as Record<string, unknown> | undefined;
  const customization = subMenus?.customization as
    Record<string, Record<string, { key?: string; name?: string }>> | undefined;
  if (!customization) return {};

  const map: Record<string, string> = {};
  for (const slotEntries of Object.values(customization)) {
    if (typeof slotEntries !== "object" || slotEntries === null) continue;
    for (const entry of Object.values(slotEntries)) {
      if (typeof entry !== "object" || entry === null) continue;
      if (entry.key && entry.name) {
        map[entry.key] = entry.name;
      }
    }
  }
  return map;
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

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
