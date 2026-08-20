import type { Source } from "$lib/types/acquisition.js";
import type {
  AnimalId,
  AnimalVariant,
  AnimalVariantId,
  AnimalVariantTier,
  CosmeticId,
  TrackerData,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Normalizes ranching.animals into tracker species, omitting template and non-acquirable variants.
 * Variants are grouped into tiers; default-unlocked variants always land in tier 1.
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

    const tierBuckets = new Map<number, Record<AnimalVariantId, AnimalVariant>>();
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
        const tier = isDefaultUnlocked ? 1 : ((v.tier as number | undefined) ?? 1);
        const source: Extract<Source, { type: "breed" | "default" }> = isDefaultUnlocked
          ? { type: "default" }
          : { type: "breed" };

        const bucket = tierBuckets.get(tier) ?? {};
        if (!tierBuckets.has(tier)) tierBuckets.set(tier, bucket);
        bucket[vid as AnimalVariantId] = {
          name: (v.name as string | undefined) ?? vid,
          source,
        };
      }
    }

    const sortedTiers = [...tierBuckets.entries()].sort(([a], [b]) => a - b);
    const variantTiers: AnimalVariantTier[] = sortedTiers.map(([, bucket]) => bucket);

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
      name: speciesName,
      variantTiers,
    };
  }

  const totalVariants = Object.values(result).reduce(
    (n, a) => n + a.variantTiers.reduce((m, t) => m + Object.keys(t).length, 0),
    0,
  );
  console.log(
    `  Animals: ${Object.keys(result).length} types, ` +
      `${totalVariants} variants ` +
      `(${skippedVariants} template/unacquirable variants skipped), ` +
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.cosmetics).length, 0)} cosmetics`,
  );
  return result;
}
