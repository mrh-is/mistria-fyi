import type {
  AnimalId,
  CosmeticId,
  Season,
  TrackerData,
  VariantId,
} from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractAnimals(fiddle: FiddleData): TrackerData["animals"] {
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  if (!animals) return {} as TrackerData["animals"];

  const result = {} as Record<AnimalId, TrackerData["animals"][AnimalId]>;

  for (const [id, animal] of Object.entries(animals)) {
    if (id === "default") continue;

    const core = animal.core as Record<string, unknown> | undefined;
    const rawVariants = animal.variants as Record<string, Record<string, unknown>> | undefined;
    const rawCosmetics = animal.cosmetics as Record<string, Record<string, unknown>> | undefined;

    // Extract variants
    const variants = {} as Record<
      VariantId,
      TrackerData["animals"][AnimalId]["variants"][VariantId]
    >;
    if (rawVariants) {
      for (const [vid, v] of Object.entries(rawVariants)) {
        variants[vid as VariantId] = {
          bornIn: (v.born_in as Season | undefined) ?? undefined,
          defaultUnlocked: (v.default_unlocked as boolean | undefined) ?? false,
          name: (v.name as string | undefined) ?? vid,
          tier: v.tier as number | undefined,
        };
      }
    }

    // Extract cosmetics
    const cosmetics = {} as Record<CosmeticId, { name: string }>;
    if (rawCosmetics) {
      for (const [cid, c] of Object.entries(rawCosmetics)) {
        cosmetics[cid as CosmeticId] = {
          name: (c.name as string | undefined) ?? cid,
        };
      }
    }

    result[id as AnimalId] = {
      cosmetics,
      name: (core?.name as string | undefined) ?? id,
      variants,
    };
  }

  console.log(
    `  Animals: ${Object.keys(result).length} types, ` +
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.variants).length, 0)} variants, ` +
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.cosmetics).length, 0)} cosmetics`,
  );
  return result;
}
