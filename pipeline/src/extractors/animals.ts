import type {
  AnimalId,
  CosmeticId,
  Season,
  TrackerData,
  VariantId,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Normalizes ranching.animals into tracker species, omitting template and non-acquirable variants.
 * Default-unlocked variants always become tier one, and cosmetic labels remove the species name.
 */
export function extractAnimals(fiddle: ParsedGameData): TrackerData["animals"] {
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  if (!animals) return {};

  const result = {} as Record<AnimalId, TrackerData["animals"][AnimalId]>;
  let skippedVariants = 0;

  for (const [id, animal] of Object.entries(animals)) {
    if (id === "default") continue;

    const core = animal.core as Record<string, unknown> | undefined;
    const rawVariants = animal.variants as Record<string, Record<string, unknown>> | undefined;
    const rawCosmetics = animal.cosmetics as Record<string, Record<string, unknown>> | undefined;

    const variants = {} as Record<
      VariantId,
      TrackerData["animals"][AnimalId]["variants"][VariantId]
    >;
    if (rawVariants) {
      for (const [vid, v] of Object.entries(rawVariants)) {
        if (vid === "default") {
          skippedVariants++;
          continue;
        }
        if ((v.acquirable as boolean | undefined) === false) {
          skippedVariants++;
          continue;
        }
        const isDefaultUnlocked = (v.default_unlocked as boolean | undefined) ?? false;
        variants[vid as VariantId] = {
          bornIn: (v.born_in as Season | undefined) ?? undefined,
          name: (v.name as string | undefined) ?? vid,
          sources: isDefaultUnlocked ? [{ type: "default" }] : [],
          tier: isDefaultUnlocked ? 1 : (v.tier as number | undefined),
        };
      }
    }

    const speciesName = (core?.name as string | undefined) ?? id;
    const cosmetics = {} as Record<CosmeticId, { fullName: string; name: string }>;
    if (rawCosmetics) {
      for (const [cid, c] of Object.entries(rawCosmetics)) {
        if (cid === "default") continue;
        const rawName = (c.name as string | undefined) ?? cid;
        const stripped = rawName.replace(new RegExp(`\\b${speciesName}\\b\\s*`, "i"), "").trim();
        cosmetics[cid as CosmeticId] = {
          fullName: rawName,
          name: stripped || rawName,
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
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.variants).length, 0)} variants ` +
      `(${skippedVariants} template/unacquirable variants skipped), ` +
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.cosmetics).length, 0)} cosmetics`,
  );
  return result;
}
