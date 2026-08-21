import type {
  PetCosmeticSet,
  PetCosmeticSetId,
  PetSkin,
  PetSkinId,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPetCosmetics(
  fiddle: ParsedGameData,
): Record<PetCosmeticSetId, PetCosmeticSet> {
  const pets = fiddle.pets as Record<string, unknown> | undefined;
  const sets = pets?.cosmetic_sets as Record<string, Record<string, unknown>> | undefined;
  if (!sets) return {};

  const result = {} as Record<PetCosmeticSetId, PetCosmeticSet>;
  for (const [id, set] of Object.entries(sets)) {
    const name = (set.name as string | undefined) ?? titleCase(id);
    result[id as PetCosmeticSetId] = { name, sources: [] };
  }

  console.log(`  Pet cosmetic sets: ${Object.keys(result).length}`);
  return result;
}

export function extractPetSkins(fiddle: ParsedGameData): Record<PetSkinId, PetSkin> {
  const items = fiddle.items as Record<string, Record<string, unknown>> | undefined;
  if (!items) return {};

  const result = {} as Record<PetSkinId, PetSkin>;
  for (const [, item] of Object.entries(items)) {
    if (typeof item !== "object" || item === null) continue;
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (!skinUnlock) continue;

    const rawName = (item.name as string | undefined) ?? skinUnlock;
    const name = rawName.replace(/^Pet Skin:\s*/i, "");
    result[skinUnlock as PetSkinId] = { name, sources: [] };
  }

  console.log(`  Pet skins: ${Object.keys(result).length}`);
  return result;
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
