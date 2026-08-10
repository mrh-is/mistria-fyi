import type { CosmeticId, CosmeticSlot, TrackerData } from "$lib/types/tracker-data.js";

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

export function extractCosmetics(fiddle: ParsedGameData): TrackerData["cosmetics"] {
  const assets = fiddle.player_assets as Record<string, Record<string, unknown>> | undefined;
  if (!assets) return {} as TrackerData["cosmetics"];

  const subCategoryMap = buildSubCategoryMap(fiddle);
  const result = {} as Record<CosmeticId, TrackerData["cosmetics"][CosmeticId]>;
  const unknownSlots = new Map<string, number>();

  for (const [id, asset] of Object.entries(assets)) {
    if (id === "default") continue;

    const uiSlot = asset.ui_slot as string | undefined;
    const slot = normalizeSlot(uiSlot ?? id, id);

    const cleaned = uiSlot?.replace(/_gear$/, "");
    const KNOWN_COMPOSITE_SLOTS = new Set(["bottom"]);
    if (
      uiSlot &&
      cleaned &&
      !VALID_SLOTS.has(cleaned as CosmeticSlot) &&
      !(cleaned in SLOT_ALIASES) &&
      !KNOWN_COMPOSITE_SLOTS.has(cleaned)
    ) {
      unknownSlots.set(uiSlot, (unknownSlots.get(uiSlot) ?? 0) + 1);
    }

    const uiSubCategory = asset.ui_sub_category as string | undefined;
    const subCategory = uiSubCategory
      ? (subCategoryMap[uiSubCategory] ?? titleCase(uiSubCategory))
      : undefined;

    result[id as CosmeticId] = {
      defaultUnlocked: (asset.default_unlocked as boolean | undefined) ?? false,
      name: (asset.name as string | undefined) ?? id,
      slot,
      ...(subCategory && { subCategory }),
    };
  }

  if (unknownSlots.size > 0) {
    console.log(
      `  Cosmetics: ${Object.keys(result).length} (unknown ui_slots: ${[...unknownSlots.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`,
    );
  } else {
    console.log(`  Cosmetics: ${Object.keys(result).length}`);
  }
  return result;
}

function buildSubCategoryMap(fiddle: ParsedGameData): Record<string, string> {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const subMenus = menus?.sub_menus as Record<string, unknown> | undefined;
  const customization = subMenus?.customization as
    | Record<string, Record<string, { key?: string; name?: string }>>
    | undefined;
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
  const cleaned = raw.replace(/_gear$/, "");
  if (VALID_SLOTS.has(cleaned as CosmeticSlot)) return cleaned as CosmeticSlot;

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
