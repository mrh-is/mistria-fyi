import { LOCALE_CODES } from "#lib/types/locale.js";

import type { Source, SourceTuple } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  Animal,
  AnimalCosmetic,
  AnimalId,
  AnimalVariant,
  AnimalVariantId,
  AnimalVariantTier,
  CosmeticId,
  TrackerData,
} from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

export interface AnimalExtraction {
  animals: TrackerData["animals"];
  localeNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * Normalizes ranching.animals into tracker species, omitting template and non-acquirable variants.
 * Variants are grouped into tiers; default-unlocked variants always land in tier 1.
 */
export function extractAnimals(fiddle: ParsedGameData, localizer: Localizer): AnimalExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  if (!animals) return { animals: {}, localeNames };

  const result = {} as Record<AnimalId, Animal>;
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
        const name = (v.name as string | undefined) ?? vid;
        bucket[vid as AnimalVariantId] = { source };
        localizeAnimalName(localeNames, localizer, id, "variants", vid, name);
      }
    }

    const sortedTiers = [...tierBuckets.entries()].toSorted(([a], [b]) => a - b);
    const variantTiers: AnimalVariantTier[] = sortedTiers.map(([, bucket]) => bucket);

    const speciesName = (core?.name as string | undefined) ?? id;
    localizeAnimalName(localeNames, localizer, id, "core", undefined, speciesName);
    const breedCosmetics = new Set<string>();
    if (rawVariants) {
      for (const [vid, v] of Object.entries(rawVariants)) {
        if (vid === "default") continue;
        const defaultCosmetic = v.default_cosmetic as string | undefined;
        if (defaultCosmetic) {
          breedCosmetics.add(defaultCosmetic);
        }
      }
    }

    const cosmetics = {} as Record<CosmeticId, AnimalCosmetic>;
    if (rawCosmetics) {
      for (const [cid, c] of Object.entries(rawCosmetics)) {
        if (cid === "default") continue;
        const rawName = (c.name as string | undefined) ?? cid;
        const stripped = rawName.replace(new RegExp(`\\b${speciesName}\\b\\s*`, "i"), "").trim();
        const sources: Source[] = breedCosmetics.has(cid) ? [{ type: "breed" }] : [];
        cosmetics[cid as CosmeticId] = { sources: sources as SourceTuple };
        localizeAnimalName(localeNames, localizer, id, "cosmetics", cid, stripped || rawName);
      }
    }

    result[id as AnimalId] = {
      cosmetics,
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
  return { animals: result, localeNames };
}

function localizeAnimalName(
  localeNames: Record<LocaleCode, Record<string, string>>,
  localizer: Localizer,
  animalId: string,
  section: "core" | "cosmetics" | "variants",
  id: string | undefined,
  englishValue: string,
): void {
  const { values } = localizer.localizeField({
    category: `ranching/animals/${animalId}`,
    classification: "localizable",
    englishValue,
    field: "name",
    id: id ? `${section}/${id}` : section,
  });
  const key = id ? `${animalId}/${section}/${id}` : `${animalId}/${section}`;
  for (const locale of LOCALE_CODES) localeNames[locale][key] = values[locale];
}
