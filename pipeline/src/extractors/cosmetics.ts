import type { CosmeticId, CosmeticSlot, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

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

export function extractCosmetics(fiddle: FiddleData): TrackerData["cosmetics"] {
  const assets = fiddle.player_assets as Record<string, Record<string, unknown>> | undefined;
  if (!assets) return {} as TrackerData["cosmetics"];

  const result = {} as Record<CosmeticId, TrackerData["cosmetics"][CosmeticId]>;

  for (const [id, asset] of Object.entries(assets)) {
    if (id === "default") continue;

    const uiSlot = asset.ui_slot as string | undefined;
    const slot = normalizeSlot(uiSlot ?? id);

    result[id as CosmeticId] = {
      defaultUnlocked: (asset.default_unlocked as boolean | undefined) ?? false,
      name: (asset.name as string | undefined) ?? id,
      slot,
    };
  }

  console.log(`  Cosmetics: ${Object.keys(result).length}`);
  return result;
}

function normalizeSlot(raw: string): CosmeticSlot {
  // ui_slot values like "head_gear" → "head", "face_gear" → "face", "back_gear" → "back"
  const cleaned = raw.replace(/_gear$/, "");
  if (VALID_SLOTS.has(cleaned as CosmeticSlot)) return cleaned as CosmeticSlot;

  // Infer slot from ID prefix
  for (const slot of VALID_SLOTS) {
    if (raw.startsWith(slot)) return slot;
  }
  return "top"; // fallback
}
